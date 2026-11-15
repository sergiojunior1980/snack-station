-- A logo e a foto do estabelecimento podem passar de 100 KB.

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'marca';

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
      'brand_place_photo_url',
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
      'brand_place_photo_url',
      'brand_tagline',
      'brand_tagline_note',
      'sale_filter_categories'
    )
  );
