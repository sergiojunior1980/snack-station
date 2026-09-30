-- A loja que já operava passa a usar o código fiskparaiso.
-- Os usuários dela continuam com o mesmo e-mail interno.

update public.tenants
set slug = 'fiskparaiso'
where slug = 'fisk';

create or replace function public.shop_user_email(p_slug text, p_username text)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(p_slug)) = 'fiskparaiso' then lower(trim(p_username)) || '@usuarios.snackstation.local'
    else lower(trim(p_slug)) || '.' || lower(trim(p_username)) || '@usuarios.snackstation.local'
  end
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
  if v_slug in ('plataforma', 'fiskparaiso') then
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
