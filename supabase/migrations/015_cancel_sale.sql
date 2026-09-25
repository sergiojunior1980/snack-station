-- Cancela uma venda: devolve o estoque aos lotes e grava o estorno na fita.

create or replace function public.restore_stock_lots(p_product_id uuid, p_quantity integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left integer := p_quantity;
  v_room integer;
  v_take integer;
  v_cost integer;
  r record;
begin
  if p_quantity is null or p_quantity <= 0 then
    return;
  end if;

  perform 1 from public.products where id = p_product_id for update;

  for r in
    select id, quantity_initial, quantity_remaining
    from public.stock_lots
    where product_id = p_product_id
      and quantity_remaining < quantity_initial
    order by expires_on desc nulls first, received_on desc, created_at desc
    for update
  loop
    exit when v_left <= 0;
    v_room := r.quantity_initial - r.quantity_remaining;
    v_take := least(v_room, v_left);
    update public.stock_lots
    set quantity_remaining = quantity_remaining + v_take
    where id = r.id;
    v_left := v_left - v_take;
  end loop;

  if v_left > 0 then
    select avg_cost_cents into v_cost from public.products where id = p_product_id;
    perform public.receive_stock_lot(
      p_product_id,
      v_left,
      coalesce(v_cost, 0),
      current_date,
      null,
      null,
      null,
      'estorno de venda'
    );
  end if;

  perform public.refresh_product_from_lots(p_product_id);
end;
$$;

create or replace function public.cancel_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  c record;
  v_combo boolean;
  v_items text;
  v_pays text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  perform 1 from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Venda não encontrada';
  end if;

  for r in
    select product_id, quantity
    from public.sale_items
    where sale_id = p_sale_id
  loop
    select is_combo into v_combo from public.products where id = r.product_id;
    if coalesce(v_combo, false) then
      if not exists (select 1 from public.product_components where combo_id = r.product_id) then
        raise exception 'Não dá para devolver o estoque deste combo';
      end if;
      for c in
        select product_id, quantity from public.product_components where combo_id = r.product_id
      loop
        perform public.restore_stock_lots(c.product_id, r.quantity * c.quantity);
      end loop;
    else
      perform public.restore_stock_lots(r.product_id, r.quantity);
    end if;
  end loop;

  select coalesce(string_agg(si.quantity::text || '× ' || si.product_name, ', ' order by si.product_name), 'sem itens')
    into v_items
  from public.sale_items si
  where si.sale_id = p_sale_id;

  select coalesce(string_agg(
    coalesce(m.name, sp.payment_method) || ' R$ ' || replace(trim(to_char(sp.amount_cents / 100.0, 'FM999990.00')), '.', ','),
    ' + ' order by sp.payment_method
  ), '')
    into v_pays
  from public.sale_payments sp
  left join public.payment_methods m on m.id = sp.payment_method and m.kind = 'recebimento'
  where sp.sale_id = p_sale_id;

  perform public.append_tape(
    'caixa_vendas',
    'Venda cancelada: ' || v_items || case when v_pays = '' then '' else ' · ' || v_pays end
  );

  delete from public.sales where id = p_sale_id;
end;
$$;

grant execute on function public.cancel_sale(uuid) to authenticated;

notify pgrst, 'reload schema';
