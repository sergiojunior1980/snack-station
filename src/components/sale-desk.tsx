"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import { Minus, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { categoryLabel, paymentMethods } from "@/lib/catalog";
import { formatBRL } from "@/lib/money";
import { registerSale, type ActionState } from "@/server/actions";
import type { Product } from "@/server/queries";

export function SaleDesk({
  products = [],
  categories = [],
}: {
  products: Product[];
  categories?: { slug: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("todos");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [payment, setPayment] = useState("pix");
  const [state, action, pending] = useActionState(registerSale, null as ActionState);

  useEffect(() => {
    if (state?.ok) setCart({});
  }, [state]);

  const visible = useMemo(() => {
    return (products ?? []).filter((product) => {
      const matchesCategory = category === "todos" || product.category === category;
      const matchesQuery = product.name.toLowerCase().includes(query.trim().toLowerCase());
      return product.active && matchesCategory && matchesQuery;
    });
  }, [products, category, query]);

  const lines = (products ?? [])
    .filter((product) => cart[product.id])
    .map((product) => ({ product, quantity: cart[product.id] }));
  const total = lines.reduce((sum, line) => sum + line.product.sale_price_cents * line.quantity, 0);
  const items = JSON.stringify(lines.map((line) => ({ product_id: line.product.id, quantity: line.quantity })));

  function add(product: Product) {
    setCart((current) => {
      const next = (current[product.id] ?? 0) + 1;
      if (next > product.stock_quantity) return current;
      return { ...current, [product.id]: next };
    });
  }

  function change(id: string, quantity: number) {
    setCart((current) => {
      const copy = { ...current };
      if (quantity <= 0) delete copy[id];
      else copy[id] = quantity;
      return copy;
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar refrigerante, doce, biscoito..." className="pl-9" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <FilterChip active={category === "todos"} onClick={() => setCategory("todos")}>
            Tudo
          </FilterChip>
          {(categories ?? []).map((item) => (
            <FilterChip key={item.slug} active={category === item.slug} onClick={() => setCategory(item.slug)}>
              {item.name}
            </FilterChip>
          ))}
        </div>
        {visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            Nenhum produto ativo com esse filtro.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((product) => {
              const inCart = cart[product.id] ?? 0;
              const empty = product.stock_quantity <= 0;
              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={empty}
                  onClick={() => add(product)}
                  className="rounded-2xl border bg-card p-4 text-left shadow-[0_8px_20px_rgba(58,36,22,0.04)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{categoryLabel(product.category)}</p>
                    </div>
                    <Badge tone={empty ? "high" : product.stock_quantity <= product.min_stock ? "watch" : "ok"}>
                      {product.stock_quantity} un
                    </Badge>
                  </div>
                  <div className="mt-4 flex items-end justify-between">
                    <p className="font-heading text-xl">{formatBRL(product.sale_price_cents)}</p>
                    {inCart > 0 ? <span className="text-xs font-medium text-primary">{inCart} no pedido</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <form
        action={action}
        className="h-fit space-y-4 rounded-2xl border bg-card p-5 shadow-[0_10px_30px_rgba(58,36,22,0.05)] lg:sticky lg:top-6"
      >
        <div>
          <h2 className="font-heading text-2xl">Pedido</h2>
          <p className="text-sm text-muted-foreground">A venda debita o estoque na hora.</p>
        </div>
        <input type="hidden" name="items" value={items} />
        {lines.length === 0 ? (
          <p className="rounded-xl bg-muted px-3 py-6 text-center text-sm text-muted-foreground">Toque num produto para começar.</p>
        ) : (
          <ul className="space-y-3">
            {lines.map((line) => (
              <li key={line.product.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{line.product.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBRL(line.product.sale_price_cents * line.quantity)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" className="rounded-full border p-1" onClick={() => change(line.product.id, line.quantity - 1)}>
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-6 text-center text-sm">{line.quantity}</span>
                  <button
                    type="button"
                    className="rounded-full border p-1"
                    onClick={() => change(line.product.id, Math.min(line.quantity + 1, line.product.stock_quantity))}
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-3 gap-2">
          {paymentMethods.map((method) => (
            <button
              key={method.id}
              type="button"
              onClick={() => setPayment(method.id)}
              className={`rounded-xl border px-2 py-2 text-xs font-medium ${payment === method.id ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}
            >
              {method.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="payment" value={payment} />
        <Input name="note" placeholder="Observação (opcional)" />
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="font-heading text-2xl">{formatBRL(total)}</span>
        </div>
        {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
        <Button className="w-full" size="lg" disabled={pending || lines.length === 0}>
          {pending ? "Registrando…" : "Registrar venda"}
        </Button>
      </form>
    </div>
  );
}

function FilterChip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm whitespace-nowrap ${active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
    >
      {children}
    </button>
  );
}
