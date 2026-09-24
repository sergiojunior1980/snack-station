"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { categoryLabel } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/money";
import { createProduct, updateProduct, type ActionState } from "@/server/actions";
import type { Category, Product } from "@/server/queries";

export function ProductManager({ products, categories }: { products: Product[]; categories: Category[] }) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <ProductForm categories={categories} />
      <div className="grid gap-3 md:grid-cols-2">
        {products.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground md:col-span-2">
            Cadastre o primeiro produto acima.
          </p>
        ) : (
          products.map((product) => (
            <article key={product.id} className={cn("rounded-2xl border bg-card p-4", editing === product.id && "md:col-span-2")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">{product.name}</h2>
                    <Badge>{categoryName(categories, product.category)}</Badge>
                    {!product.active ? <Badge tone="muted">Inativo</Badge> : null}
                    {product.stock_quantity <= product.min_stock ? <Badge tone="watch">Estoque baixo</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatBRL(product.sale_price_cents)} · {product.stock_quantity} em estoque · mínimo {product.min_stock}
                  </p>
                  <AttributeLine attributes={product.attributes} />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(editing === product.id ? null : product.id)}>
                  {editing === product.id ? "Fechar" : "Editar"}
                </Button>
              </div>
              {editing === product.id ? <EditProduct product={product} categories={categories} /> : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function ProductForm({ categories }: { categories: Category[] }) {
  const [state, action, pending] = useActionState(createProduct, null as ActionState);
  const [category, setCategory] = useState("");
  const liquid = category === "refrigerante" || category === "agua";

  return (
    <form action={action} className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl">Novo produto</h2>
          <p className="text-sm text-muted-foreground">Marca vale para todos. O tamanho em ml só aparece em líquido.</p>
        </div>
        <Button disabled={pending || categories.length === 0}>
          {pending ? "Salvando…" : "Cadastrar produto"}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Nome" name="name" placeholder="Coca-Cola" />
        <Field label="Marca" name="brand" placeholder="Coca-Cola" required />
        <Combobox
          name="category"
          label="Categoria"
          placeholder="Escolha a categoria"
          value={category}
          onChange={setCategory}
          options={categories.map((item) => ({ value: item.slug, label: item.name }))}
        />
        {liquid ? <Field label="Tamanho (ml)" name="attr_volume_ml" type="number" min={1} step="1" required placeholder="350" /> : null}
        <Field label="Preço de venda" name="price" placeholder="5,00" />
        <Field label="Estoque inicial" name="stock" placeholder="24" type="number" min={0} />
        <Field label="Avisar quando chegar a" name="minStock" placeholder="5" type="number" min={0} defaultValue="5" />
      </div>
      {categories.length === 0 ? (
        <p className="mt-3 text-sm text-destructive">Rode o SQL de categorias no Supabase para liberar o cadastro.</p>
      ) : null}
      {state?.error ? <p className="mt-3 text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="mt-3 text-sm text-emerald-700">{state.ok}</p> : null}
    </form>
  );
}

function EditProduct({ product, categories }: { product: Product; categories: Category[] }) {
  const [state, action, pending] = useActionState(updateProduct, null as ActionState);
  const [category, setCategory] = useState(product.category);
  const liquid = category === "refrigerante" || category === "agua";

  return (
    <form action={action} className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="id" value={product.id} />
      <Field label="Nome" name="name" defaultValue={product.name} />
      <Field label="Marca" name="brand" required defaultValue={product.attributes?.marca ?? ""} />
      <Combobox
        name="category"
        label="Categoria"
        value={category}
        onChange={setCategory}
        options={categories.map((item) => ({ value: item.slug, label: item.name }))}
      />
      {liquid ? (
        <Field label="Tamanho (ml)" name="attr_volume_ml" type="number" min={1} step="1" required defaultValue={product.attributes?.volume_ml ?? ""} />
      ) : null}
      <Field label="Preço de venda" name="price" defaultValue={(product.sale_price_cents / 100).toFixed(2).replace(".", ",")} />
      <Field label="Estoque mínimo" name="minStock" type="number" min={0} defaultValue={String(product.min_stock)} />
      <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
        <input type="checkbox" name="active" defaultChecked={product.active} className="size-4 accent-[var(--primary)]" />
        Produto disponível para venda
      </label>
      {state?.error ? <p className="text-sm text-destructive sm:col-span-2 lg:col-span-4">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700 sm:col-span-2 lg:col-span-4">{state.ok}</p> : null}
      <Button size="sm" disabled={pending} className="sm:col-span-2 lg:col-span-4 sm:w-fit">
        {pending ? "Salvando…" : "Salvar alterações"}
      </Button>
    </form>
  );
}

function AttributeLine({ attributes }: { category?: Category; attributes: Record<string, string> }) {
  if (!attributes) return null;
  const parts = [attributes.marca, attributes.volume_ml ? `${attributes.volume_ml} ml` : null].filter(Boolean);
  if (parts.length === 0) return null;
  return <p className="mt-1 text-xs text-muted-foreground">{parts.join(" · ")}</p>;
}

function categoryName(categories: Category[], slug: string) {
  return categories.find((item) => item.slug === slug)?.name ?? categoryLabel(slug);
}

function Field({ label, ...props }: React.ComponentProps<"input"> & { label: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.name}>{label}</Label>
      <Input id={props.name} {...props} />
    </div>
  );
}
