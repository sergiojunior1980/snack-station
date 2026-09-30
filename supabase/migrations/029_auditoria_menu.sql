-- Auditoria entra na lista de menus do vendedor.
-- O administrador já passa em has_menu, então o menu fica ligado para ele sem marcar no cadastro.

alter table public.profiles drop constraint if exists profiles_menus_check;
alter table public.profiles
  add constraint profiles_menus_check
  check (menus <@ array['vender', 'produtos', 'estoque', 'financeiro', 'relatorios', 'configuracoes', 'auditoria']::text[]);

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
    where item not in ('vender', 'produtos', 'estoque', 'financeiro', 'relatorios', 'configuracoes', 'auditoria')
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
      when 'auditoria' then 'Auditoria'
      else item
    end, ', ' order by item
  ) into v_label from unnest(v_menus) as item;
  perform public.append_tape('perfis', 'Menus de ' || coalesce(v_name, 'vendedor') || ': ' || coalesce(v_label, ''));
end;
$$;

create or replace function public.create_seller(
  p_name text,
  p_username text,
  p_password text,
  p_menus text[] default array['vender', 'produtos'],
  p_email text default ''
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := lower(trim(p_username));
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
  v_email := public.contact_email(p_email);
  if p_menus is null or cardinality(p_menus) = 0 then
    raise exception 'Escolha pelo menos um menu';
  end if;
  if exists (
    select 1 from unnest(p_menus) as item
    where item not in ('vender', 'produtos', 'estoque', 'financeiro', 'relatorios', 'configuracoes', 'auditoria')
  ) then
    raise exception 'Menu inválido';
  end if;
  if exists (
    select 1 from public.profiles
    where tenant_id = public.current_tenant() and username = v_username
  ) then
    raise exception 'Este usuário já existe.';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'Este e-mail já está em uso.';
  end if;
  select coalesce(array_agg(distinct item), array['vender']::text[]) into v_menus from unnest(p_menus) as item;
  v_user_id := public.create_auth_user(v_email, p_password, trim(p_name), v_username, 'vendedor', public.current_tenant());
  perform set_config('snack.allow_menus', 'on', true);
  update public.profiles set menus = v_menus, email = v_email where id = v_user_id;
  perform public.remember_seller_password(v_user_id, p_password);
  select string_agg(
    case item
      when 'vender' then 'Vender'
      when 'produtos' then 'Produtos'
      when 'estoque' then 'Estoque'
      when 'financeiro' then 'Financeiro'
      when 'relatorios' then 'Relatórios'
      when 'configuracoes' then 'Configurações'
      when 'auditoria' then 'Auditoria'
      else item
    end, ', ' order by item
  ) into v_label from unnest(v_menus) as item;
  perform public.append_tape('perfis', 'Menus de ' || trim(p_name) || ': ' || coalesce(v_label, '') || ' · ' || v_email);
end;
$$;

drop policy if exists "ler fita da loja" on public.audit_tape;
create policy "ler fita da loja" on public.audit_tape
  for select to authenticated
  using (
    tenant_id = public.current_tenant()
    and (
      public.is_admin()
      or public.has_menu('auditoria')
      or (module = 'caixa_vendas' and public.has_menu('financeiro'))
      or (module = 'compras_estoque' and public.has_menu('estoque'))
      or (module = 'cadastro_produtos' and public.has_menu('produtos'))
    )
  );
