-- Cadastro simples: marca vale para tudo.
-- Só refrigerante e água pedem o tamanho em ml.
-- Rode este arquivo se o 002_categories.sql já foi executado antes.

delete from public.category_fields
where key <> 'volume_ml'
   or category_id not in (
     select id from public.categories where slug in ('refrigerante', 'agua')
   );

update public.category_fields
set label = 'Tamanho', unit = 'ml', required = true
where key = 'volume_ml';
