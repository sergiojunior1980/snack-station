-- O menu Configurações entra na lista que o administrador pode dar a um vendedor.

alter table public.profiles drop constraint if exists profiles_menus_check;
alter table public.profiles
  add constraint profiles_menus_check
  check (menus <@ array['vender', 'produtos', 'estoque', 'financeiro', 'relatorios', 'configuracoes']::text[]);

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
      when 'configuracoes' then 'Configurações'
      else item
    end,
    ', ' order by item
  )
    into v_label
  from unnest(v_menus) as item;

  perform public.append_tape('perfis', 'Menus de ' || coalesce(v_name, 'vendedor') || ': ' || coalesce(v_label, ''));
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
    where item not in ('vender', 'produtos', 'estoque', 'financeiro', 'relatorios', 'configuracoes')
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
      when 'configuracoes' then 'Configurações'
      else item
    end,
    ', ' order by item
  )
    into v_label
  from unnest(v_menus) as item;

  perform public.append_tape('perfis', 'Menus de ' || trim(p_name) || ': ' || coalesce(v_label, ''));
end;
$$;

drop policy if exists "admin envia marca" on storage.objects;
create policy "admin envia marca" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'marca' and public.has_menu('configuracoes'));

drop policy if exists "admin troca marca" on storage.objects;
create policy "admin troca marca" on storage.objects
  for update to authenticated
  using (bucket_id = 'marca' and public.has_menu('configuracoes'))
  with check (bucket_id = 'marca' and public.has_menu('configuracoes'));

drop policy if exists "admin apaga marca" on storage.objects;
create policy "admin apaga marca" on storage.objects
  for delete to authenticated
  using (bucket_id = 'marca' and public.has_menu('configuracoes'));

drop policy if exists "configuracoes grava aparencia" on public.app_settings;
create policy "configuracoes grava aparencia" on public.app_settings
  for all to authenticated
  using (
    public.has_menu('configuracoes')
    and key in ('brand_button_color', 'brand_background_color', 'brand_logo_url')
  )
  with check (
    public.has_menu('configuracoes')
    and key in ('brand_button_color', 'brand_background_color', 'brand_logo_url')
  );
