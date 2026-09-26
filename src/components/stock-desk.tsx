"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { formatBRL } from "@/lib/money";
import { registerStockMove, type ActionState } from "@/server/actions";
import type { StockProduct } from "@/server/queries";

export function StockDesk({ products }: { products: StockProduct[] }) {
  const [direction, setDirection] = useState("entrada");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [state, action, pending] = useActionState(registerStockMove, null as ActionState);
  const product = products.find((item) => item.id === productId);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  return (
    <form action={action} className="grid gap-3 rounded-2xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
        <h2 className="font-heading text-2xl">Movimentar estoque</h2>
        <p className="text-sm text-muted-foreground">
          A entrada recalcula o custo médio. A saída tira primeiro o lote que vence antes e mantém o custo médio.
          {product ? ` ${product.name} está em ${formatBRL(product.avg_cost_cents)} de custo médio.` : ""}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="direction">Movimento</Label>
        <Select id="direction" name="direction" value={direction} onChange={(event) => setDirection(event.target.value)}>
          <option value="entrada">Entrada</option>
          <option value="saida">Saída</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="productId">Produto</Label>
        <Select id="productId" name="productId" value={productId} onChange={(event) => setProductId(event.target.value)}>
          {products.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="quantity">Quantidade</Label>
        <Input id="quantity" name="quantity" type="number" min={1} required defaultValue="1" />
      </div>
      {direction === "entrada" ? (
        <div className="space-y-1.5">
          <Label htmlFor="cost">Custo unitário</Label>
          <Input id="cost" name="cost" required placeholder="2,40" />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="reason">Motivo</Label>
          <Select id="reason" name="reason" defaultValue="vencimento">
            <option value="vencimento">Vencimento</option>
            <option value="perda">Perda</option>
            <option value="consumo">Consumo interno</option>
            <option value="ajuste">Ajuste</option>
          </Select>
        </div>
      )}
      {direction === "entrada" ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="receivedOn">Data de entrada</Label>
            <Input id="receivedOn" name="receivedOn" type="date" required defaultValue={today} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expiresOn">Data de validade</Label>
            <Input id="expiresOn" name="expiresOn" type="date" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supplier">Fornecedor</Label>
            <Input id="supplier" name="supplier" placeholder="Mercado, distribuidora..." />
          </div>
        </>
      ) : null}
      <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
        <Label htmlFor="note">Observação</Label>
        <Input id="note" name="note" placeholder="Lote, nota ou o que motivou a saída" />
      </div>
      {state?.error ? <p className="text-sm text-destructive sm:col-span-2 lg:col-span-4">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700 sm:col-span-2 lg:col-span-4">{state.ok}</p> : null}
      <Button className="sm:col-span-2 lg:col-span-4" disabled={pending || products.length === 0}>{pending ? "Lançando…" : "Lançar"}</Button>
    </form>
  );
}
