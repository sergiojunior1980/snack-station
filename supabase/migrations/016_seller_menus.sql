-- O administrador escolhe quais menus cada vendedor pode abrir.

alter table public.profiles add column if not exists menus text[] not null default array['vender', 'produtos'];

alter table public.profiles drop constraint if exists profiles_menus_check;
alter table public.profiles
  add constraint profiles_menus_check
  check (menus <@ array['vender', 'produtos', 'estoque', 'financeiro', 'relatorios']::text[]);

create or replace function public.has_menu(p_menu text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and p_menu = any (menus)
    );
$$;

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
  return new;
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
    where item not in ('vender', 'produtos', 'estoque', 'financeiro', 'relatorios')
  ) then
    raise exception 'Menu inválido';
  end if;

  select role, full_name into v_role, v_name from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado';
  end if;
  if v_role <> 'vendedor' then
    raise exception 'Os menus valem para o vendedor';
  end if;

  select coalesce(array_agg(distinct item), array['vender']::text[])
    into v_menus
  from unnest(p_menus) as item;

  perform set_config('snack.allow_menus', 'on', true);
  update public.profiles set menus = v_menus where id = p_user_id;

  select string_agg(
    case item
      when 'vender' then 'Vender'
      when 'produtos' then 'Produtos'
      when 'estoque' then 'Estoque'
      when 'financeiro' then 'Financeiro'
      when 'relatorios' then 'Relatórios'
      else item
    end,
    ', ' order by item
  )
    into v_label
  from unnest(v_menus) as item;

  perform public.append_tape('perfis', 'Menus de ' || coalesce(v_name, 'vendedor') || ': ' || coalesce(v_label, ''));
end;
$$;

grant execute on function public.has_menu(text) to authenticated;
grant execute on function public.set_seller_menus(uuid, text[]) to authenticated;

drop policy if exists "ler compras" on public.purchases;
create policy "ler compras" on public.purchases
  for select to authenticated using (public.has_menu('estoque') or public.has_menu('financeiro'));

drop policy if exists "ler itens de compra" on public.purchase_items;
create policy "ler itens de compra" on public.purchase_items
  for select to authenticated using (public.has_menu('estoque'));

drop policy if exists "ler caixa" on public.cash_sessions;
create policy "ler caixa" on public.cash_sessions
  for select to authenticated using (public.has_menu('financeiro'));

drop policy if exists "ler movimentos de caixa" on public.cash_movements;
create policy "ler movimentos de caixa" on public.cash_movements
  for select to authenticated using (public.has_menu('financeiro'));

drop policy if exists "ler lotes" on public.stock_lots;
create policy "ler lotes" on public.stock_lots
  for select to authenticated using (public.has_menu('estoque'));

drop policy if exists "ler movimentos de estoque" on public.stock_movements;
create policy "ler movimentos de estoque" on public.stock_movements
  for select to authenticated using (public.has_menu('estoque'));

drop policy if exists "ler fita" on public.audit_tape;
create policy "ler fita" on public.audit_tape
  for select to authenticated using (
    public.is_admin()
    or (module = 'caixa_vendas' and public.has_menu('financeiro'))
    or (module = 'compras_estoque' and public.has_menu('estoque'))
    or (module = 'cadastro_produtos' and public.has_menu('produtos'))
  );

drop policy if exists "admin grava formas" on public.payment_methods;
create policy "admin grava formas" on public.payment_methods
  for all to authenticated
  using (public.has_menu('financeiro'))
  with check (public.has_menu('financeiro'));

drop policy if exists "admin envia nota" on storage.objects;
create policy "admin envia nota" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'notas' and public.has_menu('estoque'));

drop policy if exists "admin le nota" on storage.objects;
create policy "admin le nota" on storage.objects
  for select to authenticated
  using (bucket_id = 'notas' and public.has_menu('estoque'));

do $body$
declare
  fn record;
  src text;
begin
  for fn in
    select p.oid, m.menu
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join (
      values
        ('register_purchase', 'estoque'),
        ('update_purchase', 'estoque'),
        ('delete_purchase', 'estoque'),
        ('guard_purchase_admin', 'estoque'),
        ('register_stock_move', 'estoque'),
        ('open_cash_session', 'financeiro'),
        ('close_cash_session', 'financeiro'),
        ('register_cash_movement', 'financeiro'),
        ('cash_expected', 'financeiro'),
        ('account_balance', 'financeiro'),
        ('revenue_series', 'relatorios')
    ) as m(name, menu) on m.name = p.proname
    where n.nspname = 'public'
      and pg_get_functiondef(p.oid) like '%not public.is_admin()%'
  loop
    src := replace(pg_get_functiondef(fn.oid), 'not public.is_admin()', format('not public.has_menu(%L)', fn.menu));
    execute src;
  end loop;
end
$body$;

notify pgrst, 'reload schema';
