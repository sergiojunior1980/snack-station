-- Categoria inativa continua no cadastro, mas sai dos filtros da venda.

alter table public.categories add column if not exists active boolean not null default true;
