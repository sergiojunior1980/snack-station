-- O administrador vê o usuário e a senha do vendedor e pode redefinir a senha.
-- A senha de login continua criptografada. Esta cópia só o administrador lê.

create table if not exists public.seller_passwords (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  password text not null,
  updated_at timestamptz not null default now()
);

alter table public.seller_passwords enable row level security;

drop policy if exists "admin le senha do vendedor" on public.seller_passwords;
create policy "admin le senha do vendedor" on public.seller_passwords
  for select to authenticated using (public.is_admin());

revoke insert, update, delete on public.seller_passwords from anon, authenticated;
grant select on public.seller_passwords to authenticated;

drop function if exists public.create_seller(text, text, text);

create or replace function public.remember_seller_password(p_user_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.seller_passwords (user_id, password)
  values (p_user_id, p_password)
  on conflict (user_id) do update
  set password = excluded.password, updated_at = now();
end;
$$;

create or replace function public.create_seller(
  p_name text,
  p_username text,
  p_password text,
  p_menus text[] default array['vender', 'produtos']
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := gen_random_uuid();
  v_username text := lower(trim(p_username));
  v_email text := v_username || '@usuarios.snackstation.local';
  v_menus text[];
  v_label text;
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
  if p_menus is null or cardinality(p_menus) = 0 then
    raise exception 'Escolha pelo menos um menu';
  end if;
  if exists (
    select 1 from unnest(p_menus) as item
    where item not in ('vender', 'produtos', 'estoque', 'financeiro', 'relatorios')
  ) then
    raise exception 'Menu inválido';
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'Este usuário já existe.';
  end if;

  select coalesce(array_agg(distinct item), array['vender']::text[])
    into v_menus
  from unnest(p_menus) as item;

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
  perform set_config('snack.allow_menus', 'on', true);
  update public.profiles
  set full_name = trim(p_name), username = v_username, role = 'vendedor', menus = v_menus
  where id = v_user_id;

  perform public.remember_seller_password(v_user_id, p_password);

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

  perform public.append_tape('perfis', 'Menus de ' || trim(p_name) || ': ' || coalesce(v_label, ''));
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

  select role, coalesce(nullif(username, ''), full_name)
    into v_role, v_name
  from public.profiles
  where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado';
  end if;
  if v_role <> 'vendedor' then
    raise exception 'A redefinição vale para o vendedor';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = p_user_id;

  perform public.remember_seller_password(p_user_id, p_password);
  perform public.append_tape('perfis', 'Senha redefinida: ' || coalesce(v_name, 'vendedor'));
end;
$$;

revoke all on function public.remember_seller_password(uuid, text) from public, anon, authenticated;
grant execute on function public.create_seller(text, text, text, text[]) to authenticated;
grant execute on function public.reset_seller_password(uuid, text) to authenticated;

notify pgrst, 'reload schema';
