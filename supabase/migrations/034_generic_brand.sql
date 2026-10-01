-- Loja nova nasce com uma frase neutra. A frase já salva de cada loja permanece.

create or replace function public.shop_login_brand(p_shop text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shop text := lower(trim(coalesce(p_shop, '')));
  v_id uuid;
  v_name text;
begin
  if v_shop !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    return null;
  end if;
  select id, name into v_id, v_name
  from public.tenants
  where slug = v_shop and status = 'active';
  if v_id is null then
    return null;
  end if;
  return jsonb_build_object(
    'name', v_name,
    'logo_url', coalesce((select value from public.app_settings where tenant_id = v_id and key = 'brand_logo_url'), ''),
    'tagline', coalesce(nullif((select value from public.app_settings where tenant_id = v_id and key = 'brand_tagline'), ''), 'A venda sai. O estoque acompanha.'),
    'tagline_note', coalesce(nullif((select value from public.app_settings where tenant_id = v_id and key = 'brand_tagline_note'), ''), 'Cada venda baixa o estoque e cada compra repõe, com o faturamento do dia na mão.'),
    'button_color', coalesce((select value from public.app_settings where tenant_id = v_id and key = 'brand_button_color'), '#b8002e'),
    'background_color', coalesce((select value from public.app_settings where tenant_id = v_id and key = 'brand_background_color'), '#fff7f7')
  );
end;
$$;

revoke all on function public.shop_login_brand(text) from public;
grant execute on function public.shop_login_brand(text) to anon, authenticated;

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
    (p_shop, 'brand_logo_url', ''),
    (p_shop, 'brand_tagline', 'A venda sai. O estoque acompanha.'),
    (p_shop, 'brand_tagline_note', 'Cada venda baixa o estoque e cada compra repõe, com o faturamento do dia na mão.')
  on conflict (tenant_id, key) do nothing;
end;
$$;
