-- Equipe do ambiente local. Catálogo, estoque, vendas e financeiro nascem vazios.
-- O administrador (admin / Admin@123) já entra pela migration 005.
-- Vendedores locais: usuário waguiar e ingrid, senha Vendedor@123.
-- Sergio entra como sergio / Admin@123.

do $$
declare
  r record;
begin
  for r in
    select *
    from (
      values
        ('14cf0ed8-de43-403f-a341-89eea732fd84'::uuid, 'wagner aguiar', 'waguiar', 'vendedor', 'Vendedor@123'),
        ('8bff7876-7def-47ac-bd6c-851c715dbf9e'::uuid, 'ingrid aguiar', 'ingrid', 'vendedor', 'Vendedor@123'),
        ('cf5b6b36-a9b3-404c-b61d-a5b2657f4d66'::uuid, 'Sergio Junior Da Costa Alves', 'sergio', 'admin', 'Admin@123')
    ) as t(id, full_name, username, role, password)
  loop
    if exists (select 1 from auth.users where email = r.username || '@usuarios.snackstation.local') then
      continue;
    end if;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      r.id,
      'authenticated',
      'authenticated',
      r.username || '@usuarios.snackstation.local',
      extensions.crypt(r.password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', r.full_name, 'username', r.username),
      now(),
      now(),
      '', '', '', ''
    );

    insert into auth.identities (
      user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      r.id,
      jsonb_build_object('sub', r.id::text, 'email', r.username || '@usuarios.snackstation.local'),
      'email',
      r.id::text,
      now(),
      now(),
      now()
    );

    perform set_config('snack.allow_role', 'on', true);
    update public.profiles
    set full_name = r.full_name, username = r.username, role = r.role
    where id = r.id;
  end loop;
end $$;
