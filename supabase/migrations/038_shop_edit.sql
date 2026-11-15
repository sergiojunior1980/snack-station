-- A plataforma altera nome, código, administrador e senha de uma loja já criada.

create or replace function public.list_shops()
returns table (
  id uuid,
  name text,
  slug text,
  status text,
  admin_id uuid,
  admin_name text,
  admin_username text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.name,
    t.slug,
    t.status,
    a.id,
    a.full_name,
    a.username
  from public.tenants t
  left join lateral (
    select p.id, p.full_name, p.username
    from public.profiles p
    where p.tenant_id = t.id and p.role = 'admin'
    order by p.created_at
    limit 1
  ) a on true
  where public.is_platform()
  order by t.name;
$$;

create or replace function public.update_shop(
  p_shop_id uuid,
  p_name text,
  p_slug text,
  p_admin_name text,
  p_admin_username text,
  p_admin_password text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(p_slug));
  v_username text := lower(trim(p_admin_username));
  v_current text;
  v_admin uuid;
  r record;
  v_email text;
begin
  if not public.is_platform() then
    raise exception 'Somente a plataforma altera a loja';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Informe o nome da loja';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) < 3 or char_length(v_slug) > 32 then
    raise exception 'O código da loja usa de 3 a 32 letras minúsculas, números ou hífen';
  end if;
  if v_username !~ '^[a-z0-9._-]{3,32}$' then
    raise exception 'Use de 3 a 32 letras ou números no usuário.';
  end if;
  if length(trim(coalesce(p_admin_name, ''))) < 2 then
    raise exception 'Informe o nome do administrador';
  end if;
  if length(trim(coalesce(p_admin_password, ''))) > 0 and length(p_admin_password) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres.';
  end if;

  select slug into v_current from public.tenants where id = p_shop_id;
  if v_current is null then
    raise exception 'Loja não encontrada';
  end if;
  if v_slug in ('plataforma', 'fiskparaiso') and v_slug is distinct from v_current then
    raise exception 'Esse código de loja não está disponível';
  end if;
  if exists (select 1 from public.tenants where slug = v_slug and id <> p_shop_id) then
    raise exception 'Já existe uma loja com esse código';
  end if;

  select p.id into v_admin
  from public.profiles p
  where p.tenant_id = p_shop_id and p.role = 'admin'
  order by p.created_at
  limit 1;
  if v_admin is null then
    raise exception 'Esta loja não tem administrador';
  end if;
  if exists (
    select 1 from public.profiles
    where tenant_id = p_shop_id and username = v_username and id <> v_admin
  ) then
    raise exception 'Já existe um usuário com esse nome nesta loja';
  end if;

  update public.tenants
  set name = trim(p_name), slug = v_slug
  where id = p_shop_id;

  update public.profiles
  set full_name = trim(p_admin_name), username = v_username
  where id = v_admin;

  for r in
    select p.id, p.username
    from public.profiles p
    where p.tenant_id = p_shop_id and p.username is not null
  loop
    v_email := public.shop_user_email(v_slug, r.username);
    if exists (select 1 from auth.users where email = v_email and id <> r.id) then
      raise exception 'Este usuário já existe.';
    end if;
    update auth.users
    set email = v_email,
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
          'username', r.username,
          'full_name', case when r.id = v_admin then trim(p_admin_name) else raw_user_meta_data->>'full_name' end
        ),
        encrypted_password = case
          when r.id = v_admin and length(trim(coalesce(p_admin_password, ''))) >= 6
            then extensions.crypt(p_admin_password, extensions.gen_salt('bf'))
          else encrypted_password
        end,
        updated_at = now()
    where id = r.id;
    update auth.identities
    set identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(v_email)),
        updated_at = now()
    where user_id = r.id and provider = 'email';
  end loop;
end;
$$;

revoke all on function public.list_shops() from public, anon;
revoke all on function public.update_shop(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.list_shops() to authenticated;
grant execute on function public.update_shop(uuid, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
