-- A fita de compra passa a listar os itens na inclusão, na edição e na exclusão.

create or replace function public.purchase_items_label(p_purchase_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(string_agg(
    pi.quantity::text || '× ' || pi.product_name || ' a R$ ' || replace(trim(to_char(pi.unit_cost_cents / 100.0, 'FM999990.00')), '.', ','),
    ', ' order by pi.product_name
  ), 'sem itens')
  from public.purchase_items pi
  where pi.purchase_id = p_purchase_id;
$$;

drop trigger if exists tape_purchases on public.purchases;

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
  v_label text;
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
  v_label := nullif(trim(coalesce(p_supplier, '')), '');

  insert into public.purchases (created_by, supplier, total_cents, note, payment_method, purchased_on, invoice_path)
  values (
    auth.uid(),
    v_label,
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

  perform public.append_tape(
    'compras_estoque',
    'Compra incluída: ' || coalesce(v_label, 'sem fornecedor') || ' · ' || public.purchase_items_label(v_purchase_id)
  );
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
  v_before text;
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

  v_before := public.purchase_items_label(p_purchase_id);
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
    'Compra alterada: ' || coalesce(v_label, 'sem fornecedor') || ' · de ' || v_before || ' para ' || public.purchase_items_label(p_purchase_id)
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
  v_items text;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if not public.is_admin() then raise exception 'Somente o administrador lança compras'; end if;
  select supplier into v_supplier from public.purchases where id = p_purchase_id;
  if not found then raise exception 'Compra não encontrada'; end if;
  v_items := public.purchase_items_label(p_purchase_id);

  perform public.release_purchase_lots(p_purchase_id);
  perform public.append_tape(
    'compras_estoque',
    'Compra excluída: ' || coalesce(v_supplier, 'sem fornecedor') || ' · ' || v_items
  );
  delete from public.purchases where id = p_purchase_id;
end;
$$;
