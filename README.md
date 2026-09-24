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

## Banco local

O Supabase deste projeto sobe no Docker pela CLI. As migrations ficam em `supabase/migrations` e o seed em `supabase/seed.sql`.

```bash
pnpm db:start
pnpm db:reset
```

`pnpm db:reset` apaga só o Postgres local, recria o banco e aplica as migrations na ordem, depois o seed. Se uma migration nova conflitar com o histórico local, esse é o comando para limpar e reaplicar.

Para só aplicar o que ainda não rodou no banco local: `pnpm db:migration:up`. Para ver se os containers estão de pé: `pnpm db:health`. Para imprimir as URLs e chaves locais: `pnpm db:env`. `pnpm db:push` envia migrations novas para o projeto remoto já linkado, e não reseta o banco.

Isso não mexe no projeto que já está no supabase.com, exceto o `db:push`. O app continua lendo a URL e a chave do `.env.local`.

## Preparar o app

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Abre em [http://127.0.0.1:43181](http://127.0.0.1:43181).

## Branch

O trabalho está em `feat/snack-station-mvp`, pronto para subir no GitHub da mesma conta do Cifra quando você quiser.
