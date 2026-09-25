-- Custo exibido no cadastro e fita própria de produtos.

create table if not exists public.app_settings (
  key text primary key,
  value text not null
);

insert into public.app_settings (key, value)
values ('stock_cost_mode', 'media')
on conflict (key) do nothing;

alter table public.app_settings enable row level security;
drop policy if exists "ler config" on public.app_settings;
create policy "ler config" on public.app_settings
  for select to authenticated using (true);
drop policy if exists "admin grava config" on public.app_settings;
create policy "admin grava config" on public.app_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.audit_tape drop constraint if exists audit_tape_module_check;
alter table public.audit_tape add constraint audit_tape_module_check
  check (module in ('caixa_vendas', 'compras_estoque', 'perfis', 'cadastro_produtos'));

create or replace function public.append_tape(p_module text, p_summary text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  if p_module not in ('caixa_vendas', 'compras_estoque', 'perfis', 'cadastro_produtos') then
    raise exception 'Fita inválida';
  end if;
  if char_length(trim(coalesce(p_summary, ''))) < 2 then
    raise exception 'Resumo inválido';
  end if;
  insert into public.audit_tape (module, summary, created_by)
  values (p_module, trim(p_summary), auth.uid());
end;
$$;
