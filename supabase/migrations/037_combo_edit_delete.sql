-- O combo pode trocar os itens numa única gravação e pode ser excluído depois de vendido.
-- A venda e a compra ficam com o nome do item.

alter table public.sale_items drop constraint sale_items_product_id_fkey;
alter table public.sale_items alter column product_id drop not null;
alter table public.sale_items
  add constraint sale_items_product_id_fkey
  foreign key (product_id) references public.products (id) on delete set null;

alter table public.purchase_items drop constraint purchase_items_product_id_fkey;
alter table public.purchase_items alter column product_id drop not null;
alter table public.purchase_items
  add constraint purchase_items_product_id_fkey
  foreign key (product_id) references public.products (id) on delete set null;

create or replace function public.update_combo(
  p_id uuid,
  p_name text,
  p_category text,
  p_price integer,
  p_cost integer,
  p_active boolean,
  p_lines jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_combo boolean;
  v_count integer;
begin
  if auth.uid() is null or not public.has_menu('produtos') then
    raise exception 'Sem permissão para alterar o combo';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Dê um nome ao combo';
  end if;
  if p_price is null or p_price < 0 or p_cost is null or p_cost < 0 then
    raise exception 'Informe o valor de venda';
  end if;

  select tenant_id, is_combo into v_tenant, v_combo
  from public.products
  where id = p_id
  for update;

  if not found or v_tenant is distinct from public.current_tenant() or not coalesce(v_combo, false) then
    raise exception 'Esse cadastro não é um combo';
  end if;
  if not exists (
    select 1 from public.categories
    where slug = trim(coalesce(p_category, '')) and tenant_id = v_tenant
  ) then
    raise exception 'Escolha a categoria';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'Monte o combo com produtos já cadastrados';
  end if;

  select count(distinct line.product_id) into v_count
  from jsonb_to_recordset(p_lines) as line(product_id uuid, quantity integer)
  where line.product_id is not null and line.quantity is not null and line.quantity > 0;

  if v_count < 2 or v_count is distinct from jsonb_array_length(p_lines) then
    raise exception 'Este cadastro é apenas para combos. Inclua dois ou mais produtos diferentes';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as line(product_id uuid, quantity integer)
    where line.product_id = p_id
  ) then
    raise exception 'O combo não pode incluir ele mesmo';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as line(product_id uuid, quantity integer)
    left join public.products product
      on product.id = line.product_id and product.tenant_id = v_tenant
    where product.id is null or product.is_combo
  ) then
    raise exception 'O combo só junta produtos simples, não outro combo';
  end if;

  perform set_config('snack.allow_stock', 'on', true);
  update public.products
  set name = trim(p_name),
      category = trim(p_category),
      sale_price_cents = p_price,
      cost_price_cents = p_cost,
      avg_cost_cents = p_cost,
      active = coalesce(p_active, true),
      is_combo = true
  where id = p_id;

  delete from public.product_components where combo_id = p_id;
  insert into public.product_components (combo_id, product_id, quantity)
  select p_id, line.product_id, line.quantity
  from jsonb_to_recordset(p_lines) as line(product_id uuid, quantity integer);
end;
$$;

create or replace function public.delete_combo(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_combo boolean;
  v_tenant uuid;
begin
  if auth.uid() is null or not public.has_menu('produtos') then
    raise exception 'Sem permissão para excluir o combo';
  end if;

  select name, is_combo, tenant_id into v_name, v_combo, v_tenant
  from public.products
  where id = p_id
  for update;

  if not found or v_tenant is distinct from public.current_tenant() then
    raise exception 'Combo não encontrado';
  end if;
  if not coalesce(v_combo, false) then
    raise exception 'Esse cadastro não é um combo';
  end if;

  delete from public.stock_movements
  where product_id = p_id
     or lot_id in (select id from public.stock_lots where product_id = p_id);
  delete from public.stock_lots where product_id = p_id;
  delete from public.product_components where combo_id = p_id or product_id = p_id;
  delete from public.products where id = p_id;

  perform public.append_tape('cadastro_produtos', 'Combo excluído: ' || coalesce(v_name, 'combo'));
end;
$$;

revoke all on function public.update_combo(uuid, text, text, integer, integer, boolean, jsonb) from public, anon;
grant execute on function public.update_combo(uuid, text, text, integer, integer, boolean, jsonb) to authenticated;
revoke all on function public.delete_combo(uuid) from public, anon;
grant execute on function public.delete_combo(uuid) to authenticated;
