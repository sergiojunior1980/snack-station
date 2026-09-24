"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { formatBRL } from "@/lib/money";
import { registerPurchase, type ActionState } from "@/server/actions";
import type { Product } from "@/server/queries";

type Line = { key: string; productId: string; quantity: string; cost: string };

export function PurchaseDesk({ products, methods }: { products: Product[]; methods: { id: string; name: string }[] }) {
  const [lines, setLines] = useState<Line[]>([{ key: "1", productId: products[0]?.id ?? "", quantity: "1", cost: "" }]);
  const [state, action, pending] = useActionState(registerPurchase, null as ActionState);
  const [handledState, setHandledState] = useState(state);

  if (state?.ok && state !== handledState) {
    setHandledState(state);
    setLines([{ key: crypto.randomUUID(), productId: products[0]?.id ?? "", quantity: "1", cost: "" }]);
  }

  function update(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  const payload = lines
    .map((line) => {
      const quantity = Number(line.quantity);
      const cost = Math.round(Number(line.cost.replace(",", ".")) * 100);
      return { product_id: line.productId, quantity, unit_cost_cents: cost };
    })
    .filter((line) => line.product_id && line.quantity > 0 && Number.isFinite(line.unit_cost_cents) && line.unit_cost_cents >= 0);

  const total = payload.reduce((sum, line) => sum + line.quantity * line.unit_cost_cents, 0);

  return (
    <form
      action={action}
      className="space-y-4 rounded-2xl border bg-card p-5"
    >
      <input type="hidden" name="items" value={JSON.stringify(payload)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="supplier">Fornecedor</Label>
          <Input id="supplier" name="supplier" placeholder="Mercado, distribuidora..." />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payment">Pagamento</Label>
          <Select id="payment" name="payment" defaultValue={methods[0]?.id ?? "dinheiro"}>
            {methods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="note">Observação</Label>
          <Input id="note" name="note" placeholder="Nota, lote, o que quiser lembrar" />
        </div>
      </div>
      <div className="space-y-3">
        {lines.map((line) => (
          <div key={line.key} className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_90px_120px_auto]">
            <Select value={line.productId} onChange={(event) => update(line.key, { productId: event.target.value })}>
              {products.filter((product) => !product.is_combo).map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </Select>
            <Input inputMode="numeric" value={line.quantity} onChange={(event) => update(line.key, { quantity: event.target.value })} placeholder="Qtd" />
            <Input inputMode="decimal" value={line.cost} onChange={(event) => update(line.key, { cost: event.target.value })} placeholder="Custo un. 2,40" />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLines((current) => (current.length === 1 ? current : current.filter((item) => item.key !== line.key)))}
            >
              Excluir
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setLines((current) => [...current, { key: crypto.randomUUID(), productId: products[0]?.id ?? "", quantity: "1", cost: "" }])}
        >
          Adicionar item
        </Button>
        <p className="text-sm">
          Total da compra <span className="font-heading text-xl">{formatBRL(total)}</span>
        </p>
      </div>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
      <Button disabled={pending || payload.length === 0}>{pending ? "Lançando…" : "Lançar compra e somar estoque"}</Button>
    </form>
  );
}
