"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label, Select } from "@/components/ui/input";
import { launchSupplierInvoice, readSupplierInvoice, type ImportLine, type PurchaseDraft, type PurchaseImportState } from "@/server/fiscal";
import type { Product } from "@/server/queries";

export function PurchaseInvoiceDesk({
  products,
  methods,
}: {
  products: Product[];
  methods: { id: string; name: string }[];
}) {
  const [readState, read, reading] = useActionState(readSupplierInvoice, null as PurchaseImportState);
  const [launchState, launch, launching] = useActionState(launchSupplierInvoice, null as PurchaseImportState);
  const [seen, setSeen] = useState(readState);
  const [draft, setDraft] = useState<PurchaseDraft | null>(null);
  if (readState?.draft && readState !== seen) {
    setSeen(readState);
    setDraft(readState.draft);
  }
  const options = products.filter((product) => !product.is_combo).map((product) => ({ value: product.id, label: product.name }));
  const lines = draft?.lines ?? [];

  function patch(key: string, next: Partial<ImportLine>) {
    setDraft((current) => current ? { ...current, lines: current.lines.map((line) => line.key === key ? { ...line, ...next } : line) } : current);
  }

  return (
    <div className="space-y-4">
      <form action={read} className="space-y-3 rounded-xl border bg-card p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="accessKey">Chave da nota</Label>
            <Input id="accessKey" name="accessKey" inputMode="numeric" placeholder="44 dígitos, se você já tiver a chave" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="xml">XML do fornecedor</Label>
            <Input id="xml" name="xml" type="file" accept=".xml,text/xml,application/xml" required />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">A chave sozinha não traz os itens. O XML do fornecedor preenche a compra.</p>
        {readState?.error ? <p className="text-sm text-destructive">{readState.error}</p> : null}
        <Button disabled={reading}>{reading ? "Lendo…" : "Carregar nota"}</Button>
      </form>

      {draft ? (
        <form action={launch} className="space-y-3 rounded-xl border bg-card p-3">
          <input type="hidden" name="accessKey" value={draft.accessKey} />
          <input type="hidden" name="lines" value={JSON.stringify(lines)} />
          <p className="text-sm text-muted-foreground">Chave {draft.accessKey}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="purchasedOn">Data da compra</Label>
              <Input id="purchasedOn" name="purchasedOn" type="date" required value={draft.purchasedOn} onChange={(event) => setDraft({ ...draft, purchasedOn: event.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="supplier">Fornecedor</Label>
              <Input id="supplier" name="supplier" required value={draft.supplier} onChange={(event) => setDraft({ ...draft, supplier: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment">Forma de pagamento</Label>
              <Select id="payment" name="payment" defaultValue={methods[0]?.id ?? "dinheiro"}>
                {methods.map((method) => (
                  <option key={method.id} value={method.id}>{method.name}</option>
                ))}
              </Select>
            </div>
          </div>
          {lines.map((line, index) => (
            <div key={line.key} className="space-y-2 rounded-lg border p-2">
              <p className="text-sm font-medium">Item {index + 1} · {line.name}</p>
              {line.warning ? <p className="text-xs text-destructive">{line.warning}</p> : null}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Combobox
                  name={`product-${line.key}`}
                  label="Produto no estoque"
                  placeholder="Escolha o produto"
                  searchPlaceholder="Buscar produto"
                  emptyLabel="Nenhum produto encontrado."
                  value={line.productId}
                  onChange={(productId) => patch(line.key, { productId })}
                  options={options}
                />
                <div className="space-y-1">
                  <Label htmlFor={`qty-${line.key}`}>Quantidade</Label>
                  <Input id={`qty-${line.key}`} value={line.quantity} onChange={(event) => patch(line.key, { quantity: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`cost-${line.key}`}>Custo unitário</Label>
                  <Input id={`cost-${line.key}`} value={line.cost} onChange={(event) => patch(line.key, { cost: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`expires-${line.key}`}>Validade</Label>
                  <Input id={`expires-${line.key}`} type="date" value={line.expires} onChange={(event) => patch(line.key, { expires: event.target.value })} />
                </div>
              </div>
            </div>
          ))}
          {launchState?.error ? <p className="text-sm text-destructive">{launchState.error}</p> : null}
          {launchState?.ok ? <p className="text-sm text-emerald-700">{launchState.ok}</p> : null}
          <Button disabled={launching}>{launching ? "Lançando…" : "Lançar compra"}</Button>
        </form>
      ) : null}
    </div>
  );
}
