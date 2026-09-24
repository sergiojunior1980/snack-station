-- Snack Station — estoque compartilhado da escola.
-- Rode este arquivo no SQL Editor do Supabase (uma vez).

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('refrigerante', 'doce', 'biscoito', 'agua', 'outro')),
  sale_price_cents integer not null check (sale_price_cents >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  min_stock integer not null default 5 check (min_stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id),
  total_cents integer not null check (total_cents >= 0),
  payment_method text not null check (payment_method in ('dinheiro', 'pix', 'cartao')),
  note text,
  created_at timestamptz not null default now()
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  product_id uuid not null references public.products (id),
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  total_cents integer not null check (total_cents >= 0)
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id),
  supplier text,
  total_cents integer not null check (total_cents >= 0),
  note text,
  created_at timestamptz not null default now()
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  product_id uuid not null references public.products (id),
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_cost_cents integer not null check (unit_cost_cents >= 0),
  total_cents integer not null check (total_cents >= 0)
);

create index sales_created_at_idx on public.sales (created_at desc);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (product_id);
create index purchases_created_at_idx on public.purchases (created_at desc);

create or replace function public.guard_product_stock()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.stock_quantity is distinct from old.stock_quantity then
    if current_setting('snack.allow_stock', true) is distinct from 'on' then
      raise exception 'O estoque só muda quando você registra uma venda ou uma compra';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_guard_stock
before update on public.products
for each row execute function public.guard_product_stock();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

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
    select
      (item->>'product_id')::uuid as product_id,
      (item->>'quantity')::integer as quantity
    from jsonb_array_elements(p_items) as item
  loop
    if r.quantity is null or r.quantity <= 0 then
      raise exception 'Quantidade inválida';
    end if;

    select p.name, p.sale_price_cents
      into v_name, v_price
    from public.products p
    where p.id = r.product_id
      and p.active
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

    select p.name into v_name
    from public.products p
    where p.id = r.product_id
    for update;

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

  perform set_config('snack.allow_stock', 'on', true);

  update public.products p
  set stock_quantity = p.stock_quantity + s.qty
  from (
    select product_id, sum(quantity)::integer as qty
    from _purchase_lines
    group by product_id
  ) s
  where p.id = s.product_id;

  return v_purchase_id;
end;
$$;

create or replace function public.revenue_series(
  p_from timestamptz,
  p_to timestamptz,
  p_grain text
)
returns table (bucket date, total_cents bigint, sale_count bigint)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_grain not in ('day', 'week', 'month') then
    raise exception 'Período inválido';
  end if;

  return query execute format(
    $q$
      select
        (date_trunc(%L, s.created_at at time zone 'America/Sao_Paulo'))::date as bucket,
        coalesce(sum(s.total_cents), 0)::bigint as total_cents,
        count(*)::bigint as sale_count
      from public.sales s
      where s.created_at >= $1 and s.created_at < $2
      group by 1
      order by 1
    $q$,
    p_grain
  ) using p_from, p_to;
end;
$$;

create or replace function public.top_products(
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 10
)
returns table (
  product_id uuid,
  product_name text,
  quantity bigint,
  total_cents bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    si.product_id,
    si.product_name,
    sum(si.quantity)::bigint as quantity,
    sum(si.total_cents)::bigint as total_cents
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.created_at >= p_from and s.created_at < p_to
  group by si.product_id, si.product_name
  order by quantity desc, total_cents desc
  limit greatest(p_limit, 1);
$$;

create or replace function public.unsold_products(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  product_id uuid,
  product_name text,
  category text,
  stock_quantity integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select p.id, p.name, p.category, p.stock_quantity
  from public.products p
  where p.active
    and not exists (
      select 1
      from public.sale_items si
      join public.sales s on s.id = si.sale_id
      where si.product_id = p.id
        and s.created_at >= p_from
        and s.created_at < p_to
    )
  order by p.name;
$$;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

create policy "perfis visiveis" on public.profiles
  for select to authenticated using (true);

create policy "atualizar proprio perfil" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "ler produtos" on public.products
  for select to authenticated using (true);

create policy "criar produtos" on public.products
  for insert to authenticated with check (true);

create policy "editar produtos" on public.products
  for update to authenticated using (true) with check (true);

create policy "ler vendas" on public.sales
  for select to authenticated using (true);

create policy "ler itens de venda" on public.sale_items
  for select to authenticated using (true);

create policy "ler compras" on public.purchases
  for select to authenticated using (true);

create policy "ler itens de compra" on public.purchase_items
  for select to authenticated using (true);

revoke insert, update, delete on public.sales from anon, authenticated;
revoke insert, update, delete on public.sale_items from anon, authenticated;
revoke insert, update, delete on public.purchases from anon, authenticated;
revoke insert, update, delete on public.purchase_items from anon, authenticated;

grant select on public.sales, public.sale_items, public.purchases, public.purchase_items to authenticated;
grant execute on function public.register_sale(text, text, jsonb) to authenticated;
grant execute on function public.register_purchase(text, text, jsonb) to authenticated;
grant execute on function public.revenue_series(timestamptz, timestamptz, text) to authenticated;
grant execute on function public.top_products(timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.unsold_products(timestamptz, timestamptz) to authenticated;
