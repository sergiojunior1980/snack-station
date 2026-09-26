"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label, Select } from "@/components/ui/input";
import { formatBRL } from "@/lib/money";
import { deletePurchase, registerPurchase, updatePurchase, type ActionState } from "@/server/actions";
import type { Product } from "@/server/queries";

export type SavedPurchase = {
  id: string;
  total_cents: number;
  supplier: string | null;
  payment_method: string | null;
  created_at: string;
  purchased_on: string | null;
  purchase_items: {
    product_id: string;
    product_name: string;
    quantity: number;
    unit_cost_cents: number;
    barcode: string | null;
    expires_on: string | null;
  }[] | null;
};

type Line = { key: string; productId: string; barcode: string; quantity: string; cost: string; expires: string };

function todayInput() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function blankLine(productId = "", key = "1"): Line {
  return { key, productId, barcode: "", quantity: "1", cost: "", expires: "" };
}

export function PurchaseDesk({
  products,
  methods,
  purchase,
  onDone,
}: {
  products: Product[];
  methods: { id: string; name: string }[];
  purchase?: SavedPurchase;
  onDone?: () => void;
}) {
  const simples = products.filter((product) => !product.is_combo);
  const options = simples.map((product) => ({ value: product.id, label: product.name }));
  const formId = purchase?.id ?? "nova";
  const [lines, setLines] = useState<Line[]>(
    purchase?.purchase_items?.length
      ? purchase.purchase_items.map((item, index) => ({
          key: `${index}-${item.product_id}`,
          productId: item.product_id,
          barcode: item.barcode ?? "",
          quantity: String(item.quantity),
          cost: (item.unit_cost_cents / 100).toFixed(2).replace(".", ","),
          expires: item.expires_on ?? "",
        }))
      : [blankLine(simples[0]?.id ?? "")],
  );
  const [purchasedOn, setPurchasedOn] = useState(purchase?.purchased_on ?? todayInput());
  const [supplier, setSupplier] = useState(purchase?.supplier ?? "");
  const [payment, setPayment] = useState(purchase?.payment_method ?? methods[0]?.id ?? "dinheiro");
  const [state, action, pending] = useActionState(purchase ? updatePurchase : registerPurchase, null as ActionState);
  const handledState = useRef(state);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!state?.ok || state === handledState.current) return;
    handledState.current = state;
    onDone?.();
  }, [state, onDone]);

  function update(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  const payload = lines
    .map((line) => {
      const quantity = Number(line.quantity);
      const cost = Math.round(Number(line.cost.replace(",", ".")) * 100);
      return {
        product_id: line.productId,
        quantity,
        unit_cost_cents: cost,
        barcode: line.barcode.trim(),
        expires_on: line.expires,
      };
    })
    .filter((line) => line.product_id && line.quantity > 0 && Number.isFinite(line.unit_cost_cents) && line.unit_cost_cents >= 0 && line.expires_on);

  const total = payload.reduce((sum, line) => sum + line.quantity * line.unit_cost_cents, 0);

  return (
    <>
    <form action={action} className="space-y-2 rounded-xl border bg-card p-3">
      {purchase ? <input type="hidden" name="id" value={purchase.id} /> : null}
      <input type="hidden" name="items" value={JSON.stringify(payload)} />
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`purchasedOn-${formId}`}>Data da compra</Label>
          <Input id={`purchasedOn-${formId}`} name="purchasedOn" type="date" required value={purchasedOn} onChange={(event) => setPurchasedOn(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`supplier-${formId}`}>Fornecedor</Label>
          <Input id={`supplier-${formId}`} name="supplier" required placeholder="Mercado, distribuidora..." value={supplier} onChange={(event) => setSupplier(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`payment-${formId}`}>Forma de pagamento</Label>
          <Select id={`payment-${formId}`} name="payment" value={payment} onChange={(event) => setPayment(event.target.value)}>
            {methods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`invoice-${formId}`}>Imagem da nota</Label>
          <Input id={`invoice-${formId}`} name="invoice" type="file" accept="image/jpeg,image/png,image/webp" />
          <p className="text-xs text-muted-foreground">Opcional. JPG, PNG ou WebP, até 5 MB.</p>
        </div>
      </div>
      <div className="space-y-2">
        {lines.map((line, index) => (
          <div key={line.key} className="space-y-2 rounded-lg border p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Item {index + 1}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={lines.length === 1}
                onClick={() => setLines((current) => (current.length === 1 ? current : current.filter((item) => item.key !== line.key)))}
              >
                Excluir
              </Button>
            </div>
            <div className="flex flex-nowrap items-end gap-2">
              <div className="min-w-0 flex-[2_1_0%]">
                <Combobox
                  name={`description-${line.key}`}
                  label="Descrição"
                  placeholder="Escolha o produto"
                  searchPlaceholder="Buscar produto"
                  emptyLabel="Nenhum produto encontrado."
                  options={options}
                  value={line.productId}
                  onChange={(productId) => update(line.key, { productId })}
                />
              </div>
              <div className="min-w-0 flex-[1_1_0%] space-y-1">
                <Label className="block truncate whitespace-nowrap" htmlFor={`barcode-${line.key}`}>Código de barras</Label>
                <Input id={`barcode-${line.key}`} className="min-w-0" inputMode="numeric" value={line.barcode} onChange={(event) => update(line.key, { barcode: event.target.value })} placeholder="Opcional" />
              </div>
              <div className="min-w-0 flex-[0.5_1_0%] space-y-1">
                <Label className="block truncate whitespace-nowrap" htmlFor={`qty-${line.key}`}>Quantidade</Label>
                <Input id={`qty-${line.key}`} className="min-w-0" inputMode="numeric" value={line.quantity} onChange={(event) => update(line.key, { quantity: event.target.value })} />
              </div>
              <div className="min-w-0 flex-[0.5_1_0%] space-y-1">
                <Label className="block truncate whitespace-nowrap" htmlFor={`cost-${line.key}`}>Valor unitário</Label>
                <Input id={`cost-${line.key}`} className="min-w-0" inputMode="decimal" value={line.cost} onChange={(event) => update(line.key, { cost: event.target.value })} placeholder="2,40" />
              </div>
              <div className="min-w-0 flex-[0.8_1_0%] space-y-1">
                <Label className="block truncate whitespace-nowrap" htmlFor={`expires-${line.key}`}>Data de validade</Label>
                <Input id={`expires-${line.key}`} className="min-w-0" type="date" required value={line.expires} min={purchasedOn} onChange={(event) => update(line.key, { expires: event.target.value })} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="secondary" onClick={() => setLines((current) => [...current, blankLine(simples[0]?.id ?? "", crypto.randomUUID())])}>
          Adicionar item
        </Button>
        <p className="text-sm">
          Total da compra <span className="font-heading text-xl">{formatBRL(total)}</span>
        </p>
      </div>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || payload.length !== lines.length}>
          {pending ? "Salvando…" : purchase ? "Salvar compra" : "Lançar compra e somar estoque"}
        </Button>
        {purchase && onDone ? (
          <Button type="button" variant="outline" onClick={onDone}>
            Cancelar
          </Button>
        ) : null}
        {purchase ? (
          <Button type="button" variant="outline" onClick={() => setConfirmDelete(true)}>
            Excluir
          </Button>
        ) : null}
      </div>
    </form>
    {purchase && confirmDelete ? (
      <DeletePurchaseDialog id={purchase.id} onClose={() => setConfirmDelete(false)} onDone={onDone} />
    ) : null}
    </>
  );
}

export function PurchaseScreen({
  products,
  purchases,
  methods,
}: {
  products: Product[];
  purchases: SavedPurchase[];
  methods: { id: string; name: string }[];
}) {
  const [generation, setGeneration] = useState(0);

  return (
    <PurchaseWorkspace
      key={generation}
      products={products}
      purchases={purchases}
      methods={methods}
      onReset={() => setGeneration((current) => current + 1)}
    />
  );
}

function PurchaseWorkspace({
  products,
  purchases,
  methods,
  onReset,
}: {
  products: Product[];
  purchases: SavedPurchase[];
  methods: { id: string; name: string }[];
  onReset: () => void;
}) {
  return (
    <>
      <PurchaseDesk products={products} methods={methods} onDone={onReset} />
      <section className="space-y-3">
        <h2 className="font-heading text-2xl">Compras recentes</h2>
        <PurchaseHistory purchases={purchases} products={products} methods={methods} onReset={onReset} />
      </section>
    </>
  );
}

export function PurchaseHistory({
  purchases,
  products,
  methods,
  onReset,
}: {
  purchases: SavedPurchase[];
  products: Product[];
  methods: { id: string; name: string }[];
  onReset: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
      {purchases.length === 0 ? (
        <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma compra lançada.</li>
      ) : (
        purchases.map((purchase) => {
          const items = purchase.purchase_items ?? [];
          const open = editing === purchase.id;
          return (
            <li key={purchase.id} className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm">{items.map((item) => `${item.quantity}× ${item.product_name}`).join(", ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {purchase.purchased_on ? purchase.purchased_on.split("-").reverse().join("/") : purchase.created_at}
                    {purchase.supplier ? ` · ${purchase.supplier}` : ""}
                    {purchase.payment_method ? ` · ${methods.find((method) => method.id === purchase.payment_method)?.name ?? purchase.payment_method}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{formatBRL(purchase.total_cents)}</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditing(open ? null : purchase.id)}>
                    {open ? "Fechar" : "Editar"}
                  </Button>
                </div>
              </div>
              {open ? <PurchaseDesk products={products} methods={methods} purchase={purchase} onDone={onReset} /> : null}
            </li>
          );
        })
      )}
    </ul>
  );
}

function DeletePurchaseDialog({ id, onClose, onDone }: { id: string; onClose: () => void; onDone?: () => void }) {
  const [state, action, pending] = useActionState(deletePurchase, null as ActionState);
  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form action={action} className="w-full max-w-md space-y-3 rounded-2xl bg-card p-5 shadow-lg">
        <input type="hidden" name="id" value={id} />
        <p className="font-heading text-xl">Excluir esta compra?</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>O registro da compra some da lista e do financeiro.</li>
          <li>O estoque que entrou com ela é retirado e o custo médio é recalculado.</li>
          <li>Se o pagamento abateu a conta corrente, esse valor volta para a conta.</li>
          <li>A exclusão fica gravada na fita de compras e estoque.</li>
          <li>Se parte dessa compra já saiu do estoque, a exclusão é bloqueada.</li>
        </ul>
        {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>{pending ? "Excluindo…" : "Excluir compra"}</Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </div>
  );
}
