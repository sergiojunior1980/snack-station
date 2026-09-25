-- Data da compra, validade e código de barras por item, imagem da nota.

alter table public.purchases add column if not exists purchased_on date;
update public.purchases set purchased_on = (created_at at time zone 'America/Sao_Paulo')::date where purchased_on is null;
alter table public.purchases alter column purchased_on set default current_date;
alter table public.purchases alter column purchased_on set not null;

alter table public.purchases add column if not exists invoice_path text;

alter table public.purchase_items add column if not exists barcode text;
alter table public.purchase_items add column if not exists expires_on date;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notas', 'notas', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "admin envia nota" on storage.objects;
create policy "admin envia nota" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'notas' and public.is_admin());

drop policy if exists "admin le nota" on storage.objects;
create policy "admin le nota" on storage.objects
  for select to authenticated
  using (bucket_id = 'notas' and public.is_admin());

drop function if exists public.register_purchase(text, text, jsonb, text);

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
    select product_id, quantity, unit_cost, expires_on, barcode
    from _purchase_lines
  loop
    perform public.receive_stock_lot(
      r.product_id, r.quantity, r.unit_cost,
      p_purchased_on, r.expires_on, p_supplier, r.barcode, 'compra'
    );
  end loop;

  return v_purchase_id;
end;
$$;

grant execute on function public.register_purchase(text, text, jsonb, text, date, text) to authenticated;
