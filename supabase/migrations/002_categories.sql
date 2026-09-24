-- Categorias com campos próprios. Rode no SQL Editor depois do 001_init.sql.

alter table public.products drop constraint if exists products_category_check;

update public.products set category = 'biscoito-doce' where category = 'biscoito';
update public.products set category = 'chocolate' where category = 'doce';

alter table public.products
  add column if not exists attributes jsonb not null default '{}'::jsonb;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0
);

create table if not exists public.category_fields (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  key text not null,
  label text not null,
  field_type text not null check (field_type in ('text', 'number', 'select')),
  unit text,
  options text[] not null default '{}',
  required boolean not null default false,
  sort_order integer not null default 0,
  unique (category_id, key)
);

insert into public.categories (name, slug, sort_order) values
  ('Refrigerante', 'refrigerante', 1),
  ('Biscoito doce', 'biscoito-doce', 2),
  ('Biscoito salgado', 'biscoito-salgado', 3),
  ('Bala', 'bala', 4),
  ('Chocolate', 'chocolate', 5),
  ('Água', 'agua', 6),
  ('Outro', 'outro', 7)
on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order;

insert into public.category_fields (category_id, key, label, field_type, unit, options, required, sort_order)
select c.id, f.key, f.label, f.field_type, f.unit, f.options, f.required, f.sort_order
from public.categories c
join (
  values
    ('refrigerante', 'volume_ml', 'Tamanho', 'number', 'ml', '{}'::text[], true, 1),
    ('agua', 'volume_ml', 'Tamanho', 'number', 'ml', '{}'::text[], true, 1)
) as f(slug, key, label, field_type, unit, options, required, sort_order)
  on f.slug = c.slug
on conflict (category_id, key) do update
set label = excluded.label,
    field_type = excluded.field_type,
    unit = excluded.unit,
    options = excluded.options,
    required = excluded.required,
    sort_order = excluded.sort_order;

delete from public.category_fields
where key <> 'volume_ml'
   or category_id not in (select id from public.categories where slug in ('refrigerante', 'agua'));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_category_slug_fkey'
  ) then
    alter table public.products
      add constraint products_category_slug_fkey
      foreign key (category) references public.categories (slug);
  end if;
end $$;

alter table public.categories enable row level security;
alter table public.category_fields enable row level security;

drop policy if exists "ler categorias" on public.categories;
create policy "ler categorias" on public.categories
  for select to authenticated using (true);

drop policy if exists "ler campos da categoria" on public.category_fields;
create policy "ler campos da categoria" on public.category_fields
  for select to authenticated using (true);
