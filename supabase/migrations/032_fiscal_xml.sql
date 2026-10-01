-- Códigos fiscais do produto e o XML da NFC-e guardado por venda.

alter table public.products add column if not exists ncm text;
alter table public.products add column if not exists cfop text not null default '5102';
alter table public.products add column if not exists tax_code text not null default '102';
alter table public.products add column if not exists origin text not null default '0';

alter table public.products drop constraint if exists products_ncm_check;
alter table public.products add constraint products_ncm_check check (ncm is null or ncm ~ '^[0-9]{8}$');
alter table public.products drop constraint if exists products_cfop_check;
alter table public.products add constraint products_cfop_check check (cfop ~ '^[0-9]{4}$');
alter table public.products drop constraint if exists products_tax_code_check;
alter table public.products add constraint products_tax_code_check
  check (tax_code in ('102', '103', '300', '400', '500', '40', '41'));
alter table public.products drop constraint if exists products_origin_check;
alter table public.products add constraint products_origin_check check (origin in ('0', '1', '2'));

alter table public.purchases add column if not exists invoice_key text;
create unique index if not exists purchases_invoice_key_idx
  on public.purchases (tenant_id, invoice_key)
  where invoice_key is not null;

create table if not exists public.sale_invoices (
  sale_id uuid primary key references public.sales (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  series integer not null,
  number integer not null,
  access_key text not null unique,
  xml text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, series, number)
);

drop trigger if exists assign_tenant on public.sale_invoices;
create trigger assign_tenant before insert on public.sale_invoices
for each row execute function public.assign_tenant();

drop trigger if exists keep_shop on public.sale_invoices;
create trigger keep_shop before update or delete on public.sale_invoices
for each row execute function public.keep_shop();

alter table public.sale_invoices enable row level security;
alter table public.sale_invoices force row level security;

revoke all on table public.sale_invoices from public, anon, authenticated;
grant select on table public.sale_invoices to authenticated;

drop policy if exists "admin le xml da venda" on public.sale_invoices;
create policy "admin le xml da venda" on public.sale_invoices
  for select to authenticated
  using (tenant_id = public.current_tenant() and public.is_admin());

create or replace function public.shop_csc_token()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if auth.uid() is null or not public.is_admin() or public.current_tenant() is null then
    return '';
  end if;
  select coalesce(csc_token, '') into v_token
  from public.shop_fiscal
  where tenant_id = public.current_tenant();
  return coalesce(v_token, '');
end;
$$;

revoke all on function public.shop_csc_token() from public, anon;
grant execute on function public.shop_csc_token() to authenticated;

create or replace function public.save_sale_nfce(
  p_sale_id uuid,
  p_series integer,
  p_number integer,
  p_access_key text,
  p_xml text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop uuid := public.current_tenant();
  v_next integer;
  v_series integer;
begin
  if auth.uid() is null or not public.is_admin() or v_shop is null then
    raise exception 'Só o administrador gera o XML';
  end if;
  if not exists (select 1 from public.sales where id = p_sale_id and tenant_id = v_shop) then
    raise exception 'Venda não encontrada';
  end if;
  if exists (select 1 from public.sale_invoices where sale_id = p_sale_id) then
    return;
  end if;
  select nfce_series, nfce_next_number into v_series, v_next
  from public.shop_fiscal
  where tenant_id = v_shop
  for update;
  if v_series is null then
    raise exception 'Cadastre a empresa antes de gerar o XML';
  end if;
  if v_series <> p_series or v_next <> p_number then
    raise exception 'O número da nota mudou. Gere o XML de novo';
  end if;
  insert into public.sale_invoices (sale_id, tenant_id, series, number, access_key, xml)
  values (p_sale_id, v_shop, p_series, p_number, p_access_key, p_xml);
  update public.shop_fiscal
  set nfce_next_number = nfce_next_number + 1, updated_at = now()
  where tenant_id = v_shop;
end;
$$;

revoke all on function public.save_sale_nfce(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.save_sale_nfce(uuid, integer, integer, text, text) to authenticated;

create or replace function public.attach_invoice_key(p_purchase_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop uuid := public.current_tenant();
  v_key text := regexp_replace(coalesce(p_key, ''), '\D', '', 'g');
begin
  if auth.uid() is null or not public.is_admin() or v_shop is null then
    raise exception 'Só o administrador grava a chave da nota';
  end if;
  if v_key !~ '^[0-9]{44}$' then
    raise exception 'A chave da nota tem 44 dígitos';
  end if;
  update public.purchases
  set invoice_key = v_key
  where id = p_purchase_id and tenant_id = v_shop;
  if not found then
    raise exception 'Compra não encontrada';
  end if;
end;
$$;

revoke all on function public.attach_invoice_key(uuid, text) from public, anon;
grant execute on function public.attach_invoice_key(uuid, text) to authenticated;

notify pgrst, 'reload schema';
