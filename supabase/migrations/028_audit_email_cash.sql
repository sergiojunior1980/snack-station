-- E-mail de contato para recuperar usuário e senha.
-- O login continua pelo usuário da loja. O e-mail real fica no cadastro e no auth,
-- para o link de recuperação chegar na caixa de entrada.

alter table public.profiles add column if not exists email text;

create unique index if not exists profiles_email_key
  on public.profiles (lower(email))
  where email is not null;

create or replace function public.contact_email(p_email text)
returns text
language plpgsql
immutable
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;
  if v_email like '%@usuarios.snackstation.local' then
    raise exception 'Use um e-mail de verdade, que receba mensagens.';
  end if;
  return v_email;
end;
$$;

create or replace function public.login_auth_email(p_shop text, p_username text)
returns text
language sql
security definer
set search_path = public
as $$
  select u.email
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  join auth.users u on u.id = p.id
  where t.slug = lower(trim(p_shop))
    and p.username = lower(trim(p_username))
    and t.status = 'active'
  limit 1;
$$;

revoke all on function public.login_auth_email(text, text) from public;
grant execute on function public.login_auth_email(text, text) to anon, authenticated;

create or replace function public.attach_contact_email(p_user_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := public.contact_email(p_email);
begin
  if exists (select 1 from auth.users where lower(email) = v_email and id <> p_user_id) then
    raise exception 'Este e-mail já está em uso.';
  end if;
  update auth.users
  set email = v_email,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = p_user_id;
  update auth.identities
  set identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(v_email)),
      updated_at = now()
  where user_id = p_user_id and provider = 'email';
  update public.profiles set email = v_email where id = p_user_id;
  return v_email;
end;
$$;

revoke all on function public.attach_contact_email(uuid, text) from public;

create or replace function public.set_member_email(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_email text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Somente o administrador grava o e-mail';
  end if;
  perform public.assert_same_shop(p_user_id);
  select coalesce(nullif(username, ''), full_name) into v_name
  from public.profiles where id = p_user_id and tenant_id = public.current_tenant();
  if not found then
    raise exception 'Usuário não encontrado';
  end if;
  v_email := public.attach_contact_email(p_user_id, p_email);
  perform public.append_tape('perfis', 'E-mail de ' || coalesce(v_name, 'usuário') || ': ' || v_email);
end;
$$;

revoke all on function public.set_member_email(uuid, text) from public;
grant execute on function public.set_member_email(uuid, text) to authenticated;

drop function if exists public.create_seller(text, text, text, text[]);

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
      else item
    end, ', ' order by item
  ) into v_label from unnest(v_menus) as item;
  perform public.append_tape('perfis', 'Menus de ' || trim(p_name) || ': ' || coalesce(v_label, '') || ' · ' || v_email);
end;
$$;

revoke all on function public.create_seller(text, text, text, text[], text) from public;
grant execute on function public.create_seller(text, text, text, text[], text) to authenticated;

create or replace function public.finish_password_recovery(p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Abra o link enviado por e-mail.';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres.';
  end if;
  select role, coalesce(nullif(username, ''), full_name) into v_role, v_name
  from public.profiles where id = auth.uid();
  if v_role = 'vendedor' then
    insert into public.seller_passwords (user_id, password)
    values (auth.uid(), p_password)
    on conflict (user_id) do update
    set password = excluded.password, updated_at = now();
  end if;
  perform public.append_tape('perfis', 'Senha recuperada por e-mail: ' || coalesce(v_name, 'usuário'));
end;
$$;

revoke all on function public.finish_password_recovery(text) from public;
grant execute on function public.finish_password_recovery(text) to authenticated;

notify pgrst, 'reload schema';
