-- Código oficial da forma de pagamento (tPag da NFC-e).

alter table public.payment_methods add column if not exists fiscal_code text;

alter table public.payment_methods drop constraint if exists payment_methods_fiscal_code_check;
alter table public.payment_methods add constraint payment_methods_fiscal_code_check
  check (
    fiscal_code is null
    or fiscal_code in (
      '01', '02', '03', '04', '05',
      '10', '11', '12', '13', '14', '15', '16', '17', '18', '19',
      '90', '99'
    )
  );

update public.payment_methods
set fiscal_code = '01'
where id = 'dinheiro' and fiscal_code is null;

update public.payment_methods
set fiscal_code = '17'
where id = 'pix' and fiscal_code is null;

create or replace function public.seed_shop(p_shop uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.payment_methods (tenant_id, id, name, kind, counts_as_cash, settles_balance, sort_order, fiscal_code) values
    (p_shop, 'dinheiro', 'Dinheiro', 'recebimento', true, false, 1, '01'),
    (p_shop, 'pix', 'PIX', 'recebimento', false, false, 2, '17'),
    (p_shop, 'cartao', 'Cartão', 'recebimento', false, false, 3, null),
    (p_shop, 'dinheiro', 'Dinheiro', 'pagamento', false, true, 1, '01'),
    (p_shop, 'pix', 'PIX', 'pagamento', false, false, 2, '17'),
    (p_shop, 'cartao', 'Cartão', 'pagamento', false, false, 3, null),
    (p_shop, 'saldo', 'Saldo da conta', 'pagamento', false, true, 4, null)
  on conflict (tenant_id, kind, id) do nothing;
  insert into public.app_settings (tenant_id, key, value) values
    (p_shop, 'stock_cost_mode', 'media'),
    (p_shop, 'brand_button_color', '#b8002e'),
    (p_shop, 'brand_background_color', '#fff7f7'),
    (p_shop, 'brand_logo_url', '')
  on conflict (tenant_id, key) do nothing;
end;
$$;
