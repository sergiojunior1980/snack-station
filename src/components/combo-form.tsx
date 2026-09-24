"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { saveCombo, type ActionState } from "@/server/actions";
import type { Product } from "@/server/queries";

export function ComboForm({ products }: { products: Product[] }) {
  const simples = products.filter((product) => !product.is_combo && product.active);
  const [parts, setParts] = useState([
    { key: "1", productId: simples[0]?.id ?? "", quantity: "1" },
    { key: "2", productId: simples[1]?.id ?? simples[0]?.id ?? "", quantity: "1" },
  ]);
  const [state, action, pending] = useActionState(saveCombo, null as ActionState);
  const payload = parts
    .map((part) => ({ product_id: part.productId, quantity: Number(part.quantity) }))
    .filter((part) => part.product_id && part.quantity > 0);

  return (
    <form action={action} className="space-y-3 rounded-2xl border bg-card p-5">
      <h2 className="font-heading text-2xl">Combo</h2>
      <p className="text-sm text-muted-foreground">Junte 2 ou mais produtos. Na venda, o estoque sai de cada item do combo.</p>
      <input type="hidden" name="parts" value={JSON.stringify(payload)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="combo-name">Nome da promoção</Label>
          <Input id="combo-name" name="name" required placeholder="Lanche da tarde" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="combo-price">Preço do combo</Label>
          <Input id="combo-price" name="price" required placeholder="8,00" />
        </div>
      </div>
      {parts.map((part) => (
        <div key={part.key} className="grid grid-cols-[1fr_90px] gap-2">
          <Select
            value={part.productId}
            onChange={(event) => setParts((current) => current.map((row) => (row.key === part.key ? { ...row, productId: event.target.value } : row)))}
          >
            {simples.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            min={1}
            value={part.quantity}
            onChange={(event) => setParts((current) => current.map((row) => (row.key === part.key ? { ...row, quantity: event.target.value } : row)))}
          />
        </div>
      ))}
      <button
        type="button"
        className="text-sm font-medium text-primary"
        onClick={() => setParts((current) => [...current, { key: crypto.randomUUID(), productId: simples[0]?.id ?? "", quantity: "1" }])}
      >
        Incluir produto
      </button>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
      <Button disabled={pending || simples.length < 2}>{pending ? "Criando…" : "Criar combo"}</Button>
    </form>
  );
}
