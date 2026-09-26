"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { categoryLabel, paymentLabel } from "@/lib/catalog";
import { formatDateTime } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cancelSale, registerSale, type ActionState } from "@/server/actions";
import type { Product } from "@/server/queries";

export function SaleDesk({
  products = [],
  categories = [],
  cashOpen = true,
  methods = [],
}: {
  products: Product[];
  categories?: { slug: string; name: string }[];
  cashOpen?: boolean;
  methods?: { id: string; name: string; counts_as_cash?: boolean }[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("todos");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [payments, setPayments] = useState<{ key: string; method: string; amount: string }[]>([
    { key: "1", method: methods[0]?.id ?? "pix", amount: "" },
  ]);
  const [state, action, pending] = useActionState(registerSale, null as ActionState);
  const [handledState, setHandledState] = useState(state);
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, 4000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);

  if (state?.ok && state !== handledState) {
    setHandledState(state);
    setCart({});
    setPayments([{ key: crypto.randomUUID(), method: methods[0]?.id ?? "pix", amount: "" }]);
  }

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
  function cashMethod(methodId: string) {
    const method = methods.find((item) => item.id === methodId);
    return method ? Boolean(method.counts_as_cash) : methodId === "dinheiro";
  }

  const quoted = payments.map((item) => ({
    ...item,
    cents: payments.length === 1 && !cashMethod(item.method) ? total : parseCents(item.amount),
    cash: cashMethod(item.method),
  }));
  const nonCash = quoted.filter((item) => !item.cash).reduce((sum, item) => sum + item.cents, 0);
  const cashIn = quoted.filter((item) => item.cash).reduce((sum, item) => sum + item.cents, 0);
  const dueBeforeCash = Math.max(total - nonCash, 0);
  const restante = Math.max(dueBeforeCash - cashIn, 0);
  const troco = Math.max(cashIn - dueBeforeCash, 0);
  const paymentPayload = JSON.stringify(appliedPayments(quoted, dueBeforeCash));

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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
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
                  className="rounded-2xl border bg-card p-3 text-left shadow-[0_8px_20px_rgba(58,36,22,0.04)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{categoryLabel(product.category)}</p>
                    </div>
                    <Badge
                      tone={empty ? "high" : product.stock_quantity <= product.min_stock ? "watch" : "ok"}
                      className="shrink-0 whitespace-nowrap px-2 text-[10px]"
                    >
                      {product.stock_quantity} un
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-end justify-between">
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
        className="h-fit space-y-3 rounded-2xl border bg-card p-4 shadow-[0_10px_30px_rgba(58,36,22,0.05)] lg:sticky lg:top-4"
      >
        <div>
          <h2 className="font-heading text-2xl">Pedido</h2>
          <p className="text-sm text-muted-foreground">A venda debita o estoque na hora.</p>
        </div>
        <input type="hidden" name="items" value={items} />
        <input type="hidden" name="payments" value={paymentPayload} />
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
        <div className="space-y-2">
          <p className="text-sm font-medium">Pagamento</p>
          {payments.map((item) => (
            <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_7.5rem_auto] gap-2">
              <Select
                value={item.method}
                onChange={(event) =>
                  setPayments((current) => current.map((row) => (row.key === item.key ? { ...row, method: event.target.value } : row)))
                }
              >
                {methods
                  .filter((method) => method.id === item.method || !payments.some((row) => row.key !== item.key && row.method === method.id))
                  .map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.name}
                    </option>
                  ))}
              </Select>
              <Input
                inputMode="decimal"
                className="min-w-0"
                value={payments.length === 1 && !cashMethod(item.method) ? centsToInput(total) : item.amount}
                placeholder={cashMethod(item.method) ? "Recebido" : "0,00"}
                readOnly={payments.length === 1 && !cashMethod(item.method)}
                onChange={(event) =>
                  setPayments((current) => current.map((row) => (row.key === item.key ? { ...row, amount: event.target.value } : row)))
                }
              />
              <button
                type="button"
                className="text-xs text-muted-foreground"
                onClick={() => setPayments((current) => (current.length === 1 ? current : current.filter((row) => row.key !== item.key)))}
              >
                Excluir
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-sm font-medium text-primary disabled:opacity-40"
            disabled={payments.length >= methods.length}
            onClick={() =>
              setPayments((current) => {
                const used = new Set(current.map((row) => row.method));
                const method = methods.find((item) => !used.has(item.id))?.id;
                if (!method) return current;
                const kept = current.map((row) =>
                  current.length === 1 && !row.amount.trim() && !cashMethod(row.method) ? { ...row, amount: centsToInput(total) } : row,
                );
                return [...kept, { key: crypto.randomUUID(), method, amount: "" }];
              })
            }
          >
            + Forma Recebimento
          </button>
          <div className="grid grid-cols-2 gap-2">
            <div className={`rounded-2xl px-3 py-3 ${restante > 0 ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              <p className="text-xs font-medium uppercase tracking-wide">Faltante</p>
              <p className="font-heading text-2xl">{formatBRL(restante)}</p>
            </div>
            <div className={`rounded-2xl px-3 py-3 ${troco > 0 ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              <p className="text-xs font-medium uppercase tracking-wide">Troco</p>
              <p className="font-heading text-2xl">{formatBRL(troco)}</p>
            </div>
          </div>
        </div>
        {!cashOpen ? <p className="text-sm text-destructive">O caixa está fechado. A venda só entra com o caixa aberto.</p> : null}
        <Input name="note" placeholder="Observação (opcional)" />
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="font-heading text-2xl">{formatBRL(total)}</span>
        </div>
        {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
        <Button className="w-full" size="lg" disabled={pending || lines.length === 0 || !cashOpen || restante !== 0 || nonCash > total}>
          {pending ? "Registrando…" : "Registrar venda"}
        </Button>
      </form>
    </div>
  );
}

function appliedPayments(
  quoted: { method: string; cents: number; cash: boolean }[],
  dueBeforeCash: number,
) {
  let cashLeft = dueBeforeCash;
  return quoted
    .map((item) => {
      if (!item.cash) return { method: item.method, amount_cents: item.cents };
      const applied = Math.min(item.cents, cashLeft);
      cashLeft -= applied;
      return { method: item.method, amount_cents: applied };
    })
    .filter((item) => item.method && item.amount_cents > 0);
}

function parseCents(amount: string) {
  const cents = Math.round(Number(amount.replace(/\./g, "").replace(",", ".")) * 100);
  return Number.isFinite(cents) ? cents : 0;
}

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export type RecentSale = {
  id: string;
  total_cents: number;
  payment_method: string;
  seller_name: string;
  created_at: string;
  sale_items: { product_name: string; quantity: number }[] | null;
  sale_payments: { payment_method: string; amount_cents: number }[] | null;
};

export function RecentSales({
  sales,
  methods,
}: {
  sales: RecentSale[];
  methods: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);

  return (
    <>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {sales.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma venda ainda.</li>
        ) : (
          sales.map((sale) => {
            const items = sale.sale_items ?? [];
            const open = editing === sale.id;
            const payments = paymentSummary(sale, methods);
            return (
              <li key={sale.id} className="space-y-3 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm">{items.map((item) => `${item.quantity}× ${item.product_name}`).join(", ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {sale.seller_name} · {formatDateTime(sale.created_at)}
                    </p>
                    <p className="text-xs text-muted-foreground">{payments}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{formatBRL(sale.total_cents)}</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditing(open ? null : sale.id)}>
                      {open ? "Fechar" : "Editar"}
                    </Button>
                  </div>
                </div>
                {open ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3">
                    <p className="text-sm text-muted-foreground">Cancele a venda para estornar o recebimento e devolver o estoque.</p>
                    <Button type="button" onClick={() => setCanceling(sale.id)}>
                      Cancelar venda
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
      {canceling ? (
        <CancelSaleDialog
          id={canceling}
          onClose={() => setCanceling(null)}
          onDone={() => {
            setCanceling(null);
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

function paymentSummary(sale: RecentSale, methods: { id: string; name: string }[]) {
  const rows = [...(sale.sale_payments ?? [])].sort((a, b) => methodOrder(a.payment_method, methods) - methodOrder(b.payment_method, methods));
  if (rows.length === 0) {
    return `${methodName(sale.payment_method, methods)} ${formatBRL(sale.total_cents)}`;
  }
  return rows.map((row) => `${methodName(row.payment_method, methods)} ${formatBRL(row.amount_cents)}`).join(" + ");
}

function methodOrder(id: string, methods: { id: string; name: string }[]) {
  const index = methods.findIndex((method) => method.id === id);
  return index < 0 ? methods.length : index;
}

function methodName(id: string, methods: { id: string; name: string }[]) {
  return methods.find((method) => method.id === id)?.name ?? paymentLabel(id);
}

function CancelSaleDialog({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [state, action, pending] = useActionState(cancelSale, null as ActionState);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form action={action} className="w-full max-w-md space-y-3 rounded-2xl bg-card p-5 shadow-lg">
        <input type="hidden" name="id" value={id} />
        <p className="font-heading text-xl">Cancelar esta venda?</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>A venda some da lista, do painel e do financeiro.</li>
          <li>O estoque dos itens vendidos volta, inclusive o dos produtos do combo.</li>
          <li>Se houve recebimento em dinheiro, esse valor sai do caixa esperado.</li>
          <li>O cancelamento fica gravado na fita de caixa e vendas.</li>
        </ul>
        {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>{pending ? "Cancelando…" : "Cancelar venda"}</Button>
          <Button type="button" variant="outline" onClick={onClose}>Voltar</Button>
        </div>
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
