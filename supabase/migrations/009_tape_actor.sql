-- Na criação de usuário, a fita registra quem fez a operação.
create or replace function public.tape_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_tape (module, summary, created_by)
    values ('perfis', 'Usuário criado: ' || new.full_name || coalesce(' · ' || new.username, ''), coalesce(auth.uid(), new.id));
  elsif new.role is distinct from old.role or new.full_name is distinct from old.full_name or new.username is distinct from old.username then
    insert into public.audit_tape (module, summary, created_by)
    values ('perfis', 'Perfil atualizado: ' || new.full_name || ' · ' || coalesce(new.role, ''), auth.uid());
  end if;
  return new;
end;
$$;
