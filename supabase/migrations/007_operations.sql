-- Fitas, combo, pagamento dividido, venda com caixa aberto e compra no saldo.
-- Rode este arquivo inteiro no SQL Editor, uma vez, depois do 006.

alter table public.products add column if not exists is_combo boolean not null default false;

create table if not exists public.product_components (
  combo_id uuid not null references public.products (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity integer not null check (quantity > 0),
  primary key (combo_id, product_id),
  check (combo_id <> product_id)
);

alter table public.sales drop constraint if exists sales_payment_method_check;
alter table public.sales
  add constraint sales_payment_method_check
  check (payment_method in ('dinheiro', 'pix', 'cartao', 'misto'));

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  payment_method text not null check (payment_method in ('dinheiro', 'pix', 'cartao')),
  amount_cents integer not null check (amount_cents > 0)
);

insert into public.sale_payments (sale_id, payment_method, amount_cents)
select s.id, s.payment_method, s.total_cents
from public.sales s
where s.total_cents > 0
  and s.payment_method in ('dinheiro', 'pix', 'cartao')
  and not exists (select 1 from public.sale_payments p where p.sale_id = s.id);

alter table public.purchases add column if not exists payment_method text;
update public.purchases set payment_method = 'dinheiro' where payment_method is null;
alter table public.purchases alter column payment_method set default 'dinheiro';
alter table public.purchases alter column payment_method set not null;
alter table public.purchases drop constraint if exists purchases_payment_method_check;
alter table public.purchases
  add constraint purchases_payment_method_check
  check (payment_method in ('dinheiro', 'pix', 'cartao', 'saldo'));

create table if not exists public.audit_tape (
  id bigint generated always as identity primary key,
  module text not null check (module in ('caixa_vendas', 'compras_estoque', 'perfis')),
  summary text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists audit_tape_module_idx on public.audit_tape (module, id desc);

alter table public.product_components enable row level security;
alter table public.sale_payments enable row level security;
alter table public.audit_tape enable row level security;

drop policy if exists "ler componentes" on public.product_components;
create policy "ler componentes" on public.product_components for select to authenticated using (true);
drop policy if exists "gravar componentes" on public.product_components;
create policy "gravar componentes" on public.product_components for all to authenticated using (true) with check (true);

drop policy if exists "ler pagamentos da venda" on public.sale_payments;
create policy "ler pagamentos da venda" on public.sale_payments for select to authenticated using (true);

drop policy if exists "ler fita" on public.audit_tape;
create policy "ler fita" on public.audit_tape for select to authenticated using (public.is_admin());

drop policy if exists "admin grava campos" on public.category_fields;
create policy "admin grava campos" on public.category_fields
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin grava categorias" on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke insert, update, delete on public.sale_payments from anon, authenticated;
revoke insert, update, delete on public.audit_tape from anon, authenticated;

create or replace function public.append_tape(p_module text, p_summary text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  if p_module not in ('caixa_vendas', 'compras_estoque', 'perfis') then
    raise exception 'Fita inválida';
  end if;
  if char_length(trim(coalesce(p_summary, ''))) < 2 then
    raise exception 'Resumo inválido';
  end if;
  insert into public.audit_tape (module, summary, created_by)
  values (p_module, trim(p_summary), auth.uid());
end;
$$;

grant execute on function public.append_tape(text, text) to authenticated;

create or replace function public.tape_sale()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_tape (module, summary, created_by)
  values ('caixa_vendas', 'Venda ' || trim(to_char(new.total_cents / 100.0, 'FM999990.00')) || ' · ' || new.payment_method, new.created_by);
  return new;
end;
$$;

drop trigger if exists tape_sales on public.sales;
create trigger tape_sales after insert on public.sales
for each row execute function public.tape_sale();

create or replace function public.tape_purchase()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_tape (module, summary, created_by)
  values ('compras_estoque', 'Compra ' || trim(to_char(new.total_cents / 100.0, 'FM999990.00')) || ' · ' || new.payment_method, new.created_by);
  return new;
end;
$$;

drop trigger if exists tape_purchases on public.purchases;
create trigger tape_purchases after insert on public.purchases
for each row execute function public.tape_purchase();

create or replace function public.tape_cash_session()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_tape (module, summary, created_by)
    values ('caixa_vendas', 'Abertura de caixa ' || trim(to_char(new.opening_cents / 100.0, 'FM999990.00')), new.opened_by);
  elsif old.closed_at is null and new.closed_at is not null then
    insert into public.audit_tape (module, summary, created_by)
    values ('caixa_vendas', 'Fechamento de caixa ' || trim(to_char(coalesce(new.counted_cents, 0) / 100.0, 'FM999990.00')), new.closed_by);
  end if;
  return new;
end;
$$;

drop trigger if exists tape_cash_sessions on public.cash_sessions;
create trigger tape_cash_sessions after insert or update on public.cash_sessions
for each row execute function public.tape_cash_session();

create or replace function public.tape_cash_movement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_tape (module, summary, created_by)
  values (
    'caixa_vendas',
    case when new.kind = 'entrada' then 'Entrada' else 'Retirada' end
      || ' ' || trim(to_char(new.amount_cents / 100.0, 'FM999990.00')) || ' · ' || new.note,
    new.created_by
  );
  return new;
end;
$$;

drop trigger if exists tape_cash_movements on public.cash_movements;
create trigger tape_cash_movements after insert on public.cash_movements
for each row execute function public.tape_cash_movement();

create or replace function public.tape_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  select name into v_name from public.products where id = new.product_id;
  insert into public.audit_tape (module, summary, created_by)
  values (
    'compras_estoque',
    case when new.direction = 'entrada' then 'Entrada' else 'Saída' end
      || ' de estoque · ' || coalesce(v_name, 'produto') || ' · ' || new.quantity || ' un',
    new.created_by
  );
  return new;
end;
$$;

drop trigger if exists tape_stock_movements on public.stock_movements;
create trigger tape_stock_movements after insert on public.stock_movements
for each row execute function public.tape_stock();

create or replace function public.tape_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_tape (module, summary, created_by)
    values ('perfis', 'Usuário criado: ' || new.full_name || coalesce(' · ' || new.username, ''), new.id);
  elsif new.role is distinct from old.role or new.full_name is distinct from old.full_name or new.username is distinct from old.username then
    insert into public.audit_tape (module, summary, created_by)
    values ('perfis', 'Perfil atualizado: ' || new.full_name || ' · ' || coalesce(new.role, ''), auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists tape_profiles on public.profiles;
create trigger tape_profiles after insert or update on public.profiles
for each row execute function public.tape_profile();

drop function if exists public.register_sale(text, text, jsonb);

create function public.register_sale(
  p_payment_method text,
  p_note text,
  p_items jsonb,
  p_payments jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_total integer := 0;
  v_paid integer := 0;
  v_method text;
  r record;
  v_name text;
  v_price integer;
  v_combo boolean;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  if not exists (select 1 from public.cash_sessions where closed_at is null) then
    raise exception 'Abra o caixa antes de registrar a venda';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A venda precisa de pelo menos um item';
  end if;

  create temp table if not exists _sale_lines (
    product_id uuid, quantity integer, name text, unit_price integer, line_total integer
  ) on commit drop;
  truncate _sale_lines;

  create temp table if not exists _stock_need (product_id uuid, quantity integer) on commit drop;
  truncate _stock_need;

  for r in
    select (item->>'product_id')::uuid as product_id, (item->>'quantity')::integer as quantity
    from jsonb_array_elements(p_items) as item
  loop
    if r.quantity is null or r.quantity <= 0 then
      raise exception 'Quantidade inválida';
    end if;
    select p.name, p.sale_price_cents, p.is_combo into v_name, v_price, v_combo
    from public.products p
    where p.id = r.product_id and p.active
    for update;
    if not found then
      raise exception 'Produto indisponível';
    end if;
    insert into _sale_lines (product_id, quantity, name, unit_price, line_total)
    values (r.product_id, r.quantity, v_name, v_price, v_price * r.quantity);

    if v_combo then
      insert into _stock_need (product_id, quantity)
      select c.product_id, r.quantity * c.quantity
      from public.product_components c
      where c.combo_id = r.product_id;
    else
      insert into _stock_need (product_id, quantity) values (r.product_id, r.quantity);
    end if;
  end loop;

  if exists (
    select 1 from _stock_need n
    join public.products p on p.id = n.product_id
    group by p.id, p.stock_quantity
    having sum(n.quantity) > p.stock_quantity
  ) then
    raise exception 'Estoque insuficiente para um ou mais produtos';
  end if;

  select coalesce(sum(line_total), 0) into v_total from _sale_lines;

  create temp table if not exists _pays (method text, amount integer) on commit drop;
  truncate _pays;

  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    if not exists (
      select 1 from public.payment_methods
      where id = p_payment_method and kind = 'recebimento' and active
    ) then
      raise exception 'Forma de recebimento inválida';
    end if;
    insert into _pays (method, amount) values (p_payment_method, v_total);
  else
    insert into _pays (method, amount)
    select item->>'method', (item->>'amount_cents')::integer
    from jsonb_array_elements(p_payments) as item;
  end if;

  if exists (
    select 1 from _pays pay
    where pay.amount is null or pay.amount <= 0
      or not exists (
        select 1 from public.payment_methods m
        where m.id = pay.method and m.kind = 'recebimento' and m.active
      )
  ) then
    raise exception 'Forma de recebimento inválida';
  end if;
  select coalesce(sum(amount), 0) into v_paid from _pays;
  if v_paid <> v_total then
    raise exception 'A soma dos pagamentos precisa ser igual ao total da venda';
  end if;

  select case when count(distinct method) = 1 then min(method) else 'misto' end into v_method from _pays;

  insert into public.sales (created_by, total_cents, payment_method, note)
  values (auth.uid(), v_total, v_method, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_sale_id;

  insert into public.sale_items (sale_id, product_id, product_name, quantity, unit_price_cents, total_cents)
  select v_sale_id, product_id, name, quantity, unit_price, line_total from _sale_lines;

  insert into public.sale_payments (sale_id, payment_method, amount_cents)
  select v_sale_id, method, sum(amount) from _pays group by method;

  perform set_config('snack.allow_stock', 'on', true);
  update public.products p
  set stock_quantity = p.stock_quantity - s.qty
  from (select product_id, sum(quantity)::integer as qty from _stock_need group by product_id) s
  where p.id = s.product_id;

  for r in select product_id, sum(quantity)::integer as qty from _stock_need group by product_id
  loop
    perform public.consume_stock_lots(r.product_id, r.qty);
  end loop;

  return v_sale_id;
end;
$$;

grant execute on function public.register_sale(text, text, jsonb, jsonb) to authenticated;

drop function if exists public.register_purchase(text, text, jsonb);

create function public.register_purchase(
  p_supplier text,
  p_note text,
  p_items jsonb,
  p_payment_method text default 'dinheiro'
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
  if not exists (
    select 1 from public.payment_methods
    where id = p_payment_method and kind = 'pagamento' and active
  ) then
    raise exception 'Forma de pagamento inválida';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A compra precisa de pelo menos um item';
  end if;

  create temp table if not exists _purchase_lines (
    product_id uuid, quantity integer, name text, unit_cost integer, line_total integer
  ) on commit drop;
  truncate _purchase_lines;

  for r in
    select
      (item->>'product_id')::uuid as product_id,
      (item->>'quantity')::integer as quantity,
      (item->>'unit_cost_cents')::integer as unit_cost
    from jsonb_array_elements(p_items) as item
  loop
    if r.quantity is null or r.quantity <= 0 then raise exception 'Quantidade inválida'; end if;
    if r.unit_cost is null or r.unit_cost < 0 then raise exception 'Custo inválido'; end if;
    select p.name into v_name from public.products p where p.id = r.product_id and not p.is_combo for update;
    if not found then raise exception 'Produto não encontrado'; end if;
    insert into _purchase_lines values (r.product_id, r.quantity, v_name, r.unit_cost, r.unit_cost * r.quantity);
  end loop;

  select coalesce(sum(line_total), 0) into v_total from _purchase_lines;

  insert into public.purchases (created_by, supplier, total_cents, note, payment_method)
  values (
    auth.uid(),
    nullif(trim(coalesce(p_supplier, '')), ''),
    v_total,
    nullif(trim(coalesce(p_note, '')), ''),
    p_payment_method
  )
  returning id into v_purchase_id;

  insert into public.purchase_items (purchase_id, product_id, product_name, quantity, unit_cost_cents, total_cents)
  select v_purchase_id, product_id, name, quantity, unit_cost, line_total from _purchase_lines;

  for r in
    select product_id, sum(quantity)::integer as quantity, sum(line_total)::integer as line_total
    from _purchase_lines group by product_id
  loop
    perform public.receive_stock_lot(
      r.product_id, r.quantity,
      case when r.quantity = 0 then 0 else round(r.line_total::numeric / r.quantity)::integer end,
      current_date, null, p_supplier, p_note, 'compra'
    );
  end loop;

  return v_purchase_id;
end;
$$;

grant execute on function public.register_purchase(text, text, jsonb, text) to authenticated;

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
  v_purchases integer;
begin
  if not public.is_admin() then
    return 0;
  end if;

  select opening_cents, opened_at, coalesce(closed_at, now())
    into v_open, v_from, v_to
  from public.cash_sessions where id = p_session_id;
  if v_from is null then return 0; end if;

  select coalesce(sum(sp.amount_cents), 0) into v_sales
  from public.sale_payments sp
  join public.sales s on s.id = sp.sale_id
  where sp.payment_method = 'dinheiro' and s.created_at >= v_from and s.created_at < v_to;

  select coalesce(sum(amount_cents) filter (where kind = 'entrada'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'retirada'), 0)
    into v_in, v_out
  from public.cash_movements
  where created_at >= v_from and created_at < v_to;

  select coalesce(sum(total_cents), 0) into v_purchases
  from public.purchases
  where payment_method in ('dinheiro', 'saldo')
    and created_at >= v_from and created_at < v_to;

  return v_open + v_sales + v_in - v_out - v_purchases;
end;
$$;

create or replace function public.account_balance()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_open integer;
  v_sales integer;
  v_in integer;
  v_out integer;
  v_purchases integer;
begin
  if not public.is_admin() then return 0; end if;
  select coalesce(sum(opening_cents), 0) into v_open from public.cash_sessions;
  select coalesce(sum(amount_cents), 0) into v_sales from public.sale_payments where payment_method = 'dinheiro';
  select coalesce(sum(amount_cents) filter (where kind = 'entrada'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'retirada'), 0)
    into v_in, v_out from public.cash_movements;
  select coalesce(sum(total_cents), 0) into v_purchases
  from public.purchases where payment_method in ('dinheiro', 'saldo');
  return v_open + v_sales + v_in - v_out - v_purchases;
end;
$$;

grant execute on function public.account_balance() to authenticated;
