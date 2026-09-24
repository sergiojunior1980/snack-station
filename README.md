# Snack Station

Controle de estoque e vendas da estação de lanches da escola de inglês. Refrigerante, doce, biscoito, água e o que mais entrar no balcão.

O app usa a mesma base do Cifra: **Next.js**, **TypeScript** e **Tailwind**. Os dados ficam no **Supabase** — cadastro, login, produtos, vendas e compras. Nada fica só na memória do navegador.

## O que o MVP faz

- Cadastro, login e senha
- Produtos com preço, categoria e estoque
- Venda que **subtrai** o estoque
- Compra de mercadoria que **soma** o estoque
- Faturamento de hoje, da semana, do mês e dos últimos 30 dias
- Gráfico por dia, por semana e por mês
- Os 10 produtos mais vendidos
- Produtos que não venderam no período

O estoque é compartilhado por quem tem conta. Venda e compra mudam a quantidade dentro do banco, na mesma transação.

## Preparar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Em **SQL Editor**, cole e execute `supabase/migrations/001_init.sql`
3. Em **Authentication → Providers → Email**, desligue **Confirm email** se quiser entrar logo depois do cadastro
4. Em **Project Settings → API**, copie a URL e a chave `anon`
5. Copie `.env.example` para `.env.local` e cole os dois valores

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Abre em [http://127.0.0.1:43181](http://127.0.0.1:43181).

## Branch

O trabalho está em `feat/snack-station-mvp`, pronto para subir no GitHub da mesma conta do Cifra quando você quiser.
