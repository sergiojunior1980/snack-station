-- Formas de recebimento (venda) e de pagamento (compra).
-- Rode este arquivo inteiro no SQL Editor, uma vez, depois do 007.

create table if not exists public.payment_methods (
  id text not null,
  name text not null,
  kind text not null check (kind in ('recebimento', 'pagamento')),
  counts_as_cash boolean not null default false,
  settles_balance boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  primary key (kind, id)
);

insert into public.payment_methods (id, name, kind, counts_as_cash, settles_balance, sort_order) values
  ('dinheiro', 'Dinheiro', 'recebimento', true, false, 1),
  ('pix', 'PIX', 'recebimento', false, false, 2),
  ('cartao', 'Cartão', 'recebimento', false, false, 3),
  ('dinheiro', 'Dinheiro', 'pagamento', false, true, 1),
  ('pix', 'PIX', 'pagamento', false, false, 2),
  ('cartao', 'Cartão', 'pagamento', false, false, 3),
  ('saldo', 'Saldo da conta', 'pagamento', false, true, 4)
on conflict (kind, id) do nothing;

alter table public.sales drop constraint if exists sales_payment_method_check;
alter table public.sale_payments drop constraint if exists sale_payments_payment_method_check;
alter table public.purchases drop constraint if exists purchases_payment_method_check;

alter table public.payment_methods enable row level security;
drop policy if exists "ler formas" on public.payment_methods;
create policy "ler formas" on public.payment_methods for select to authenticated using (true);
drop policy if exists "admin grava formas" on public.payment_methods;
create policy "admin grava formas" on public.payment_methods
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

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
  join public.payment_methods m on m.id = sp.payment_method and m.kind = 'recebimento' and m.counts_as_cash
  where s.created_at >= v_from and s.created_at < v_to;

  select coalesce(sum(amount_cents) filter (where kind = 'entrada'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'retirada'), 0)
    into v_in, v_out
  from public.cash_movements
  where created_at >= v_from and created_at < v_to;

  select coalesce(sum(p.total_cents), 0) into v_purchases
  from public.purchases p
  join public.payment_methods m on m.id = p.payment_method and m.kind = 'pagamento' and m.settles_balance
  where p.created_at >= v_from and p.created_at < v_to;

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
  select coalesce(sum(sp.amount_cents), 0) into v_sales
  from public.sale_payments sp
  join public.payment_methods m on m.id = sp.payment_method and m.kind = 'recebimento' and m.counts_as_cash;
  select coalesce(sum(amount_cents) filter (where kind = 'entrada'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'retirada'), 0)
    into v_in, v_out from public.cash_movements;
  select coalesce(sum(p.total_cents), 0) into v_purchases
  from public.purchases p
  join public.payment_methods m on m.id = p.payment_method and m.kind = 'pagamento' and m.settles_balance;
  return v_open + v_sales + v_in - v_out - v_purchases;
end;
$$;
create or replace function public.register_sale(
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

create or replace function public.register_purchase(
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
