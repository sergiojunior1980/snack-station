-- O administrador troca a cor dos botões, a cor de fundo e a logo do canto superior.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marca', 'marca', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "marca publica" on storage.objects;
create policy "marca publica" on storage.objects
  for select to public
  using (bucket_id = 'marca');

drop policy if exists "admin envia marca" on storage.objects;
create policy "admin envia marca" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'marca' and public.is_admin());

drop policy if exists "admin troca marca" on storage.objects;
create policy "admin troca marca" on storage.objects
  for update to authenticated
  using (bucket_id = 'marca' and public.is_admin())
  with check (bucket_id = 'marca' and public.is_admin());

drop policy if exists "admin apaga marca" on storage.objects;
create policy "admin apaga marca" on storage.objects
  for delete to authenticated
  using (bucket_id = 'marca' and public.is_admin());

drop policy if exists "aparencia publica" on public.app_settings;
create policy "aparencia publica" on public.app_settings
  for select to anon
  using (key in ('brand_button_color', 'brand_background_color', 'brand_logo_url'));
