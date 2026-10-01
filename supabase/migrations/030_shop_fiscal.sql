-- Cadastro fiscal da loja. O token CSC e a senha do certificado não saem na consulta da tela.

create table if not exists public.shop_fiscal (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  legal_name text not null,
  trade_name text not null,
  cnpj text not null,
  state_registration text not null,
  street text not null,
  number text not null,
  complement text,
  district text not null,
  city_name text not null,
  city_code text not null,
  state text not null,
  zip text not null,
  crt smallint not null check (crt in (1, 2, 3)),
  nfce_series integer not null check (nfce_series between 1 and 999),
  nfce_next_number integer not null check (nfce_next_number between 1 and 999999999),
  environment text not null check (environment in ('homologacao', 'producao')),
  csc_id text,
  csc_token text,
  certificate_path text,
  certificate_password text,
  updated_at timestamptz not null default now(),
  constraint shop_fiscal_cnpj_check check (cnpj ~ '^[0-9]{14}$'),
  constraint shop_fiscal_ie_check check (state_registration = 'ISENTO' or state_registration ~ '^[0-9A-Z]{2,14}$'),
  constraint shop_fiscal_city_check check (city_code ~ '^[0-9]{7}$'),
  constraint shop_fiscal_state_check check (char_length(state) = 2),
  constraint shop_fiscal_zip_check check (zip ~ '^[0-9]{8}$'),
  constraint shop_fiscal_csc_id_check check (csc_id is null or csc_id ~ '^[0-9]{1,6}$')
);

drop trigger if exists assign_tenant on public.shop_fiscal;
create trigger assign_tenant before insert on public.shop_fiscal
for each row execute function public.assign_tenant();

drop trigger if exists keep_shop on public.shop_fiscal;
create trigger keep_shop before update or delete on public.shop_fiscal
for each row execute function public.keep_shop();

alter table public.shop_fiscal enable row level security;
alter table public.shop_fiscal force row level security;

drop policy if exists "admin le empresa" on public.shop_fiscal;
create policy "admin le empresa" on public.shop_fiscal
  for select to authenticated
  using (tenant_id = public.current_tenant() and public.is_admin());

revoke all on table public.shop_fiscal from public, anon, authenticated;

create or replace view public.shop_fiscal_form with (security_barrier = true) as
select
  tenant_id,
  legal_name,
  trade_name,
  cnpj,
  state_registration,
  street,
  number,
  complement,
  district,
  city_name,
  city_code,
  state,
  zip,
  crt,
  nfce_series,
  nfce_next_number,
  environment,
  csc_id,
  (csc_token is not null and csc_token <> '') as csc_configured,
  (certificate_path is not null and certificate_path <> '') as certificate_configured,
  updated_at
from public.shop_fiscal
where tenant_id = public.current_tenant()
  and public.is_admin();

revoke all on table public.shop_fiscal_form from public, anon;
grant select on table public.shop_fiscal_form to authenticated;

alter table public.audit_tape drop constraint if exists audit_tape_module_check;
alter table public.audit_tape add constraint audit_tape_module_check
  check (module in ('caixa_vendas', 'compras_estoque', 'perfis', 'cadastro_produtos', 'empresa'));

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
  if p_module not in ('caixa_vendas', 'compras_estoque', 'perfis', 'cadastro_produtos', 'empresa') then
    raise exception 'Fita inválida';
  end if;
  if char_length(trim(coalesce(p_summary, ''))) < 2 then
    raise exception 'Resumo inválido';
  end if;
  insert into public.audit_tape (module, summary, created_by)
  values (p_module, trim(p_summary), auth.uid());
end;
$$;

create or replace function public.cnpj_ok(p_cnpj text)
returns boolean
language plpgsql
immutable
as $$
declare
  v text := p_cnpj;
  total int := 0;
  i int;
  d1 int;
  d2 int;
  factors int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if v !~ '^[0-9]{14}$' or v ~ '^([0-9])\1{13}$' then
    return false;
  end if;
  for i in 1..12 loop
    total := total + substr(v, i, 1)::int * factors[i];
  end loop;
  d1 := total % 11;
  d1 := case when d1 < 2 then 0 else 11 - d1 end;
  if d1 <> substr(v, 13, 1)::int then
    return false;
  end if;
  factors := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  total := 0;
  for i in 1..13 loop
    total := total + substr(v, i, 1)::int * factors[i];
  end loop;
  d2 := total % 11;
  d2 := case when d2 < 2 then 0 else 11 - d2 end;
  return d2 = substr(v, 14, 1)::int;
end;
$$;

create or replace function public.save_shop_fiscal(
  p_legal_name text,
  p_trade_name text,
  p_cnpj text,
  p_state_registration text,
  p_street text,
  p_number text,
  p_complement text,
  p_district text,
  p_city_name text,
  p_city_code text,
  p_state text,
  p_zip text,
  p_crt integer,
  p_nfce_series integer,
  p_nfce_next_number integer,
  p_environment text,
  p_csc_id text,
  p_csc_token text,
  p_certificate_path text,
  p_certificate_password text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop uuid := public.current_tenant();
  v_old public.shop_fiscal%rowtype;
  v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_ie text := upper(trim(coalesce(p_state_registration, '')));
  v_legal text := trim(coalesce(p_legal_name, ''));
  v_trade text := trim(coalesce(p_trade_name, ''));
  v_street text := trim(coalesce(p_street, ''));
  v_number text := trim(coalesce(p_number, ''));
  v_complement text := nullif(trim(coalesce(p_complement, '')), '');
  v_district text := trim(coalesce(p_district, ''));
  v_city text := trim(coalesce(p_city_name, ''));
  v_city_code text := regexp_replace(coalesce(p_city_code, ''), '\D', '', 'g');
  v_state text := upper(trim(coalesce(p_state, '')));
  v_zip text := regexp_replace(coalesce(p_zip, ''), '\D', '', 'g');
  v_csc_id text := nullif(trim(coalesce(p_csc_id, '')), '');
  v_token text := nullif(trim(coalesce(p_csc_token, '')), '');
  v_path text := nullif(trim(coalesce(p_certificate_path, '')), '');
  v_password text := nullif(p_certificate_password, '');
begin
  if auth.uid() is null or not public.is_admin() or v_shop is null then
    raise exception 'Só o administrador cadastra a empresa';
  end if;
  if char_length(v_legal) < 2 or char_length(v_legal) > 60 then
    raise exception 'Informe a razão social com até 60 caracteres';
  end if;
  if char_length(v_trade) < 1 or char_length(v_trade) > 60 then
    raise exception 'Informe o nome fantasia com até 60 caracteres';
  end if;
  if not public.cnpj_ok(v_cnpj) then
    raise exception 'Informe um CNPJ válido';
  end if;
  if v_ie <> 'ISENTO' and v_ie !~ '^[0-9A-Z]{2,14}$' then
    raise exception 'Informe a inscrição estadual ou ISENTO';
  end if;
  if char_length(v_street) < 2 or char_length(v_street) > 60
     or char_length(v_number) < 1 or char_length(v_number) > 60
     or char_length(v_district) < 2 or char_length(v_district) > 60
     or char_length(v_city) < 2 or char_length(v_city) > 60
     or coalesce(char_length(v_complement), 0) > 60 then
    raise exception 'Revise o endereço';
  end if;
  if v_city_code !~ '^[0-9]{7}$' then
    raise exception 'O código do município tem 7 dígitos';
  end if;
  if v_state not in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
    'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
  ) then
    raise exception 'Escolha a UF';
  end if;
  if v_zip !~ '^[0-9]{8}$' then
    raise exception 'Informe o CEP com 8 dígitos';
  end if;
  if p_crt not in (1, 2, 3) then
    raise exception 'Escolha o regime tributário';
  end if;
  if p_nfce_series is null or p_nfce_series < 1 or p_nfce_series > 999 then
    raise exception 'A série da NFC-e fica entre 1 e 999';
  end if;
  if p_nfce_next_number is null or p_nfce_next_number < 1 or p_nfce_next_number > 999999999 then
    raise exception 'O próximo número da NFC-e precisa ser maior que zero';
  end if;
  if p_environment not in ('homologacao', 'producao') then
    raise exception 'Escolha o ambiente da nota';
  end if;

  select * into v_old from public.shop_fiscal where tenant_id = v_shop;
  if v_csc_id is null then
    v_csc_id := v_old.csc_id;
  end if;
  if v_token is null then
    v_token := v_old.csc_token;
  end if;
  if (v_csc_id is null) <> (v_token is null) then
    raise exception 'Informe o identificador e o token CSC juntos';
  end if;
  if v_csc_id is not null and v_csc_id !~ '^[0-9]{1,6}$' then
    raise exception 'O identificador CSC tem de 1 a 6 dígitos';
  end if;
  if v_token is not null and char_length(v_token) not between 16 and 36 then
    raise exception 'O token CSC precisa ter de 16 a 36 caracteres';
  end if;

  if v_path is null then
    v_path := v_old.certificate_path;
  end if;
  if v_path is not null and v_path not like v_shop::text || '/%' then
    raise exception 'Certificado inválido';
  end if;
  if v_password is null then
    v_password := v_old.certificate_password;
  end if;
  if v_path is not null and v_password is null then
    raise exception 'Informe a senha do certificado';
  end if;
  if v_path is null and nullif(p_certificate_password, '') is not null then
    raise exception 'Envie o certificado junto com a senha';
  end if;
  if v_password is not null and char_length(v_password) > 64 then
    raise exception 'A senha do certificado passa de 64 caracteres';
  end if;

  insert into public.shop_fiscal (
    tenant_id, legal_name, trade_name, cnpj, state_registration,
    street, number, complement, district, city_name, city_code, state, zip,
    crt, nfce_series, nfce_next_number, environment,
    csc_id, csc_token, certificate_path, certificate_password, updated_at
  ) values (
    v_shop, v_legal, v_trade, v_cnpj, v_ie,
    v_street, v_number, v_complement, v_district, v_city, v_city_code, v_state, v_zip,
    p_crt, p_nfce_series, p_nfce_next_number, p_environment,
    v_csc_id, v_token, v_path, v_password, now()
  )
  on conflict (tenant_id) do update set
    legal_name = excluded.legal_name,
    trade_name = excluded.trade_name,
    cnpj = excluded.cnpj,
    state_registration = excluded.state_registration,
    street = excluded.street,
    number = excluded.number,
    complement = excluded.complement,
    district = excluded.district,
    city_name = excluded.city_name,
    city_code = excluded.city_code,
    state = excluded.state,
    zip = excluded.zip,
    crt = excluded.crt,
    nfce_series = excluded.nfce_series,
    nfce_next_number = excluded.nfce_next_number,
    environment = excluded.environment,
    csc_id = excluded.csc_id,
    csc_token = excluded.csc_token,
    certificate_path = excluded.certificate_path,
    certificate_password = excluded.certificate_password,
    updated_at = now();

  perform public.append_tape('empresa', 'Cadastro da empresa salvo: ' || v_legal);
end;
$$;

revoke all on function public.save_shop_fiscal(
  text, text, text, text, text, text, text, text, text, text, text, text,
  integer, integer, integer, text, text, text, text, text
) from public, anon;
grant execute on function public.save_shop_fiscal(
  text, text, text, text, text, text, text, text, text, text, text, text,
  integer, integer, integer, text, text, text, text, text
) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificados', 'certificados', false, 102400, array['application/x-pkcs12', 'application/pkcs12', 'application/octet-stream'])
on conflict (id) do update set
  public = false,
  file_size_limit = 102400,
  allowed_mime_types = array['application/x-pkcs12', 'application/pkcs12', 'application/octet-stream'];

drop policy if exists "admin envia certificado" on storage.objects;
create policy "admin envia certificado" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'certificados'
    and public.is_admin()
    and name like public.current_tenant()::text || '/%'
  );

drop policy if exists "admin troca certificado" on storage.objects;
create policy "admin troca certificado" on storage.objects
  for update to authenticated
  using (bucket_id = 'certificados' and public.is_admin() and name like public.current_tenant()::text || '/%')
  with check (bucket_id = 'certificados' and public.is_admin() and name like public.current_tenant()::text || '/%');

drop policy if exists "admin le certificado" on storage.objects;
create policy "admin le certificado" on storage.objects
  for select to authenticated
  using (bucket_id = 'certificados' and public.is_admin() and name like public.current_tenant()::text || '/%');

notify pgrst, 'reload schema';
