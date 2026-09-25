drop policy if exists "excluir produtos" on public.products;
create policy "excluir produtos" on public.products
  for delete to authenticated using (true);
