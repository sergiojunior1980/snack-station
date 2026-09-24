-- Usuário administrador pronto para entrar.
-- Usuário: admin
-- Senha: Admin@123
-- Pode rodar de novo: se o usuário já existir, não cria outro.

alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_key on public.profiles (username);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := 'vendedor';
  v_username text := nullif(trim(new.raw_user_meta_data->>'username'), '');
begin
  if not exists (select 1 from public.profiles where role = 'admin') then
    v_role := 'admin';
  end if;

  insert into public.profiles (id, full_name, role, username)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    v_role,
    v_username
  );
  return new;
end;
$$;

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_email text := 'admin@usuarios.snackstation.local';
begin
  if exists (select 1 from auth.users where email = v_email) then
    perform set_config('snack.allow_role', 'on', true);
    update public.profiles
    set role = 'admin', username = 'admin', full_name = 'Administrador'
    where id = (select id from auth.users where email = v_email);
    return;
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt('Admin@123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Administrador","username":"admin"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email),
    'email',
    v_user_id::text,
    now(),
    now(),
    now()
  );

  perform set_config('snack.allow_role', 'on', true);
  update public.profiles
  set role = 'admin', username = 'admin', full_name = 'Administrador'
  where id = v_user_id;
end $$;

create or replace function public.create_seller(p_name text, p_username text, p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := gen_random_uuid();
  v_username text := lower(trim(p_username));
  v_email text := v_username || '@usuarios.snackstation.local';
begin
  if not public.is_admin() then
    raise exception 'Somente o administrador cria vendedores.';
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
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'Este usuário já existe.';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', trim(p_name), 'username', v_username),
    now(),
    now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email),
    'email',
    v_user_id::text,
    now(),
    now(),
    now()
  );

  perform set_config('snack.allow_role', 'on', true);
  update public.profiles
  set full_name = trim(p_name), username = v_username, role = 'vendedor'
  where id = v_user_id;
end;
$$;

revoke all on function public.create_seller(text, text, text) from public;
grant execute on function public.create_seller(text, text, text) to authenticated;
