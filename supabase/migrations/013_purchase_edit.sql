-- Liga cada item da compra ao lote e permite corrigir ou excluir a compra.

alter table public.purchase_items add column if not exists lot_id uuid references public.stock_lots (id) on delete set null;

with pairs as (
  select
    pi.id as item_id,
    sl.id as lot_id,
    row_number() over (partition by sl.id order by pi.id) as lot_n,
    row_number() over (partition by pi.id order by sl.created_at desc) as item_n
  from public.purchase_items pi
  join public.purchases pu on pu.id = pi.purchase_id
  join public.stock_lots sl
    on sl.product_id = pi.product_id
   and sl.unit_cost_cents = pi.unit_cost_cents
   and sl.quantity_initial = pi.quantity
   and sl.received_on = pu.purchased_on
  where pi.lot_id is null
)
update public.purchase_items pi
set lot_id = pairs.lot_id
from pairs
where pi.id = pairs.item_id
  and pairs.lot_n = 1
  and pairs.item_n = 1;

create or replace function public.refresh_product_from_lots(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock integer;
  v_avg integer;
  v_last integer;
begin
  select coalesce(sum(quantity_remaining), 0),
         case when coalesce(sum(quantity_remaining), 0) = 0 then 0
              else round(sum(quantity_remaining * unit_cost_cents)::numeric / sum(quantity_remaining))::integer
         end
    into v_stock, v_avg
  from public.stock_lots
  where product_id = p_product_id;

  select unit_cost_cents into v_last
  from public.stock_lots
  where product_id = p_product_id
  order by created_at desc
  limit 1;

  perform set_config('snack.allow_stock', 'on', true);
  update public.products
  set stock_quantity = v_stock,
      avg_cost_cents = v_avg,
      cost_price_cents = coalesce(v_last, cost_price_cents)
  where id = p_product_id;
end;
$$;

create or replace function public.release_purchase_lots(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_lot uuid;
  v_sold integer;
begin
  for r in
    select pi.id, pi.lot_id, pi.product_id, pi.quantity, pi.unit_cost_cents, pu.purchased_on
    from public.purchase_items pi
    join public.purchases pu on pu.id = pi.purchase_id
    where pi.purchase_id = p_purchase_id
  loop
    v_lot := r.lot_id;
    if v_lot is null then
      select sl.id into v_lot
      from public.stock_lots sl
      where sl.product_id = r.product_id
        and sl.unit_cost_cents = r.unit_cost_cents
        and sl.quantity_initial = r.quantity
        and sl.received_on = r.purchased_on
        and not exists (
          select 1 from public.purchase_items other
          where other.lot_id = sl.id and other.id <> r.id
        )
      order by sl.created_at desc
      limit 1;
    end if;
    if v_lot is null then
      raise exception 'Não encontrei o lote desta compra para corrigir o estoque';
    end if;
    select quantity_initial - quantity_remaining into v_sold
    from public.stock_lots where id = v_lot;
    if coalesce(v_sold, 0) > 0 then
      raise exception 'Parte desta compra já saiu do estoque. Não dá para alterar ou excluir.';
    end if;
    delete from public.stock_movements where lot_id = v_lot;
    update public.purchase_items set lot_id = null where id = r.id;
    delete from public.stock_lots where id = v_lot;
  end loop;

  for r in
    select distinct product_id from public.purchase_items where purchase_id = p_purchase_id
  loop
    perform public.refresh_product_from_lots(r.product_id);
  end loop;
end;
$$;

create or replace function public.register_purchase(
  p_supplier text,
  p_note text,
  p_items jsonb,
  p_payment_method text default 'dinheiro',
  p_purchased_on date default current_date,
  p_invoice_path text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_id uuid;
  v_total integer := 0;
  v_lot uuid;
  r record;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  if not public.is_admin() then
    raise exception 'Somente o administrador lança compras';
  end if;
  if p_purchased_on is null then
    raise exception 'Informe a data da compra';
  end if;
  if nullif(trim(coalesce(p_supplier, '')), '') is null then
    raise exception 'Informe o fornecedor';
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

  drop table if exists _purchase_lines;
  create temp table _purchase_lines (
    product_id uuid,
    quantity integer,
    name text,
    unit_cost integer,
    line_total integer,
    barcode text,
    expires_on date
  ) on commit drop;

  for r in
    select
      (item->>'product_id')::uuid as product_id,
      (item->>'quantity')::integer as quantity,
      (item->>'unit_cost_cents')::integer as unit_cost,
      nullif(trim(coalesce(item->>'barcode', '')), '') as barcode,
      nullif(item->>'expires_on', '')::date as expires_on
    from jsonb_array_elements(p_items) as item
  loop
    if r.quantity is null or r.quantity <= 0 then raise exception 'Quantidade inválida'; end if;
    if r.unit_cost is null or r.unit_cost < 0 then raise exception 'Valor unitário inválido'; end if;
    if r.expires_on is null then raise exception 'Informe a data de validade'; end if;
    if r.expires_on < p_purchased_on then raise exception 'A validade não pode ser anterior à compra'; end if;
    select p.name into v_name from public.products p where p.id = r.product_id and not p.is_combo for update;
    if not found then raise exception 'Escolha a descrição de um produto já cadastrado'; end if;
    insert into _purchase_lines values (r.product_id, r.quantity, v_name, r.unit_cost, r.unit_cost * r.quantity, r.barcode, r.expires_on);
  end loop;

  select coalesce(sum(line_total), 0) into v_total from _purchase_lines;

  insert into public.purchases (created_by, supplier, total_cents, note, payment_method, purchased_on, invoice_path)
  values (
    auth.uid(),
    nullif(trim(coalesce(p_supplier, '')), ''),
    v_total,
    nullif(trim(coalesce(p_note, '')), ''),
    p_payment_method,
    p_purchased_on,
    nullif(trim(coalesce(p_invoice_path, '')), '')
  )
  returning id into v_purchase_id;

  insert into public.purchase_items (purchase_id, product_id, product_name, quantity, unit_cost_cents, total_cents, barcode, expires_on)
  select v_purchase_id, product_id, name, quantity, unit_cost, line_total, barcode, expires_on from _purchase_lines;

  for r in
    select id, product_id, quantity, unit_cost_cents, expires_on, barcode
    from public.purchase_items
    where purchase_id = v_purchase_id
  loop
    v_lot := public.receive_stock_lot(
      r.product_id, r.quantity, r.unit_cost_cents,
      p_purchased_on, r.expires_on, p_supplier, r.barcode, 'compra'
    );
    update public.purchase_items set lot_id = v_lot where id = r.id;
  end loop;

  return v_purchase_id;
end;
$$;

create or replace function public.update_purchase(
  p_purchase_id uuid,
  p_supplier text,
  p_note text,
  p_items jsonb,
  p_payment_method text default 'dinheiro',
  p_purchased_on date default current_date,
  p_invoice_path text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_lot uuid;
  v_label text;
  r record;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if not public.is_admin() then raise exception 'Somente o administrador lança compras'; end if;
  if not exists (select 1 from public.purchases where id = p_purchase_id) then
    raise exception 'Compra não encontrada';
  end if;
  if p_purchased_on is null then raise exception 'Informe a data da compra'; end if;
  if nullif(trim(coalesce(p_supplier, '')), '') is null then raise exception 'Informe o fornecedor'; end if;
  if not exists (
    select 1 from public.payment_methods
    where id = p_payment_method and kind = 'pagamento' and active
  ) then
    raise exception 'Forma de pagamento inválida';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A compra precisa de pelo menos um item';
  end if;

  perform public.release_purchase_lots(p_purchase_id);

  drop table if exists _purchase_lines;
  create temp table _purchase_lines (
    product_id uuid,
    quantity integer,
    name text,
    unit_cost integer,
    line_total integer,
    barcode text,
    expires_on date
  ) on commit drop;

  for r in
    select
      (item->>'product_id')::uuid as product_id,
      (item->>'quantity')::integer as quantity,
      (item->>'unit_cost_cents')::integer as unit_cost,
      nullif(trim(coalesce(item->>'barcode', '')), '') as barcode,
      nullif(item->>'expires_on', '')::date as expires_on
    from jsonb_array_elements(p_items) as item
  loop
    if r.quantity is null or r.quantity <= 0 then raise exception 'Quantidade inválida'; end if;
    if r.unit_cost is null or r.unit_cost < 0 then raise exception 'Valor unitário inválido'; end if;
    if r.expires_on is null then raise exception 'Informe a data de validade'; end if;
    if r.expires_on < p_purchased_on then raise exception 'A validade não pode ser anterior à compra'; end if;
    select p.name into v_name from public.products p where p.id = r.product_id and not p.is_combo for update;
    if not found then raise exception 'Escolha a descrição de um produto já cadastrado'; end if;
    insert into _purchase_lines values (r.product_id, r.quantity, v_name, r.unit_cost, r.unit_cost * r.quantity, r.barcode, r.expires_on);
  end loop;

  select coalesce(sum(line_total), 0) into v_total from _purchase_lines;
  v_label := nullif(trim(coalesce(p_supplier, '')), '');

  update public.purchases
  set supplier = v_label,
      total_cents = v_total,
      note = nullif(trim(coalesce(p_note, '')), ''),
      payment_method = p_payment_method,
      purchased_on = p_purchased_on,
      invoice_path = coalesce(nullif(trim(coalesce(p_invoice_path, '')), ''), invoice_path)
  where id = p_purchase_id;

  delete from public.purchase_items where purchase_id = p_purchase_id;

  insert into public.purchase_items (purchase_id, product_id, product_name, quantity, unit_cost_cents, total_cents, barcode, expires_on)
  select p_purchase_id, product_id, name, quantity, unit_cost, line_total, barcode, expires_on from _purchase_lines;

  for r in
    select id, product_id, quantity, unit_cost_cents, expires_on, barcode
    from public.purchase_items
    where purchase_id = p_purchase_id
  loop
    v_lot := public.receive_stock_lot(
      r.product_id, r.quantity, r.unit_cost_cents,
      p_purchased_on, r.expires_on, p_supplier, r.barcode, 'compra'
    );
    update public.purchase_items set lot_id = v_lot where id = r.id;
  end loop;

  perform public.append_tape(
    'compras_estoque',
    'Compra alterada: ' || coalesce(v_label, 'sem fornecedor') || ' · ' || trim(to_char(v_total / 100.0, 'FM999990.00'))
  );
  return p_purchase_id;
end;
$$;

create or replace function public.delete_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier text;
  v_total integer;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if not public.is_admin() then raise exception 'Somente o administrador lança compras'; end if;
  select supplier, total_cents into v_supplier, v_total from public.purchases where id = p_purchase_id;
  if not found then raise exception 'Compra não encontrada'; end if;

  perform public.release_purchase_lots(p_purchase_id);
  perform public.append_tape(
    'compras_estoque',
    'Compra excluída: ' || coalesce(v_supplier, 'sem fornecedor') || ' · ' || trim(to_char(v_total / 100.0, 'FM999990.00'))
  );
  delete from public.purchases where id = p_purchase_id;
end;
$$;

grant execute on function public.register_purchase(text, text, jsonb, text, date, text) to authenticated;
grant execute on function public.update_purchase(uuid, text, text, jsonb, text, date, text) to authenticated;
grant execute on function public.delete_purchase(uuid) to authenticated;
