-- O administrador exclui um usuário. O histórico de vendas, compras e caixa permanece.

do $$
declare
  r record;
begin
  for r in
    select c.conname, n.nspname as schema_name, t.relname as table_name, a.attname as column_name
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
    where c.confrelid = 'auth.users'::regclass
      and c.contype = 'f'
      and n.nspname = 'public'
      and t.relname <> 'profiles'
      and array_length(c.conkey, 1) = 1
  loop
    execute format('alter table %I.%I drop constraint %I', r.schema_name, r.table_name, r.conname);
    execute format('alter table %I.%I alter column %I drop not null', r.schema_name, r.table_name, r.column_name);
    execute format(
      'alter table %I.%I add constraint %I foreign key (%I) references auth.users (id) on delete set null',
      r.schema_name, r.table_name, r.conname, r.column_name
    );
  end loop;
end $$;

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

  select role, full_name, username
    into v_role, v_name, v_username
  from public.profiles
  where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado';
  end if;

  if v_role = 'admin' then
    select count(*) into v_admins from public.profiles where role = 'admin';
    if v_admins <= 1 then
      raise exception 'Mantenha pelo menos um administrador';
    end if;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner'
  ) then
    update storage.objects set owner = auth.uid() where owner = p_user_id;
  end if;

  perform public.append_tape(
    'perfis',
    'Usuário excluído: ' || coalesce(v_name, 'sem nome') || coalesce(' · ' || nullif(v_username, ''), '')
  );

  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.delete_team_member(uuid) from public, anon;
grant execute on function public.delete_team_member(uuid) to authenticated;

notify pgrst, 'reload schema';
