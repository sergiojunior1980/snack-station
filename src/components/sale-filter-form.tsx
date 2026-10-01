"use client";

import { useActionState } from "react";
import { saveSaleFilters, type ActionState } from "@/server/actions";
import { Button } from "@/components/ui/button";

export function SaleFilterForm({
  categories,
  selected,
}: {
  categories: { slug: string; name: string }[];
  selected: string[] | null;
}) {
  const [state, action, pending] = useActionState(saveSaleFilters, null as ActionState);

  return (
    <form action={action} className="space-y-3 rounded-2xl border bg-card p-4">
      <div>
        <h2 className="font-heading text-xl">Filtros da venda</h2>
        <p className="text-sm text-muted-foreground">Escolha as categorias que aparecem como botões na tela de venda. O botão Tudo continua sempre visível.</p>
      </div>
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">Cadastre uma categoria para escolher os filtros.</p>
      ) : (
        <div className="space-y-2">
          {categories.map((category) => (
            <label key={category.slug} className="flex items-center text-sm">
              <input
                type="checkbox"
                name="category"
                value={category.slug}
                defaultChecked={selected === null || selected.includes(category.slug)}
                className="mr-3 size-4 shrink-0 accent-primary"
              />
              {category.name}
            </label>
          ))}
        </div>
      )}
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
      <Button disabled={pending || categories.length === 0}>{pending ? "Salvando…" : "Salvar parâmetros"}</Button>
    </form>
  );
}
