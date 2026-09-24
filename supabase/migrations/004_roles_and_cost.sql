-- Perfis e valor de compra.
-- Pode rodar de novo no SQL Editor se a tentativa anterior falhou no meio.

select set_config('snack.allow_role', 'on', false);

alter table public.profiles add column if not exists role text;
alter table public.products add column if not exists cost_price_cents integer;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.products drop constraint if exists products_cost_price_cents_check;

drop trigger if exists profiles_guard_role on public.profiles;

update public.profiles
set role = 'admin'
where role is null
   or not exists (select 1 from public.profiles where role = 'admin');

update public.profiles set role = 'vendedor' where role is null;
update public.products set cost_price_cents = 0 where cost_price_cents is null;

alter table public.profiles alter column role set default 'vendedor';
alter table public.profiles alter column role set not null;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'vendedor'));

alter table public.products alter column cost_price_cents set default 0;
alter table public.products alter column cost_price_cents set not null;
alter table public.products
  add constraint products_cost_price_cents_check check (cost_price_cents >= 0);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := 'vendedor';
begin
  if not exists (select 1 from public.profiles where role = 'admin') then
    v_role := 'admin';
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    v_role
  );
  return new;
end;
$$;

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role
     and current_setting('snack.allow_role', true) is distinct from 'on' then
    raise exception 'O perfil só muda pelo administrador';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role
before update on public.profiles
for each row execute function public.guard_profile_role();

create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Somente o administrador altera perfis';
  end if;
  if p_role not in ('admin', 'vendedor') then
    raise exception 'Perfil inválido';
  end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'Você não pode tirar o seu próprio acesso de administrador';
  end if;

  perform set_config('snack.allow_role', 'on', true);
  update public.profiles set role = p_role where id = p_user_id;
end;
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.set_user_role(uuid, text) to authenticated;

drop policy if exists "ler compras" on public.purchases;
create policy "ler compras" on public.purchases
  for select to authenticated using (public.is_admin());

drop policy if exists "ler itens de compra" on public.purchase_items;
create policy "ler itens de compra" on public.purchase_items
  for select to authenticated using (public.is_admin());

create or replace function public.guard_purchase_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Somente o administrador lança compras';
  end if;
  return new;
end;
$$;

drop trigger if exists purchases_admin on public.purchases;
create trigger purchases_admin
before insert on public.purchases
for each row execute function public.guard_purchase_admin();

drop function if exists public.revenue_series(timestamptz, timestamptz, text);

create function public.revenue_series(
  p_from timestamptz,
  p_to timestamptz,
  p_grain text
)
returns table (bucket date, total_cents bigint, sale_count bigint)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if not public.is_admin() then
    return;
  end if;
  if p_grain not in ('day', 'week', 'month') then
    raise exception 'Período inválido';
  end if;

  return query execute format(
    $q$
      select
        (date_trunc(%L, s.created_at at time zone 'America/Sao_Paulo'))::date as bucket,
        coalesce(sum(s.total_cents), 0)::bigint as total_cents,
        count(*)::bigint as sale_count
      from public.sales s
      where s.created_at >= $1 and s.created_at < $2
      group by 1
      order by 1
    $q$,
    p_grain
  ) using p_from, p_to;
end;
$$;

grant execute on function public.revenue_series(timestamptz, timestamptz, text) to authenticated;

select set_config('snack.allow_role', 'off', false);
