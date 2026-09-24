-- Caixa, movimentação financeira e estoque com custo médio.
-- Rode este arquivo inteiro no SQL Editor, uma vez, depois do 005.

alter table public.products add column if not exists avg_cost_cents integer;
update public.products set avg_cost_cents = cost_price_cents where avg_cost_cents is null;
alter table public.products alter column avg_cost_cents set default 0;
alter table public.products alter column avg_cost_cents set not null;
alter table public.products drop constraint if exists products_avg_cost_cents_check;
alter table public.products add constraint products_avg_cost_cents_check check (avg_cost_cents >= 0);

create or replace function public.guard_product_stock()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and (
    new.stock_quantity is distinct from old.stock_quantity
    or new.avg_cost_cents is distinct from old.avg_cost_cents
  ) then
    if current_setting('snack.allow_stock', true) is distinct from 'on' then
      raise exception 'O estoque e o custo médio só mudam pelos lançamentos do sistema';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid not null references auth.users (id),
  opened_at timestamptz not null default now(),
  opening_cents integer not null check (opening_cents >= 0),
  opening_note text,
  closed_by uuid references auth.users (id),
  closed_at timestamptz,
  counted_cents integer check (counted_cents is null or counted_cents >= 0),
  expected_cents integer,
  difference_cents integer,
  closing_note text
);

create unique index if not exists cash_sessions_one_open
  on public.cash_sessions ((true))
  where closed_at is null;

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.cash_sessions (id),
  kind text not null check (kind in ('entrada', 'retirada')),
  amount_cents integer not null check (amount_cents > 0),
  note text not null check (char_length(trim(note)) >= 3),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists cash_movements_created_at_idx on public.cash_movements (created_at desc);

create table if not exists public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  quantity_initial integer not null check (quantity_initial > 0),
  quantity_remaining integer not null check (quantity_remaining >= 0),
  unit_cost_cents integer not null check (unit_cost_cents >= 0),
  received_on date not null,
  expires_on date,
  supplier text,
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (expires_on is null or expires_on >= received_on)
);

create index if not exists stock_lots_product_idx on public.stock_lots (product_id, expires_on);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  lot_id uuid references public.stock_lots (id),
  direction text not null check (direction in ('entrada', 'saida')),
  quantity integer not null check (quantity > 0),
  unit_cost_cents integer not null check (unit_cost_cents >= 0),
  total_cost_cents integer not null check (total_cost_cents >= 0),
  received_on date,
  expires_on date,
  supplier text,
  reason text,
  note text,
  avg_cost_cents_after integer not null check (avg_cost_cents_after >= 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_created_at_idx on public.stock_movements (created_at desc);

insert into public.stock_lots (product_id, quantity_initial, quantity_remaining, unit_cost_cents, received_on, note)
select p.id, p.stock_quantity, p.stock_quantity, p.avg_cost_cents, current_date, 'Saldo já existente'
from public.products p
where p.stock_quantity > 0
  and not exists (select 1 from public.stock_lots l where l.product_id = p.id);

alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;
alter table public.stock_lots enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "ler caixa" on public.cash_sessions;
create policy "ler caixa" on public.cash_sessions for select to authenticated using (public.is_admin());
drop policy if exists "ler movimentos de caixa" on public.cash_movements;
create policy "ler movimentos de caixa" on public.cash_movements for select to authenticated using (public.is_admin());
drop policy if exists "ler lotes" on public.stock_lots;
create policy "ler lotes" on public.stock_lots for select to authenticated using (public.is_admin());
drop policy if exists "ler movimentos de estoque" on public.stock_movements;
create policy "ler movimentos de estoque" on public.stock_movements for select to authenticated using (public.is_admin());

revoke insert, update, delete on public.cash_sessions from anon, authenticated;
revoke insert, update, delete on public.cash_movements from anon, authenticated;
revoke insert, update, delete on public.stock_lots from anon, authenticated;
revoke insert, update, delete on public.stock_movements from anon, authenticated;

create or replace function public.consume_stock_lots(p_product_id uuid, p_quantity integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left integer := p_quantity;
  r record;
  v_take integer;
begin
  for r in
    select id, quantity_remaining
    from public.stock_lots
    where product_id = p_product_id and quantity_remaining > 0
    order by expires_on nulls last, received_on, created_at
    for update
  loop
    exit when v_left <= 0;
    v_take := least(r.quantity_remaining, v_left);
    update public.stock_lots set quantity_remaining = quantity_remaining - v_take where id = r.id;
    v_left := v_left - v_take;
  end loop;
end;
$$;

create or replace function public.receive_stock_lot(
  p_product_id uuid,
  p_quantity integer,
  p_unit_cost integer,
  p_received_on date,
  p_expires_on date,
  p_supplier text,
  p_note text,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock integer;
  v_avg integer;
  v_new_avg integer;
  v_lot_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade inválida';
  end if;
  if p_unit_cost is null or p_unit_cost < 0 then
    raise exception 'Custo inválido';
  end if;
  if p_expires_on is not null and p_received_on is not null and p_expires_on < p_received_on then
    raise exception 'A validade não pode ser anterior à entrada';
  end if;

  select stock_quantity, avg_cost_cents into v_stock, v_avg
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Produto não encontrado';
  end if;

  v_new_avg := round(((v_stock * v_avg) + (p_quantity * p_unit_cost))::numeric / (v_stock + p_quantity))::integer;

  perform set_config('snack.allow_stock', 'on', true);
  update public.products
  set stock_quantity = stock_quantity + p_quantity,
      avg_cost_cents = v_new_avg,
      cost_price_cents = p_unit_cost
  where id = p_product_id;

  insert into public.stock_lots (
    product_id, quantity_initial, quantity_remaining, unit_cost_cents, received_on, expires_on, supplier, note, created_by
  ) values (
    p_product_id, p_quantity, p_quantity, p_unit_cost, coalesce(p_received_on, current_date), p_expires_on,
    nullif(trim(coalesce(p_supplier, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    auth.uid()
  ) returning id into v_lot_id;

  insert into public.stock_movements (
    product_id, lot_id, direction, quantity, unit_cost_cents, total_cost_cents,
    received_on, expires_on, supplier, reason, note, avg_cost_cents_after, created_by
  ) values (
    p_product_id, v_lot_id, 'entrada', p_quantity, p_unit_cost, p_unit_cost * p_quantity,
    coalesce(p_received_on, current_date), p_expires_on,
    nullif(trim(coalesce(p_supplier, '')), ''),
    nullif(trim(coalesce(p_reason, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    v_new_avg,
    auth.uid()
  );

  return v_lot_id;
end;
$$;

create or replace function public.register_sale(
  p_payment_method text,
  p_note text,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_total integer := 0;
  r record;
  v_name text;
  v_price integer;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  if p_payment_method not in ('dinheiro', 'pix', 'cartao') then
    raise exception 'Forma de pagamento inválida';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A venda precisa de pelo menos um item';
  end if;

  create temp table if not exists _sale_lines (
    product_id uuid,
    quantity integer,
    name text,
    unit_price integer,
    line_total integer
  ) on commit drop;
  truncate _sale_lines;

  for r in
    select (item->>'product_id')::uuid as product_id, (item->>'quantity')::integer as quantity
    from jsonb_array_elements(p_items) as item
  loop
    if r.quantity is null or r.quantity <= 0 then
      raise exception 'Quantidade inválida';
    end if;
    select p.name, p.sale_price_cents into v_name, v_price
    from public.products p
    where p.id = r.product_id and p.active
    for update;
    if not found then
      raise exception 'Produto indisponível';
    end if;
    insert into _sale_lines (product_id, quantity, name, unit_price, line_total)
    values (r.product_id, r.quantity, v_name, v_price, v_price * r.quantity);
  end loop;

  if exists (
    select 1
    from _sale_lines l
    join public.products p on p.id = l.product_id
    group by p.id, p.stock_quantity
    having sum(l.quantity) > p.stock_quantity
  ) then
    raise exception 'Estoque insuficiente para um ou mais produtos';
  end if;

  select coalesce(sum(line_total), 0) into v_total from _sale_lines;

  insert into public.sales (created_by, total_cents, payment_method, note)
  values (auth.uid(), v_total, p_payment_method, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_sale_id;

  insert into public.sale_items (sale_id, product_id, product_name, quantity, unit_price_cents, total_cents)
  select v_sale_id, product_id, name, quantity, unit_price, line_total
  from _sale_lines;

  perform set_config('snack.allow_stock', 'on', true);
  update public.products p
  set stock_quantity = p.stock_quantity - s.qty
  from (
    select product_id, sum(quantity)::integer as qty
    from _sale_lines
    group by product_id
  ) s
  where p.id = s.product_id;

  for r in
    select product_id, sum(quantity)::integer as qty
    from _sale_lines
    group by product_id
  loop
    perform public.consume_stock_lots(r.product_id, r.qty);
  end loop;

  return v_sale_id;
end;
$$;

create or replace function public.register_purchase(
  p_supplier text,
  p_note text,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_id uuid;
  v_total integer := 0;
  r record;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  if not public.is_admin() then
    raise exception 'Somente o administrador lança compras';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A compra precisa de pelo menos um item';
  end if;

  create temp table if not exists _purchase_lines (
    product_id uuid,
    quantity integer,
    name text,
    unit_cost integer,
    line_total integer
  ) on commit drop;
  truncate _purchase_lines;

  for r in
    select
      (item->>'product_id')::uuid as product_id,
      (item->>'quantity')::integer as quantity,
      (item->>'unit_cost_cents')::integer as unit_cost
    from jsonb_array_elements(p_items) as item
  loop
    if r.quantity is null or r.quantity <= 0 then
      raise exception 'Quantidade inválida';
    end if;
    if r.unit_cost is null or r.unit_cost < 0 then
      raise exception 'Custo inválido';
    end if;
    select p.name into v_name from public.products p where p.id = r.product_id for update;
    if not found then
      raise exception 'Produto não encontrado';
    end if;
    insert into _purchase_lines (product_id, quantity, name, unit_cost, line_total)
    values (r.product_id, r.quantity, v_name, r.unit_cost, r.unit_cost * r.quantity);
  end loop;

  select coalesce(sum(line_total), 0) into v_total from _purchase_lines;

  insert into public.purchases (created_by, supplier, total_cents, note)
  values (
    auth.uid(),
    nullif(trim(coalesce(p_supplier, '')), ''),
    v_total,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_purchase_id;

  insert into public.purchase_items (purchase_id, product_id, product_name, quantity, unit_cost_cents, total_cents)
  select v_purchase_id, product_id, name, quantity, unit_cost, line_total
  from _purchase_lines;

  for r in
    select product_id, sum(quantity)::integer as quantity, sum(line_total)::integer as line_total
    from _purchase_lines
    group by product_id
  loop
    perform public.receive_stock_lot(
      r.product_id,
      r.quantity,
      case when r.quantity = 0 then 0 else round(r.line_total::numeric / r.quantity)::integer end,
      current_date,
      null,
      p_supplier,
      p_note,
      'compra'
    );
  end loop;

  return v_purchase_id;
end;
$$;

create or replace function public.register_stock_move(
  p_product_id uuid,
  p_direction text,
  p_quantity integer,
  p_unit_cost_cents integer,
  p_received_on date,
  p_expires_on date,
  p_supplier text,
  p_reason text,
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock integer;
  v_avg integer;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  if not public.is_admin() then
    raise exception 'Somente o administrador movimenta o estoque';
  end if;
  if p_direction not in ('entrada', 'saida') then
    raise exception 'Movimento inválido';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade inválida';
  end if;

  if p_direction = 'entrada' then
    return public.receive_stock_lot(
      p_product_id,
      p_quantity,
      p_unit_cost_cents,
      coalesce(p_received_on, current_date),
      p_expires_on,
      p_supplier,
      p_note,
      'entrada'
    );
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Informe o motivo da saída';
  end if;

  select stock_quantity, avg_cost_cents into v_stock, v_avg
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Produto não encontrado';
  end if;
  if v_stock < p_quantity then
    raise exception 'Estoque insuficiente para um ou mais produtos';
  end if;

  perform set_config('snack.allow_stock', 'on', true);
  update public.products set stock_quantity = stock_quantity - p_quantity where id = p_product_id;
  perform public.consume_stock_lots(p_product_id, p_quantity);

  insert into public.stock_movements (
    product_id, direction, quantity, unit_cost_cents, total_cost_cents,
    reason, note, avg_cost_cents_after, created_by
  ) values (
    p_product_id, 'saida', p_quantity, v_avg, v_avg * p_quantity,
    trim(p_reason),
    nullif(trim(coalesce(p_note, '')), ''),
    v_avg,
    auth.uid()
  );

  return p_product_id;
end;
$$;

create or replace function public.open_cash_session(p_opening_cents integer, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Somente o administrador abre o caixa';
  end if;
  if p_opening_cents is null or p_opening_cents < 0 then
    raise exception 'Valor de abertura inválido';
  end if;
  if exists (select 1 from public.cash_sessions where closed_at is null) then
    raise exception 'Já existe um caixa aberto';
  end if;

  insert into public.cash_sessions (opened_by, opening_cents, opening_note)
  values (auth.uid(), p_opening_cents, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cash_expected(p_session_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_open integer;
  v_from timestamptz;
  v_to timestamptz;
  v_sales integer;
  v_in integer;
  v_out integer;
begin
  if not public.is_admin() then
    return 0;
  end if;

  select opening_cents, opened_at, coalesce(closed_at, now())
    into v_open, v_from, v_to
  from public.cash_sessions
  where id = p_session_id;

  if v_from is null then
    return 0;
  end if;

  select coalesce(sum(total_cents), 0) into v_sales
  from public.sales
  where payment_method = 'dinheiro' and created_at >= v_from and created_at < v_to;

  select coalesce(sum(amount_cents) filter (where kind = 'entrada'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'retirada'), 0)
    into v_in, v_out
  from public.cash_movements
  where created_at >= v_from and created_at < v_to;

  return v_open + v_sales + v_in - v_out;
end;
$$;

create or replace function public.close_cash_session(p_counted_cents integer, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_expected integer;
begin
  if not public.is_admin() then
    raise exception 'Somente o administrador fecha o caixa';
  end if;
  if p_counted_cents is null or p_counted_cents < 0 then
    raise exception 'Valor contado inválido';
  end if;

  select id into v_id
  from public.cash_sessions
  where closed_at is null
  for update;

  if v_id is null then
    raise exception 'Não há caixa aberto';
  end if;

  v_expected := public.cash_expected(v_id);

  update public.cash_sessions
  set closed_by = auth.uid(),
      closed_at = now(),
      counted_cents = p_counted_cents,
      expected_cents = v_expected,
      difference_cents = p_counted_cents - v_expected,
      closing_note = nullif(trim(coalesce(p_note, '')), '')
  where id = v_id;

  return v_id;
end;
$$;

create or replace function public.register_cash_movement(p_kind text, p_amount_cents integer, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_session uuid;
begin
  if not public.is_admin() then
    raise exception 'Somente o administrador lança entrada e retirada';
  end if;
  if p_kind not in ('entrada', 'retirada') then
    raise exception 'Movimento inválido';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Valor inválido';
  end if;
  if char_length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Informe a observação do movimento';
  end if;

  select id into v_session from public.cash_sessions where closed_at is null;

  insert into public.cash_movements (session_id, kind, amount_cents, note, created_by)
  values (v_session, p_kind, p_amount_cents, trim(p_note), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.open_cash_session(integer, text) to authenticated;
grant execute on function public.close_cash_session(integer, text) to authenticated;
grant execute on function public.register_cash_movement(text, integer, text) to authenticated;
grant execute on function public.cash_expected(uuid) to authenticated;
grant execute on function public.register_stock_move(uuid, text, integer, integer, date, date, text, text, text) to authenticated;
grant execute on function public.register_sale(text, text, jsonb) to authenticated;
grant execute on function public.register_purchase(text, text, jsonb) to authenticated;
