-- Quem tem o menu Configurações pode gravar os filtros da tela de venda.

drop policy if exists "configuracao grava marca" on public.app_settings;
create policy "configuracao grava marca" on public.app_settings
  for all to authenticated
  using (
    tenant_id = public.current_tenant()
    and public.has_menu('configuracoes')
    and key in (
      'brand_button_color',
      'brand_background_color',
      'brand_logo_url',
      'brand_tagline',
      'brand_tagline_note',
      'sale_filter_categories'
    )
  )
  with check (
    tenant_id = public.current_tenant()
    and public.has_menu('configuracoes')
    and key in (
      'brand_button_color',
      'brand_background_color',
      'brand_logo_url',
      'brand_tagline',
      'brand_tagline_note',
      'sale_filter_categories'
    )
  );
