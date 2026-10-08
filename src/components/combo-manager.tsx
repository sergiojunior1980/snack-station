"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label, Select } from "@/components/ui/input";
import { formatBRL, parseBRLToCents } from "@/lib/money";
import { deleteProduct, saveCombo, updateCombo, type ActionState } from "@/server/actions";
import type { Category, Product } from "@/server/queries";

const comboOnly = "Este cadastro é apenas para combos. Inclua dois ou mais produtos diferentes.";

type Part = { key: string; productId: string; quantity: string };

export function ComboManager({ products, categories }: { products: Product[]; categories: Category[] }) {
  const combos = products.filter((product) => product.is_combo);
  const simples = products.filter((product) => !product.is_combo);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <ComboForm simples={simples} categories={categories} />
      <div className="grid gap-2 md:grid-cols-2">
        {combos.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground md:col-span-2">
            Nenhum combo cadastrado.
          </p>
        ) : (
          combos.map((combo) => (
            <article key={combo.id} className="rounded-xl border bg-card p-3 md:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">{combo.name}</h2>
                    <Badge tone="watch">Combo</Badge>
                    {!combo.active ? <Badge tone="muted">Inativo</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatBRL(combo.sale_price_cents)} · {categories.find((item) => item.slug === combo.category)?.name ?? combo.category}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{composition(combo, products)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditing(editing === combo.id ? null : combo.id)}>
                    {editing === combo.id ? "Fechar" : "Editar"}
                  </Button>
                  <DeleteCombo id={combo.id} />
                </div>
              </div>
              {editing === combo.id ? (
                <ComboForm combo={combo} simples={simples} categories={categories} onSaved={() => setEditing(null)} />
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function ComboForm({
  combo,
  simples,
  categories,
  onSaved,
}: {
  combo?: Product;
  simples: Product[];
  categories: Category[];
  onSaved?: () => void;
}) {
  const actionFn = combo ? updateCombo : saveCombo;
  const [state, action, pending] = useActionState(actionFn, null as ActionState);
  const [category, setCategory] = useState(combo?.category ?? "");
  const [parts, setParts] = useState<Part[]>(() => initialParts(combo));
  const [notice, setNotice] = useState("");
  const [seen, setSeen] = useState(state);
  const saved = useRef<ActionState>(null);
  const payload = parts
    .map((part) => ({ product_id: part.productId, quantity: Number(part.quantity) }))
    .filter((part) => part.product_id && Number.isInteger(part.quantity) && part.quantity > 0);
  const cost = payload.reduce((sum, part) => {
    const item = simples.find((product) => product.id === part.product_id);
    return sum + (item?.display_cost_cents ?? 0) * part.quantity;
  }, 0);

  if (!combo && state && state !== seen) {
    setSeen(state);
    if (state.error) setNotice(state.error);
    if (state.ok) {
      setParts([blankPart()]);
      setCategory("");
    }
  }

  useEffect(() => {
    if (!combo || !state?.ok || saved.current === state) return;
    saved.current = state;
    onSaved?.();
  }, [combo, onSaved, state]);

  return (
    <form
      action={action}
      className={combo ? "mt-4 space-y-3 border-t pt-4" : "space-y-3 rounded-xl border bg-card p-3"}
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        const message = comboIssues({
          name: String(data.get("name") ?? ""),
          category,
          price: String(data.get("price") ?? ""),
          parts: payload,
        });
        if (!message) return;
        event.preventDefault();
        setNotice(message);
      }}
    >
      {notice ? <Notice message={notice} onClose={() => setNotice("")} /> : null}
      {combo ? <input type="hidden" name="id" value={combo.id} /> : null}
      <input type="hidden" name="parts" value={JSON.stringify(payload)} />
      <div>
        <h2 className="font-heading text-lg">{combo ? "Editar combo" : "Novo combo"}</h2>
        <p className="text-sm text-muted-foreground">Este cadastro só vale para combos. Um produto sozinho não pode ser salvo aqui.</p>
      </div>
      <div className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={combo ? `combo-name-${combo.id}` : "combo-name"}>Nome</Label>
          <Input id={combo ? `combo-name-${combo.id}` : "combo-name"} name="name" defaultValue={combo?.name ?? ""} placeholder="Lanche da tarde" />
        </div>
        <Combobox
          name="category"
          label="Categoria"
          placeholder="Escolha a categoria"
          value={category}
          onChange={setCategory}
          options={categories.map((item) => ({ value: item.slug, label: item.name }))}
        />
        <div className="space-y-1">
          <Label htmlFor={combo ? `combo-price-${combo.id}` : "combo-price"}>Valor de venda</Label>
          <Input
            id={combo ? `combo-price-${combo.id}` : "combo-price"}
            name="price"
            defaultValue={combo ? (combo.sale_price_cents / 100).toFixed(2).replace(".", ",") : ""}
            placeholder="8,00"
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Custo dos itens: {formatBRL(cost)}. O valor de venda é o preço do combo.</p>
      {simples.length < 2 ? (
        <p className="text-sm text-destructive">Cadastre pelo menos dois produtos simples antes de montar um combo.</p>
      ) : null}
      <div className="space-y-2">
        {parts.map((part) => {
          const options = simples.filter((item) => item.id === part.productId || !parts.some((row) => row.key !== part.key && row.productId === item.id));
          return (
            <div key={part.key} className="flex items-center gap-2">
              <Select
                value={part.productId}
                className="min-w-0 flex-1"
                onChange={(event) => setParts((current) => current.map((row) => (row.key === part.key ? { ...row, productId: event.target.value } : row)))}
              >
                <option value="">Escolha o produto</option>
                {options.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                min={1}
                className="w-24"
                aria-label="Quantidade"
                value={part.quantity}
                onChange={(event) => setParts((current) => current.map((row) => (row.key === part.key ? { ...row, quantity: event.target.value } : row)))}
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => setParts((current) => current.filter((row) => row.key !== part.key))}>
                Excluir
              </Button>
            </div>
          );
        })}
        <button
          type="button"
          className="text-sm font-medium text-primary disabled:text-muted-foreground"
          disabled={simples.length === 0 || simples.every((item) => parts.some((row) => row.productId === item.id))}
          onClick={() => setParts((current) => [...current, blankPart()])}
        >
          Incluir produto
        </button>
      </div>
      {combo ? (
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="active" defaultChecked={combo.active} className="size-4 shrink-0 accent-[var(--primary)]" />
          Combo disponível para venda
        </label>
      ) : null}
      {state?.error && !notice ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok && !combo ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
      <Button disabled={pending || simples.length < 2 || categories.length === 0}>
        {pending ? "Salvando…" : combo ? "Salvar combo" : "Cadastrar combo"}
      </Button>
    </form>
  );
}

function DeleteCombo({ id }: { id: string }) {
  const [state, action, pending] = useActionState(deleteProduct, null as ActionState);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? "Excluindo…" : "Excluir"}
      </Button>
      {state?.error ? <p className="mt-1 text-xs text-destructive">{state.error}</p> : null}
    </form>
  );
}

function Notice({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="alertdialog" className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-lg">
        <p className="font-heading text-xl">Confira o cadastro</p>
        <p className="mt-2 text-sm">{message}</p>
        <Button className="mt-4" type="button" onClick={onClose}>Entendi</Button>
      </div>
    </div>
  );
}

function blankPart(): Part {
  return { key: crypto.randomUUID(), productId: "", quantity: "1" };
}

function initialParts(combo?: Product): Part[] {
  const saved = combo?.components ?? [];
  if (saved.length === 0) return [{ key: "novo", productId: "", quantity: "1" }];
  return saved.map((part) => ({ key: part.product_id, productId: part.product_id, quantity: String(part.quantity) }));
}

function composition(combo: Product, products: Product[]) {
  const names = (combo.components ?? []).map((part) => {
    const item = products.find((row) => row.id === part.product_id);
    return `${part.quantity}× ${item?.name ?? "produto"}`;
  });
  return names.length ? names.join(" · ") : "Sem produtos na composição.";
}

function comboIssues(input: { name: string; category: string; price: string; parts: { product_id: string; quantity: number }[] }) {
  if (new Set(input.parts.map((part) => part.product_id)).size < 2) return comboOnly;
  if (input.name.trim().length < 2) return "Dê um nome ao combo.";
  if (!input.category) return "Escolha a categoria.";
  if (parseBRLToCents(input.price) == null) return "Informe o valor de venda. Use 3,50 por exemplo.";
  return "";
}
