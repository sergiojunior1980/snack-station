-- A venda guarda o nome de quem estava logado. Duas vendas ao mesmo tempo travam o estoque na mesma ordem.

alter table public.sales add column if not exists seller_name text;

update public.sales s
set seller_name = coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.username), ''), 'Vendedor não identificado')
from public.profiles p
where s.created_by = p.id
  and (s.seller_name is null or btrim(s.seller_name) = '');

update public.sales
set seller_name = 'Vendedor não identificado'
where seller_name is null or btrim(seller_name) = '';

alter table public.sales alter column seller_name set default 'Vendedor não identificado';
alter table public.sales alter column seller_name set not null;

create or replace function public.stamp_sale_seller()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if new.seller_name is not null and btrim(new.seller_name) <> '' and new.seller_name <> 'Vendedor não identificado' then
    return new;
  end if;
  select coalesce(nullif(trim(full_name), ''), nullif(trim(username), ''), 'Vendedor não identificado')
    into v_name
  from public.profiles
  where id = new.created_by;
  new.seller_name := coalesce(v_name, 'Vendedor não identificado');
  return new;
end;
$$;

drop trigger if exists sales_stamp_seller on public.sales;
create trigger sales_stamp_seller
before insert on public.sales
for each row execute function public.stamp_sale_seller();

create or replace function public.tape_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_tape (module, summary, created_by)
  values (
    'caixa_vendas',
    'Venda ' || trim(to_char(new.total_cents / 100.0, 'FM999990.00'))
      || ' · ' || new.payment_method
      || ' · ' || coalesce(new.seller_name, 'Vendedor não identificado'),
    new.created_by
  );
  return new;
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
    where p.id = r.product_id and p.active;
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

  for r in
    select distinct product_id
    from _stock_need
    order by product_id
  loop
    perform 1 from public.products where id = r.product_id for update;
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

  for r in
    select product_id, sum(quantity)::integer as qty
    from _stock_need
    group by product_id
    order by product_id
  loop
    perform public.consume_stock_lots(r.product_id, r.qty);
  end loop;

  return v_sale_id;
end;
$$;

grant execute on function public.register_sale(text, text, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
