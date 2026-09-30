-- Várias lojas no mesmo banco. A operação que já existe vira a loja fisk.

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

create unique index if not exists tenants_slug_key on public.tenants (slug);

insert into public.tenants (name, slug)
select 'FISK', 'fisk'
where not exists (select 1 from public.tenants where slug = 'fisk');

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'vendedor', 'plataforma'));

alter table public.profiles add column if not exists tenant_id uuid references public.tenants (id);
alter table public.products add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.categories add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.category_fields add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.product_components add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.sales add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.sale_items add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.sale_payments add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.purchases add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.purchase_items add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.cash_sessions add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.cash_movements add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.stock_lots add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.stock_movements add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.payment_methods add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.app_settings add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.audit_tape add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;

do $$
declare
  v_shop uuid;
  t text;
begin
  select id into v_shop from public.tenants where slug = 'fisk';
  foreach t in array array[
    'profiles', 'products', 'categories', 'category_fields', 'product_components',
    'sales', 'sale_items', 'sale_payments', 'purchases', 'purchase_items',
    'cash_sessions', 'cash_movements', 'stock_lots', 'stock_movements',
    'payment_methods', 'app_settings', 'audit_tape'
  ] loop
    execute format('update public.%I set tenant_id = $1 where tenant_id is null', t) using v_shop;
  end loop;
end $$;

alter table public.products alter column tenant_id set not null;
alter table public.categories alter column tenant_id set not null;
alter table public.category_fields alter column tenant_id set not null;
alter table public.product_components alter column tenant_id set not null;
alter table public.sales alter column tenant_id set not null;
alter table public.sale_items alter column tenant_id set not null;
alter table public.sale_payments alter column tenant_id set not null;
alter table public.purchases alter column tenant_id set not null;
alter table public.purchase_items alter column tenant_id set not null;
alter table public.cash_sessions alter column tenant_id set not null;
alter table public.cash_movements alter column tenant_id set not null;
alter table public.stock_lots alter column tenant_id set not null;
alter table public.stock_movements alter column tenant_id set not null;
alter table public.payment_methods alter column tenant_id set not null;
alter table public.app_settings alter column tenant_id set not null;

drop index if exists public.profiles_username_key;
create unique index if not exists profiles_tenant_username_key
  on public.profiles (tenant_id, username) where tenant_id is not null and username is not null;
create unique index if not exists profiles_platform_username_key
  on public.profiles (username) where tenant_id is null and username is not null;

create unique index if not exists categories_tenant_slug_key on public.categories (tenant_id, slug);
alter table public.products drop constraint if exists products_category_slug_fkey;
alter table public.categories drop constraint if exists categories_slug_key;
alter table public.products
  add constraint products_category_slug_fkey
  foreign key (tenant_id, category) references public.categories (tenant_id, slug);

alter table public.app_settings drop constraint if exists app_settings_pkey;
alter table public.app_settings add primary key (tenant_id, key);

alter table public.payment_methods drop constraint if exists payment_methods_pkey;
alter table public.payment_methods add primary key (tenant_id, kind, id);

drop index if exists public.cash_sessions_one_open;
create unique index cash_sessions_one_open on public.cash_sessions (tenant_id) where closed_at is null;

create index if not exists sales_tenant_created_idx on public.sales (tenant_id, created_at desc);
create index if not exists purchases_tenant_created_idx on public.purchases (tenant_id, created_at desc);
create index if not exists products_tenant_name_idx on public.products (tenant_id, name);

create or replace function public.current_tenant()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_platform()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'plataforma'
  );
$$;

create or replace function public.shop_status()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select t.status
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid()
$$;

create or replace function public.assign_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop uuid := public.current_tenant();
begin
  if tg_table_name in ('sale_items', 'sale_payments') and new.tenant_id is null then
    select tenant_id into new.tenant_id from public.sales where id = new.sale_id;
  elsif tg_table_name = 'purchase_items' and new.tenant_id is null then
    select tenant_id into new.tenant_id from public.purchases where id = new.purchase_id;
  elsif tg_table_name = 'cash_movements' and new.tenant_id is null then
    select tenant_id into new.tenant_id from public.cash_sessions where id = new.session_id;
  elsif tg_table_name in ('stock_lots', 'stock_movements') and new.tenant_id is null then
    select tenant_id into new.tenant_id from public.products where id = new.product_id;
  elsif tg_table_name = 'product_components' and new.tenant_id is null then
    select tenant_id into new.tenant_id from public.products where id = new.combo_id;
  elsif tg_table_name = 'category_fields' and new.tenant_id is null then
    select tenant_id into new.tenant_id from public.categories where id = new.category_id;
  elsif new.tenant_id is null then
    new.tenant_id := v_shop;
  end if;

  if tg_table_name = 'audit_tape' and new.tenant_id is null then
    return new;
  end if;

  if new.tenant_id is null then
    raise exception 'Loja não encontrada';
  end if;
  if v_shop is not null and new.tenant_id is distinct from v_shop then
    raise exception 'Registro não encontrado';
  end if;

  if tg_table_name in ('sale_items', 'purchase_items', 'stock_lots', 'stock_movements') then
    if not exists (
      select 1 from public.products p
      where p.id = new.product_id and p.tenant_id = new.tenant_id
    ) then
      raise exception 'Produto indisponível';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.keep_shop()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'A loja do registro não muda';
  end if;
  if public.current_tenant() is not null and old.tenant_id is distinct from public.current_tenant() then
    raise exception 'Registro não encontrado';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'products', 'categories', 'category_fields', 'product_components',
    'sales', 'sale_items', 'sale_payments', 'purchases', 'purchase_items',
    'cash_sessions', 'cash_movements', 'stock_lots', 'stock_movements',
    'payment_methods', 'app_settings', 'audit_tape'
  ] loop
    execute format('drop trigger if exists assign_tenant on public.%I', t);
    execute format('create trigger assign_tenant before insert on public.%I for each row execute function public.assign_tenant()', t);
    execute format('drop trigger if exists keep_shop on public.%I', t);
    execute format('create trigger keep_shop before update or delete on public.%I for each row execute function public.keep_shop()', t);
  end loop;
end $$;

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role
     and current_setting('snack.allow_role', true) is distinct from 'on' then
    raise exception 'O perfil só muda pelo administrador';
  end if;
  if new.menus is distinct from old.menus
     and current_setting('snack.allow_menus', true) is distinct from 'on' then
    raise exception 'Os menus só mudam pelo administrador';
  end if;
  if new.tenant_id is distinct from old.tenant_id
     and current_setting('snack.allow_role', true) is distinct from 'on' then
    raise exception 'A loja do usuário não muda';
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := 'vendedor';
  v_username text := nullif(trim(new.raw_user_meta_data->>'username'), '');
  v_tenant uuid;
begin
  if current_setting('snack.allow_role', true) = 'on' then
    if coalesce(new.raw_user_meta_data->>'role', '') in ('admin', 'vendedor', 'plataforma') then
      v_role := new.raw_user_meta_data->>'role';
    end if;
    if nullif(new.raw_user_meta_data->>'tenant_id', '') is not null then
      v_tenant := (new.raw_user_meta_data->>'tenant_id')::uuid;
    end if;
  end if;

  insert into public.profiles (id, full_name, role, username, tenant_id)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    v_role,
    v_username,
    v_tenant
  );
  return new;
end;
$$;

create or replace function public.tape_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_tape (module, summary, created_by, tenant_id)
    values (
      'perfis',
      'Usuário criado: ' || new.full_name || coalesce(' · ' || new.username, ''),
      coalesce(auth.uid(), new.id),
      new.tenant_id
    );
  elsif new.role is distinct from old.role or new.full_name is distinct from old.full_name or new.username is distinct from old.username then
    insert into public.audit_tape (module, summary, created_by, tenant_id)
    values (
      'perfis',
      'Perfil atualizado: ' || new.full_name || ' · ' || coalesce(new.role, ''),
      auth.uid(),
      new.tenant_id
    );
  end if;
  return new;
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
  v_shop uuid := public.current_tenant();
  v_open integer;
  v_sales integer;
  v_in integer;
  v_out integer;
  v_purchases integer;
begin
  if v_shop is null or not public.is_admin() then return 0; end if;
  select coalesce(sum(opening_cents), 0) into v_open
  from public.cash_sessions where tenant_id = v_shop;
  select coalesce(sum(sp.amount_cents), 0) into v_sales
  from public.sale_payments sp
  join public.sales s on s.id = sp.sale_id
  join public.payment_methods m
    on m.tenant_id = s.tenant_id and m.id = sp.payment_method and m.kind = 'recebimento' and m.counts_as_cash
  where s.tenant_id = v_shop;
  select coalesce(sum(amount_cents) filter (where kind = 'entrada'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'retirada'), 0)
    into v_in, v_out
  from public.cash_movements
  where tenant_id = v_shop;
  select coalesce(sum(p.total_cents), 0) into v_purchases
  from public.purchases p
  join public.payment_methods m
    on m.tenant_id = p.tenant_id and m.id = p.payment_method and m.kind = 'pagamento' and m.settles_balance
  where p.tenant_id = v_shop;
  return v_open + v_sales + v_in - v_out - v_purchases;
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
  v_shop uuid := public.current_tenant();
  v_open integer;
  v_from timestamptz;
  v_to timestamptz;
  v_sales integer;
  v_in integer;
  v_out integer;
  v_purchases integer;
begin
  if auth.uid() is null or v_shop is null then
    return 0;
  end if;

  select opening_cents, opened_at, coalesce(closed_at, now())
    into v_open, v_from, v_to
  from public.cash_sessions
  where id = p_session_id and tenant_id = v_shop;
  if v_from is null then return 0; end if;

  select coalesce(sum(sp.amount_cents), 0) into v_sales
  from public.sale_payments sp
  join public.sales s on s.id = sp.sale_id
  join public.payment_methods m
    on m.tenant_id = s.tenant_id and m.id = sp.payment_method and m.kind = 'recebimento' and m.counts_as_cash
  where s.tenant_id = v_shop and s.created_at >= v_from and s.created_at < v_to;

  select coalesce(sum(amount_cents) filter (where kind = 'entrada'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'retirada'), 0)
    into v_in, v_out
  from public.cash_movements
  where tenant_id = v_shop and created_at >= v_from and created_at < v_to;

  select coalesce(sum(p.total_cents), 0) into v_purchases
  from public.purchases p
  join public.payment_methods m
    on m.tenant_id = p.tenant_id and m.id = p.payment_method and m.kind = 'pagamento' and m.settles_balance
  where p.tenant_id = v_shop and p.created_at >= v_from and p.created_at < v_to;

  return v_open + v_sales + v_in - v_out - v_purchases;
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
  v_shop uuid := public.current_tenant();
begin
  if auth.uid() is null or v_shop is null then
    raise exception 'Entre para abrir o caixa';
  end if;
  if public.shop_status() is distinct from 'active' then
    raise exception 'Esta loja está suspensa';
  end if;
  if p_opening_cents is null or p_opening_cents < 0 then
    raise exception 'Valor de abertura inválido';
  end if;
  if exists (select 1 from public.cash_sessions where closed_at is null and tenant_id = v_shop) then
    raise exception 'Já existe um caixa aberto';
  end if;

  insert into public.cash_sessions (opened_by, opening_cents, opening_note, tenant_id)
  values (auth.uid(), p_opening_cents, nullif(trim(coalesce(p_note, '')), ''), v_shop)
  returning id into v_id;
  return v_id;
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
  v_shop uuid := public.current_tenant();
begin
  if auth.uid() is null or v_shop is null then
    raise exception 'Entre para fechar o caixa';
  end if;
  if p_counted_cents is null or p_counted_cents < 0 then
    raise exception 'Valor contado inválido';
  end if;

  select id into v_id
  from public.cash_sessions
  where closed_at is null and tenant_id = v_shop
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
  where id = v_id and tenant_id = v_shop;

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
  v_shop uuid := public.current_tenant();
begin
  if auth.uid() is null or v_shop is null then
    raise exception 'Entre para lançar a entrada ou a saída';
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

  select id into v_session from public.cash_sessions where closed_at is null and tenant_id = v_shop;
  if v_session is null then
    raise exception 'Não há caixa aberto';
  end if;

  insert into public.cash_movements (session_id, kind, amount_cents, note, created_by, tenant_id)
  values (v_session, p_kind, p_amount_cents, trim(p_note), auth.uid(), v_shop)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.correct_cash_session(
  p_session_id uuid,
  p_opening_cents integer,
  p_counted_cents integer,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open integer;
  v_counted integer;
  v_closed timestamptz;
  v_expected integer;
  v_note text;
  v_shop uuid := public.current_tenant();
begin
  if auth.uid() is null or v_shop is null then
    raise exception 'Entre para corrigir o caixa';
  end if;
  if p_opening_cents is null or p_opening_cents < 0 then
    raise exception 'Valor de abertura inválido';
  end if;

  select opening_cents, counted_cents, closed_at
    into v_open, v_counted, v_closed
  from public.cash_sessions
  where id = p_session_id and tenant_id = v_shop
  for update;

  if not found then
    raise exception 'Caixa não encontrado';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  if v_closed is null then
    if p_counted_cents is not null then
      raise exception 'O caixa ainda está aberto';
    end if;
    update public.cash_sessions
    set opening_cents = p_opening_cents,
        opening_note = coalesce(v_note, opening_note)
    where id = p_session_id and tenant_id = v_shop;
    if v_open is distinct from p_opening_cents then
      perform public.append_tape(
        'caixa_vendas',
        'Abertura corrigida de '
          || trim(to_char(v_open / 100.0, 'FM999990.00'))
          || ' para '
          || trim(to_char(p_opening_cents / 100.0, 'FM999990.00'))
      );
    end if;
    return;
  end if;

  if p_counted_cents is null or p_counted_cents < 0 then
    raise exception 'Valor contado inválido';
  end if;

  update public.cash_sessions
  set opening_cents = p_opening_cents
  where id = p_session_id and tenant_id = v_shop;

  v_expected := public.cash_expected(p_session_id);

  update public.cash_sessions
  set counted_cents = p_counted_cents,
      expected_cents = v_expected,
      difference_cents = p_counted_cents - v_expected,
      closing_note = coalesce(v_note, closing_note)
  where id = p_session_id and tenant_id = v_shop;

  if v_open is distinct from p_opening_cents or v_counted is distinct from p_counted_cents then
    perform public.append_tape(
      'caixa_vendas',
      'Fechamento corrigido: fundo '
        || trim(to_char(v_open / 100.0, 'FM999990.00'))
        || ' para '
        || trim(to_char(p_opening_cents / 100.0, 'FM999990.00'))
        || ', contado '
        || trim(to_char(coalesce(v_counted, 0) / 100.0, 'FM999990.00'))
        || ' para '
        || trim(to_char(p_counted_cents / 100.0, 'FM999990.00'))
    );
  end if;
end;
$$;

create or replace function public.shop_user_email(p_slug text, p_username text)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(p_slug)) = 'fisk' then lower(trim(p_username)) || '@usuarios.snackstation.local'
    else lower(trim(p_slug)) || '.' || lower(trim(p_username)) || '@usuarios.snackstation.local'
  end
$$;

create or replace function public.assert_same_shop(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = p_user_id and tenant_id is not distinct from public.current_tenant()
  ) then
    raise exception 'Usuário não encontrado';
  end if;
end;
$$;

create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Somente o administrador altera perfis';
  end if;
  if p_role not in ('admin', 'vendedor') then
    raise exception 'Perfil inválido';
  end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'Você não pode tirar o seu próprio acesso de administrador';
  end if;
  perform public.assert_same_shop(p_user_id);
  perform set_config('snack.allow_role', 'on', true);
  update public.profiles set role = p_role where id = p_user_id and tenant_id = public.current_tenant();
end;
$$;

create or replace function public.set_seller_menus(p_user_id uuid, p_menus text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_name text;
  v_menus text[];
  v_label text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Somente o administrador altera os menus';
  end if;
  if p_menus is null or cardinality(p_menus) = 0 then
    raise exception 'Escolha pelo menos um menu';
  end if;
  if exists (
    select 1 from unnest(p_menus) as item
    where item not in ('vender', 'produtos', 'estoque', 'financeiro', 'relatorios', 'configuracoes')
  ) then
    raise exception 'Menu inválido';
  end if;
  perform public.assert_same_shop(p_user_id);
  select role, full_name into v_role, v_name from public.profiles where id = p_user_id and tenant_id = public.current_tenant();
  if v_role <> 'vendedor' then
    raise exception 'Os menus valem para o vendedor';
  end if;
  select coalesce(array_agg(distinct item), array['vender']::text[]) into v_menus from unnest(p_menus) as item;
  perform set_config('snack.allow_menus', 'on', true);
  update public.profiles set menus = v_menus where id = p_user_id and tenant_id = public.current_tenant();
  select string_agg(
    case item
      when 'vender' then 'Vender'
      when 'produtos' then 'Produtos'
      when 'estoque' then 'Estoque'
      when 'financeiro' then 'Financeiro'
      when 'relatorios' then 'Relatórios'
      when 'configuracoes' then 'Configurações'
      else item
    end, ', ' order by item
  ) into v_label from unnest(v_menus) as item;
  perform public.append_tape('perfis', 'Menus de ' || coalesce(v_name, 'vendedor') || ': ' || coalesce(v_label, ''));
end;
$$;

create or replace function public.delete_team_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_name text;
  v_username text;
  v_admins integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Somente o administrador exclui usuários';
  end if;
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'Você não pode excluir o seu próprio usuário';
  end if;
  perform public.assert_same_shop(p_user_id);
  select role, full_name, username into v_role, v_name, v_username
  from public.profiles where id = p_user_id and tenant_id = public.current_tenant();
  if v_role = 'admin' then
    select count(*) into v_admins from public.profiles
    where role = 'admin' and tenant_id = public.current_tenant();
    if v_admins <= 1 then
      raise exception 'Mantenha pelo menos um administrador';
    end if;
  end if;
  perform public.append_tape(
    'perfis',
    'Usuário excluído: ' || coalesce(v_name, 'sem nome') || coalesce(' · ' || nullif(v_username, ''), '')
  );
  delete from auth.users where id = p_user_id;
end;
$$;

create or replace function public.reset_seller_password(p_user_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_name text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Somente o administrador redefine senhas';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres.';
  end if;
  perform public.assert_same_shop(p_user_id);
  select role, coalesce(nullif(username, ''), full_name) into v_role, v_name
  from public.profiles where id = p_user_id and tenant_id = public.current_tenant();
  if v_role <> 'vendedor' then
    raise exception 'A redefinição vale para o vendedor';
  end if;
  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
  where id = p_user_id;
  perform public.remember_seller_password(p_user_id, p_password);
  perform public.append_tape('perfis', 'Senha redefinida: ' || coalesce(v_name, 'vendedor'));
end;
$$;

create or replace function public.remember_seller_password(p_user_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Somente o administrador vê a senha do vendedor.';
  end if;
  perform public.assert_same_shop(p_user_id);
  insert into public.seller_passwords (user_id, password)
  values (p_user_id, p_password)
  on conflict (user_id) do update
  set password = excluded.password, updated_at = now();
end;
$$;

create or replace function public.seed_shop(p_shop uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.payment_methods (tenant_id, id, name, kind, counts_as_cash, settles_balance, sort_order) values
    (p_shop, 'dinheiro', 'Dinheiro', 'recebimento', true, false, 1),
    (p_shop, 'pix', 'PIX', 'recebimento', false, false, 2),
    (p_shop, 'cartao', 'Cartão', 'recebimento', false, false, 3),
    (p_shop, 'dinheiro', 'Dinheiro', 'pagamento', false, true, 1),
    (p_shop, 'pix', 'PIX', 'pagamento', false, false, 2),
    (p_shop, 'cartao', 'Cartão', 'pagamento', false, false, 3),
    (p_shop, 'saldo', 'Saldo da conta', 'pagamento', false, true, 4)
  on conflict (tenant_id, kind, id) do nothing;
  insert into public.app_settings (tenant_id, key, value) values
    (p_shop, 'stock_cost_mode', 'media'),
    (p_shop, 'brand_button_color', '#b8002e'),
    (p_shop, 'brand_background_color', '#fff7f7'),
    (p_shop, 'brand_logo_url', '')
  on conflict (tenant_id, key) do nothing;
end;
$$;

create or replace function public.create_auth_user(
  p_email text,
  p_password text,
  p_name text,
  p_username text,
  p_role text,
  p_tenant uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := gen_random_uuid();
begin
  if exists (select 1 from auth.users where email = p_email) then
    raise exception 'Este usuário já existe.';
  end if;
  perform set_config('snack.allow_role', 'on', true);
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_name, 'username', p_username, 'role', p_role, 'tenant_id', p_tenant),
    now(), now(), '', '', '', ''
  );
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email),
    'email', v_user_id::text, now(), now(), now()
  );
  update public.profiles
  set full_name = p_name, username = p_username, role = p_role, tenant_id = p_tenant
  where id = v_user_id;
  return v_user_id;
end;
$$;

create or replace function public.create_seller(
  p_name text,
  p_username text,
  p_password text,
  p_menus text[] default array['vender', 'produtos']
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := lower(trim(p_username));
  v_slug text;
  v_email text;
  v_user_id uuid;
  v_menus text[];
  v_label text;
begin
  if public.current_tenant() is null or not public.is_admin() then
    raise exception 'Somente o administrador cria vendedores.';
  end if;
  if public.shop_status() is distinct from 'active' then
    raise exception 'Esta loja está suspensa';
  end if;
  if v_username !~ '^[a-z0-9._-]{3,32}$' then
    raise exception 'Use de 3 a 32 letras ou números no usuário.';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres.';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Informe o nome.';
  end if;
  if p_menus is null or cardinality(p_menus) = 0 then
    raise exception 'Escolha pelo menos um menu';
  end if;
  if exists (
    select 1 from unnest(p_menus) as item
    where item not in ('vender', 'produtos', 'estoque', 'financeiro', 'relatorios', 'configuracoes')
  ) then
    raise exception 'Menu inválido';
  end if;
  if exists (
    select 1 from public.profiles
    where tenant_id = public.current_tenant() and username = v_username
  ) then
    raise exception 'Este usuário já existe.';
  end if;
  select slug into v_slug from public.tenants where id = public.current_tenant();
  v_email := public.shop_user_email(v_slug, v_username);
  select coalesce(array_agg(distinct item), array['vender']::text[]) into v_menus from unnest(p_menus) as item;
  v_user_id := public.create_auth_user(v_email, p_password, trim(p_name), v_username, 'vendedor', public.current_tenant());
  perform set_config('snack.allow_menus', 'on', true);
  update public.profiles set menus = v_menus where id = v_user_id;
  perform public.remember_seller_password(v_user_id, p_password);
  select string_agg(
    case item
      when 'vender' then 'Vender'
      when 'produtos' then 'Produtos'
      when 'estoque' then 'Estoque'
      when 'financeiro' then 'Financeiro'
      when 'relatorios' then 'Relatórios'
      when 'configuracoes' then 'Configurações'
      else item
    end, ', ' order by item
  ) into v_label from unnest(v_menus) as item;
  perform public.append_tape('perfis', 'Menus de ' || trim(p_name) || ': ' || coalesce(v_label, ''));
end;
$$;

create or replace function public.create_shop(
  p_name text,
  p_slug text,
  p_admin_name text,
  p_admin_username text,
  p_admin_password text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(p_slug));
  v_username text := lower(trim(p_admin_username));
  v_shop uuid;
begin
  if not public.is_platform() then
    raise exception 'Somente a plataforma abre uma loja';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Informe o nome da loja';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) < 3 or char_length(v_slug) > 32 then
    raise exception 'O código da loja usa de 3 a 32 letras minúsculas, números ou hífen';
  end if;
  if v_slug in ('plataforma', 'fisk') then
    raise exception 'Esse código de loja não está disponível';
  end if;
  if exists (select 1 from public.tenants where slug = v_slug) then
    raise exception 'Já existe uma loja com esse código';
  end if;
  if v_username !~ '^[a-z0-9._-]{3,32}$' then
    raise exception 'Use de 3 a 32 letras ou números no usuário.';
  end if;
  if length(coalesce(p_admin_password, '')) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres.';
  end if;
  if length(trim(coalesce(p_admin_name, ''))) < 2 then
    raise exception 'Informe o nome do administrador';
  end if;

  insert into public.tenants (name, slug) values (trim(p_name), v_slug) returning id into v_shop;
  perform public.seed_shop(v_shop);
  perform public.create_auth_user(
    public.shop_user_email(v_slug, v_username),
    p_admin_password,
    trim(p_admin_name),
    v_username,
    'admin',
    v_shop
  );
  return v_shop;
end;
$$;

create or replace function public.set_shop_status(p_shop_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform() then
    raise exception 'Somente a plataforma altera a loja';
  end if;
  if p_status not in ('active', 'suspended') then
    raise exception 'Situação inválida';
  end if;
  update public.tenants set status = p_status where id = p_shop_id;
  if not found then
    raise exception 'Loja não encontrada';
  end if;
end;
$$;

revoke all on function public.create_auth_user(text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.seed_shop(uuid) from public, anon, authenticated;
revoke all on function public.assert_same_shop(uuid) from public, anon, authenticated;
grant execute on function public.create_shop(text, text, text, text, text) to authenticated;
grant execute on function public.set_shop_status(uuid, text) to authenticated;
grant execute on function public.current_tenant() to authenticated;
grant execute on function public.is_platform() to authenticated;

do $$
declare
  r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.tenants enable row level security;

create policy "ler a propria loja" on public.tenants
  for select to authenticated
  using (id = public.current_tenant() or public.is_platform());

create policy "ver pessoas da loja" on public.profiles
  for select to authenticated
  using (id = auth.uid() or tenant_id = public.current_tenant());

create policy "atualizar o proprio perfil" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and tenant_id is not distinct from public.current_tenant());

create policy "ler produtos da loja" on public.products
  for select to authenticated using (tenant_id = public.current_tenant());
create policy "gravar produtos da loja" on public.products
  for insert to authenticated with check (tenant_id = public.current_tenant());
create policy "editar produtos da loja" on public.products
  for update to authenticated using (tenant_id = public.current_tenant()) with check (tenant_id = public.current_tenant());
create policy "excluir produtos da loja" on public.products
  for delete to authenticated using (tenant_id = public.current_tenant() and public.has_menu('produtos'));

create policy "ler categorias da loja" on public.categories
  for select to authenticated using (tenant_id = public.current_tenant());
create policy "gravar categorias da loja" on public.categories
  for all to authenticated
  using (tenant_id = public.current_tenant() and public.is_admin())
  with check (tenant_id = public.current_tenant() and public.is_admin());

create policy "ler campos da loja" on public.category_fields
  for select to authenticated using (tenant_id = public.current_tenant());
create policy "gravar campos da loja" on public.category_fields
  for all to authenticated
  using (tenant_id = public.current_tenant() and public.is_admin())
  with check (tenant_id = public.current_tenant() and public.is_admin());

create policy "ler componentes da loja" on public.product_components
  for select to authenticated using (tenant_id = public.current_tenant());
create policy "gravar componentes da loja" on public.product_components
  for all to authenticated
  using (tenant_id = public.current_tenant() and public.has_menu('produtos'))
  with check (tenant_id = public.current_tenant() and public.has_menu('produtos'));

create policy "ler vendas da loja" on public.sales
  for select to authenticated using (tenant_id = public.current_tenant());
create policy "ler itens da venda" on public.sale_items
  for select to authenticated using (tenant_id = public.current_tenant());
create policy "ler pagamentos da venda" on public.sale_payments
  for select to authenticated using (tenant_id = public.current_tenant());

create policy "ler compras da loja" on public.purchases
  for select to authenticated
  using (tenant_id = public.current_tenant() and (public.has_menu('estoque') or public.has_menu('financeiro')));
create policy "ler itens da compra" on public.purchase_items
  for select to authenticated
  using (tenant_id = public.current_tenant() and public.has_menu('estoque'));

create policy "ler caixa da loja" on public.cash_sessions
  for select to authenticated using (tenant_id = public.current_tenant());
create policy "ler movimentos da loja" on public.cash_movements
  for select to authenticated using (tenant_id = public.current_tenant());

create policy "ler lotes da loja" on public.stock_lots
  for select to authenticated
  using (tenant_id = public.current_tenant() and (public.has_menu('estoque') or public.has_menu('relatorios')));
create policy "ler movimento de estoque" on public.stock_movements
  for select to authenticated
  using (tenant_id = public.current_tenant() and public.has_menu('estoque'));

create policy "ler fita da loja" on public.audit_tape
  for select to authenticated
  using (
    tenant_id = public.current_tenant()
    and (
      public.is_admin()
      or (module = 'caixa_vendas' and public.has_menu('financeiro'))
      or (module = 'compras_estoque' and public.has_menu('estoque'))
      or (module = 'cadastro_produtos' and public.has_menu('produtos'))
    )
  );

create policy "ler formas da loja" on public.payment_methods
  for select to authenticated using (tenant_id = public.current_tenant());
create policy "gravar formas da loja" on public.payment_methods
  for all to authenticated
  using (tenant_id = public.current_tenant() and public.has_menu('financeiro'))
  with check (tenant_id = public.current_tenant() and public.has_menu('financeiro'));

create policy "ler ajustes da loja" on public.app_settings
  for select to authenticated using (tenant_id = public.current_tenant());
create policy "admin grava ajustes" on public.app_settings
  for all to authenticated
  using (tenant_id = public.current_tenant() and public.is_admin())
  with check (tenant_id = public.current_tenant() and public.is_admin());
create policy "configuracao grava marca" on public.app_settings
  for all to authenticated
  using (
    tenant_id = public.current_tenant()
    and public.has_menu('configuracoes')
    and key in ('brand_button_color', 'brand_background_color', 'brand_logo_url')
  )
  with check (
    tenant_id = public.current_tenant()
    and public.has_menu('configuracoes')
    and key in ('brand_button_color', 'brand_background_color', 'brand_logo_url')
  );

create policy "admin le senha da loja" on public.seller_passwords
  for select to authenticated
  using (
    public.is_admin()
    and exists (
      select 1 from public.profiles p
      where p.id = seller_passwords.user_id and p.tenant_id = public.current_tenant()
    )
  );

drop policy if exists "marca publica" on storage.objects;
create policy "marca publica" on storage.objects
  for select to public using (bucket_id = 'marca');

drop policy if exists "admin envia marca" on storage.objects;
drop policy if exists "admin troca marca" on storage.objects;
drop policy if exists "admin apaga marca" on storage.objects;
drop policy if exists "loja envia marca" on storage.objects;
drop policy if exists "loja troca marca" on storage.objects;
drop policy if exists "loja apaga marca" on storage.objects;

create policy "loja envia marca" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'marca'
    and public.has_menu('configuracoes')
    and name like public.current_tenant()::text || '/%'
  );
create policy "loja troca marca" on storage.objects
  for update to authenticated
  using (bucket_id = 'marca' and public.has_menu('configuracoes') and name like public.current_tenant()::text || '/%')
  with check (bucket_id = 'marca' and public.has_menu('configuracoes') and name like public.current_tenant()::text || '/%');
create policy "loja apaga marca" on storage.objects
  for delete to authenticated
  using (bucket_id = 'marca' and public.has_menu('configuracoes') and name like public.current_tenant()::text || '/%');

drop policy if exists "admin envia nota" on storage.objects;
drop policy if exists "admin le nota" on storage.objects;
drop policy if exists "loja envia nota" on storage.objects;
drop policy if exists "loja le nota" on storage.objects;

create policy "loja envia nota" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'notas'
    and public.has_menu('estoque')
    and exists (
      select 1 from public.profiles owner
      where owner.id::text = split_part(name, '/', 1)
        and owner.tenant_id = public.current_tenant()
    )
  );
create policy "loja le nota" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'notas'
    and public.has_menu('estoque')
    and exists (
      select 1 from public.profiles owner
      where owner.id::text = split_part(name, '/', 1)
        and owner.tenant_id = public.current_tenant()
    )
  );

do $$
declare
  v_email text := 'plataforma.plataforma@usuarios.snackstation.local';
  v_user_id uuid;
begin
  if exists (select 1 from auth.users where email = v_email) then
    return;
  end if;
  v_user_id := public.create_auth_user(v_email, 'Plataforma@123', 'Plataforma', 'plataforma', 'plataforma', null);
end $$;

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
  if public.current_tenant() is null then
    raise exception 'Loja não encontrada';
  end if;
  if not exists (select 1 from public.cash_sessions where closed_at is null and tenant_id = public.current_tenant()) then
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
    where p.id = r.product_id and p.active and p.tenant_id = public.current_tenant();
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
    perform 1 from public.products where id = r.product_id and tenant_id = public.current_tenant() for update;
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
      where id = p_payment_method and kind = 'recebimento' and active and tenant_id = public.current_tenant()
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
        where m.id = pay.method and m.kind = 'recebimento' and m.active and m.tenant_id = public.current_tenant()
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
    where id = p_payment_method and kind = 'pagamento' and active and tenant_id = public.current_tenant()
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
    select p.name into v_name from public.products p where p.id = r.product_id and not p.is_combo and p.tenant_id = public.current_tenant() for update;
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
  if not exists (select 1 from public.purchases where id = p_purchase_id and tenant_id = public.current_tenant()) then
    raise exception 'Compra não encontrada';
  end if;
  if p_purchased_on is null then raise exception 'Informe a data da compra'; end if;
  if nullif(trim(coalesce(p_supplier, '')), '') is null then raise exception 'Informe o fornecedor'; end if;
  if not exists (
    select 1 from public.payment_methods
    where id = p_payment_method and kind = 'pagamento' and active and tenant_id = public.current_tenant()
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
    select p.name into v_name from public.products p where p.id = r.product_id and not p.is_combo and p.tenant_id = public.current_tenant() for update;
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
  select supplier into v_supplier from public.purchases where id = p_purchase_id and tenant_id = public.current_tenant();
  if not found then raise exception 'Compra não encontrada'; end if;
  v_items := public.purchase_items_label(p_purchase_id);

  perform public.release_purchase_lots(p_purchase_id);
  perform public.append_tape(
    'compras_estoque',
    'Compra excluída: ' || coalesce(v_supplier, 'sem fornecedor') || ' · ' || v_items
  );
  delete from public.purchases where id = p_purchase_id and tenant_id = public.current_tenant();
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

  perform 1 from public.sales where id = p_sale_id and tenant_id = public.current_tenant() for update;
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
  left join public.payment_methods m on m.tenant_id = public.current_tenant() and m.id = sp.payment_method and m.kind = 'recebimento'
  where sp.sale_id = p_sale_id;

  perform public.append_tape(
    'caixa_vendas',
    'Venda cancelada: ' || v_items || case when v_pays = '' then '' else ' · ' || v_pays end
  );

  delete from public.sales where id = p_sale_id;
end;
$$;



notify pgrst, 'reload schema';
