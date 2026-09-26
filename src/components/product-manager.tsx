"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label, Select } from "@/components/ui/input";
import { categoryLabel } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { formatBRL, parseBRLToCents } from "@/lib/money";
import { createProduct, deleteProduct, saveCostMode, updateProduct, type ActionState } from "@/server/actions";
import type { Category, CostMode, Product } from "@/server/queries";

export function ProductManager({
  products,
  categories,
  costMode,
  admin,
}: {
  products: Product[];
  categories: Category[];
  costMode: CostMode;
  admin: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("nome");
  const [category, setCategory] = useState("todas");
  const [brand, setBrand] = useState("todos");
  const [costOp, setCostOp] = useState("");
  const [costA, setCostA] = useState("");
  const [costB, setCostB] = useState("");
  const [saleOp, setSaleOp] = useState("");
  const [saleA, setSaleA] = useState("");
  const [saleB, setSaleB] = useState("");
  const brands = useMemo(
    () => [...new Set(products.map((product) => product.attributes?.marca).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt")),
    [products],
  );
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    const rows = products.filter((product) => {
      const matchesText = !text || product.name.toLowerCase().includes(text) || (product.attributes?.marca ?? "").toLowerCase().includes(text);
      const matchesCategory = category === "todas" || product.category === category;
      const matchesBrand = brand === "todos" || product.attributes?.marca === brand;
      return matchesText && matchesCategory && matchesBrand && matchPrice(product.display_cost_cents ?? 0, costOp, costA, costB) && matchPrice(product.sale_price_cents, saleOp, saleA, saleB);
    });
    return rows.sort((a, b) => {
      if (sort === "venda") return a.sale_price_cents - b.sale_price_cents;
      if (sort === "custo") return (a.display_cost_cents ?? 0) - (b.display_cost_cents ?? 0);
      if (sort === "validade") return (a.nearest_expires_on ?? "9999-99-99").localeCompare(b.nearest_expires_on ?? "9999-99-99");
      return a.name.localeCompare(b.name, "pt");
    });
  }, [products, query, sort, category, brand, costOp, costA, costB, saleOp, saleA, saleB]);
  const filtered = Boolean(query.trim() || sort !== "nome" || category !== "todas" || brand !== "todos" || costOp || saleOp);

  function clearSearch() {
    setQuery("");
    setSort("nome");
    setCategory("todas");
    setBrand("todos");
    setCostOp("");
    setCostA("");
    setCostB("");
    setSaleOp("");
    setSaleA("");
    setSaleB("");
  }

  return (
    <div className="space-y-3">
      {admin ? <CostModeForm mode={costMode} /> : null}
      <ProductForm categories={categories} products={products} costMode={costMode} />
      <div className="space-y-2 rounded-xl border bg-card p-3">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto ou fabricante" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect label="Ordenar" value={sort} onChange={setSort}>
            <option value="nome">Nome</option>
            <option value="validade">Validade</option>
            <option value="venda">Valor de venda</option>
            <option value="custo">Valor de custo</option>
          </FilterSelect>
          <FilterSelect label="Categoria" value={category} onChange={setCategory}>
            <option value="todas">Todas</option>
            {categories.map((item) => (
              <option key={item.slug} value={item.slug}>{item.name}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="Fabricante" value={brand} onChange={setBrand}>
            <option value="todos">Todos</option>
            {brands.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </FilterSelect>
          <div className="flex items-end">
            <Button type="button" className="w-full" disabled={!filtered} onClick={clearSearch}>
              Limpar Pesquisa
            </Button>
          </div>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          <PriceFilter label="Preço de compra" op={costOp} setOp={setCostOp} a={costA} setA={setCostA} b={costB} setB={setCostB} />
          <PriceFilter label="Preço de venda" op={saleOp} setOp={setSaleOp} a={saleA} setA={setSaleA} b={saleB} setB={setSaleB} />
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {products.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground md:col-span-2">
            Cadastre o primeiro produto acima.
          </p>
        ) : visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground md:col-span-2">
            Nenhum produto com esse filtro.
          </p>
        ) : (
          visible.map((product) => (
            <article key={product.id} className={cn("rounded-xl border bg-card p-3", editing === product.id && "md:col-span-2")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">{product.name}</h2>
                    <Badge>{categoryName(categories, product.category)}</Badge>
                    {product.is_combo ? <Badge tone="watch">Combo</Badge> : null}
                    {!product.active ? <Badge tone="muted">Inativo</Badge> : null}
                    {product.stock_quantity <= product.min_stock ? <Badge tone="watch">Estoque baixo</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatBRL(product.sale_price_cents)} venda · {formatBRL(product.display_cost_cents ?? 0)} compra · {product.stock_quantity} em estoque
                  </p>
                  <AttributeLine attributes={product.attributes} />
                  {product.is_combo ? <ComboSummary product={product} products={products} /> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditing(editing === product.id ? null : product.id)}>
                    {editing === product.id ? "Fechar" : "Editar"}
                  </Button>
                  <DeleteProduct id={product.id} />
                </div>
              </div>
              {editing === product.id ? (
                <EditProduct product={product} categories={categories} products={products} onSaved={() => setEditing(null)} />
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}

type ProductLine = {
  key: string;
  name: string;
  brand: string;
  category: string;
  size: string;
  unit: "ml" | "g";
  price: string;
  minStock: string;
  combo: boolean;
  parts: { key: string; productId: string; quantity: string }[];
};

function blankProduct(key: string): ProductLine {
  return {
    key,
    name: "",
    brand: "",
    category: "",
    size: "",
    unit: "ml",
    price: "",
    minStock: "5",
    combo: false,
    parts: [
      { key: `${key}-a`, productId: "", quantity: "1" },
      { key: `${key}-b`, productId: "", quantity: "1" },
    ],
  };
}

function ProductForm({
  categories,
  products,
  costMode,
}: {
  categories: Category[];
  products: Product[];
  costMode: CostMode;
}) {
  const [state, action, pending] = useActionState(createProduct, null as ActionState);
  const [lines, setLines] = useState<ProductLine[]>([blankProduct("1")]);
  const [notice, setNotice] = useState("");
  const [seen, setSeen] = useState(state);
  const simples = products.filter((item) => !item.is_combo);
  const items = lines.map((line) => ({
    name: line.name,
    brand: line.brand,
    category: line.category,
    size: line.size,
    unit: line.unit,
    price: line.price,
    minStock: Number(line.minStock),
    combo: line.combo,
    parts: line.combo
      ? line.parts
          .map((part) => ({ product_id: part.productId, quantity: Number(part.quantity) }))
          .filter((part) => part.product_id && part.quantity > 0)
      : [],
  }));

  if (state && state !== seen) {
    setSeen(state);
    if (state.error) setNotice(state.error);
    if (state.ok) setLines([blankProduct("1")]);
  }

  function patch(key: string, next: Partial<ProductLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...next } : line)));
  }

  return (
    <form
      action={action}
      className="space-y-2 rounded-xl border bg-card p-3"
      onSubmit={(event) => {
        for (const line of lines) {
          const message = productIssues({
            name: line.name,
            brand: line.brand,
            category: line.category,
            price: line.price,
            minStock: line.minStock,
            size: line.size,
            unit: line.unit,
            combo: line.combo,
            parts: line.parts.map((part) => ({ product_id: part.productId, quantity: Number(part.quantity) })),
          });
          if (!message) continue;
          event.preventDefault();
          setNotice(`Item ${lines.indexOf(line) + 1}: ${message}`);
          return;
        }
      }}
    >
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      {notice ? <Notice message={notice} onClose={() => setNotice("")} /> : null}
      <div>
        <h2 className="font-heading text-lg">Novo produto</h2>
        <p className="text-sm text-muted-foreground">
          Adicione um ou mais itens e cadastre todos de uma vez. O custo {costMode === "maior" ? "usa o maior valor em estoque" : "entra pela média das compras"}.
        </p>
      </div>
      {lines.map((line, index) => {
        return (
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
            <div className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <Field label="Nome" name={`name-${line.key}`} placeholder="Coca-Cola" value={line.name} onChange={(event) => patch(line.key, { name: event.target.value })} />
              <Field label="Marca" name={`brand-${line.key}`} placeholder="Coca-Cola" value={line.brand} onChange={(event) => patch(line.key, { brand: event.target.value })} />
              <Combobox
                name={`category-${line.key}`}
                label="Categoria"
                placeholder="Escolha a categoria"
                value={line.category}
                onChange={(category) => patch(line.key, { category })}
                options={categories.map((item) => ({ value: item.slug, label: item.name }))}
              />
              <Field
                label="Tamanho"
                name={`size-${line.key}`}
                type="number"
                min={0.01}
                step="any"
                placeholder="350"
                value={line.size}
                onChange={(event) => patch(line.key, { size: event.target.value })}
              />
              <div className="space-y-1">
                <Label htmlFor={`unit-${line.key}`}>Unidade</Label>
                <Select id={`unit-${line.key}`} value={line.unit} onChange={(event) => patch(line.key, { unit: event.target.value === "g" ? "g" : "ml" })}>
                  <option value="ml">ml</option>
                  <option value="g">gramas</option>
                </Select>
              </div>
              <Field label="Valor de venda" name={`price-${line.key}`} placeholder="5,00" value={line.price} onChange={(event) => patch(line.key, { price: event.target.value })} />
              {line.combo ? null : (
                <Field
                  label="Avisar quando chegar a"
                  name={`min-${line.key}`}
                  placeholder="5"
                  type="number"
                  min={0}
                  value={line.minStock}
                  className="sm:col-span-2 xl:col-span-2"
                  onChange={(event) => patch(line.key, { minStock: event.target.value })}
                />
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={line.combo}
                onChange={(event) =>
                  patch(line.key, {
                    combo: event.target.checked,
                    parts: event.target.checked
                      ? [
                          { key: `${line.key}-a`, productId: simples[0]?.id ?? "", quantity: "1" },
                          { key: `${line.key}-b`, productId: simples[1]?.id ?? "", quantity: "1" },
                        ]
                      : line.parts,
                  })
                }
                className="size-4 shrink-0 accent-[var(--primary)]"
              />
              Este produto é um combo
            </label>
            {line.combo ? (
              <ComboParts
                products={simples}
                value={line.parts}
                onChange={(parts) => patch(line.key, { parts })}
              />
            ) : null}
          </div>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          setLines((current) => {
            const next = current.reduce((max, line) => Math.max(max, Number(line.key) || 0), 0) + 1;
            return [...current, blankProduct(String(next))];
          })
        }
      >
        Adicionar item
      </Button>
      {categories.length === 0 ? <p className="text-sm text-destructive">Rode o SQL de categorias no Supabase para liberar o cadastro.</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
      <Button disabled={pending || categories.length === 0}>
        {pending ? "Salvando…" : lines.length > 1 ? "Cadastrar produtos" : "Cadastrar produto"}
      </Button>
    </form>
  );
}

function EditProduct({
  product,
  categories,
  products,
  onSaved,
}: {
  product: Product;
  categories: Category[];
  products: Product[];
  onSaved: () => void;
}) {
  const [state, action, pending] = useActionState(updateProduct, null as ActionState);
  const [category, setCategory] = useState(product.category);
  const [combo, setCombo] = useState(Boolean(product.is_combo));
  const [clientNotice, setClientNotice] = useState("");
  const [dismissed, setDismissed] = useState<ActionState>(null);
  const saved = useRef<ActionState>(null);
  const notice = clientNotice || (state?.error && state !== dismissed ? state.error : "");
  const currentSize = productSize(product.attributes);

  useEffect(() => {
    if (!state?.ok || saved.current === state) return;
    saved.current = state;
    onSaved();
  }, [state, onSaved]);

  return (
    <form
      action={action}
      className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        const message = productIssues({
          name: String(data.get("name") ?? ""),
          brand: String(data.get("brand") ?? ""),
          category,
          price: String(data.get("price") ?? ""),
          minStock: String(data.get("minStock") ?? ""),
          size: String(data.get("size") ?? ""),
          unit: String(data.get("size_unit") ?? ""),
          combo,
          form: event.currentTarget,
        });
        if (!message) return;
        event.preventDefault();
        setClientNotice(message);
      }}
    >
      {notice ? (
        <Notice
          message={notice}
          onClose={() => {
            setClientNotice("");
            setDismissed(state);
          }}
        />
      ) : null}
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
      <Field label="Tamanho" name="size" type="number" min={0.01} step="any" required defaultValue={currentSize.size} />
      <div className="space-y-1">
        <Label htmlFor={`unit-${product.id}`}>Unidade</Label>
        <Select id={`unit-${product.id}`} name="size_unit" defaultValue={currentSize.unit}>
          <option value="ml">ml</option>
          <option value="g">gramas</option>
        </Select>
      </div>
      {combo ? null : <ReadOnlyCost cents={product.display_cost_cents ?? 0} />}
      <Field label="Valor de venda" name="price" defaultValue={(product.sale_price_cents / 100).toFixed(2).replace(".", ",")} />
      <Field label="Estoque mínimo" name="minStock" type="number" min={0} defaultValue={String(product.min_stock)} />
      <label className="flex items-center gap-3 text-sm sm:col-span-2 lg:col-span-4">
        <input type="checkbox" name="combo" checked={combo} onChange={(event) => setCombo(event.target.checked)} className="mr-3 size-4 shrink-0 accent-[var(--primary)]" />
        Este produto é um combo
      </label>
      {combo ? (
        <ComboParts
          products={products.filter((item) => !item.is_combo && item.id !== product.id)}
          initial={product.components}
        />
      ) : null}
      <label className="flex items-center gap-3 text-sm sm:col-span-2 lg:col-span-4">
        <input type="checkbox" name="active" defaultChecked={product.active} className="mr-3 size-4 shrink-0 accent-[var(--primary)]" />
        Produto disponível para venda
      </label>
      {state?.ok ? <p className="text-sm text-emerald-700 sm:col-span-2 lg:col-span-4">{state.ok}</p> : null}
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
        <Button size="sm" disabled={pending}>
          {pending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}

function ComboParts({
  products,
  initial,
  name = "parts",
  value,
  onChange,
}: {
  products: Product[];
  initial?: { product_id: string; quantity: number }[];
  name?: string;
  value?: { key: string; productId: string; quantity: string }[];
  onChange?: (parts: { key: string; productId: string; quantity: string }[]) => void;
}) {
  const [inner, setInner] = useState(
    initial && initial.length >= 2
      ? initial.map((part) => ({ key: part.product_id, productId: part.product_id, quantity: String(part.quantity) }))
      : [
          { key: "1", productId: products[0]?.id ?? "", quantity: "1" },
          { key: "2", productId: products[1]?.id ?? "", quantity: "1" },
        ],
  );
  const parts = value ?? inner;
  function setParts(
    next:
      | { key: string; productId: string; quantity: string }[]
      | ((current: { key: string; productId: string; quantity: string }[]) => { key: string; productId: string; quantity: string }[]),
  ) {
    const resolved = typeof next === "function" ? next(parts) : next;
    if (onChange) onChange(resolved);
    else setInner(resolved);
  }
  const payload = parts
    .map((part) => ({ product_id: part.productId, quantity: Number(part.quantity) }))
    .filter((part) => part.product_id && part.quantity > 0);
  const cost = payload.reduce((sum, part) => {
    const item = products.find((product) => product.id === part.product_id);
    return sum + (item?.display_cost_cents ?? 0) * part.quantity;
  }, 0);
  if (products.length < 2) {
    return <p className="text-sm text-destructive sm:col-span-2 lg:col-span-4">Cadastre pelo menos dois produtos simples antes do combo.</p>;
  }

  return (
    <div className="space-y-2 sm:col-span-2 lg:col-span-4">
      {onChange ? null : <input type="hidden" name={name} value={JSON.stringify(payload)} />}
      <ReadOnlyCost cents={cost} hint="Soma do custo dos produtos que formam o combo." />
      <p className="text-sm text-muted-foreground">Inclua dois ou mais produtos já cadastrados. Cada um precisa ser diferente.</p>
      {parts.map((part) => (
        <div key={part.key} className="flex items-center gap-2">
          <Select
            value={part.productId}
            className="min-w-0 flex-1"
            onChange={(event) => setParts((current) => current.map((row) => (row.key === part.key ? { ...row, productId: event.target.value } : row)))}
          >
            {products.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            min={1}
            className="w-24"
            value={part.quantity}
            onChange={(event) => setParts((current) => current.map((row) => (row.key === part.key ? { ...row, quantity: event.target.value } : row)))}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={parts.length <= 2}
            onClick={() => setParts((current) => (current.length <= 2 ? current : current.filter((row) => row.key !== part.key)))}
          >
            Excluir
          </Button>
        </div>
      ))}
      <button
        type="button"
        className="text-sm font-medium text-primary"
        onClick={() => setParts((current) => [...current, { key: crypto.randomUUID(), productId: products[0]?.id ?? "", quantity: "1" }])}
      >
        Incluir produto
      </button>
    </div>
  );
}

function ComboSummary({ product, products }: { product: Product; products: Product[] }) {
  const names = (product.components ?? []).map((part) => {
    const item = products.find((row) => row.id === part.product_id);
    return `${part.quantity}× ${item?.name ?? "produto"}`;
  });
  if (names.length === 0) return null;
  return <p className="mt-1 text-xs text-muted-foreground">{names.join(" · ")}</p>;
}

function DeleteProduct({ id }: { id: string }) {
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

function productSize(attributes: Record<string, string>) {
  if (attributes.size) return { size: attributes.size, unit: attributes.size_unit === "g" ? "g" as const : "ml" as const };
  if (attributes.volume_ml) return { size: attributes.volume_ml, unit: "ml" as const };
  return { size: "", unit: "ml" as const };
}

function formatProductSize(attributes: Record<string, string>) {
  const { size, unit } = productSize(attributes);
  if (!size) return null;
  return `${size.replace(".", ",")} ${unit === "g" ? "g" : "ml"}`;
}

function AttributeLine({ attributes }: { category?: Category; attributes: Record<string, string> }) {
  if (!attributes) return null;
  const parts = [attributes.marca, formatProductSize(attributes)].filter(Boolean);
  if (parts.length === 0) return null;
  return <p className="mt-1 text-xs text-muted-foreground">{parts.join(" · ")}</p>;
}

function categoryName(categories: Category[], slug: string) {
  return categories.find((item) => item.slug === slug)?.name ?? categoryLabel(slug);
}

function ReadOnlyCost({ cents, hint }: { cents: number; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label>Valor médio de compra</Label>
      <p className="flex h-9 items-center rounded-lg border bg-muted/40 px-2.5 text-sm">{formatBRL(cents)}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function CostModeForm({ mode }: { mode: CostMode }) {
  const [state, action, pending] = useActionState(saveCostMode, null as ActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
      <div className="space-y-1">
        <Label htmlFor="mode">Cálculo do custo de compra</Label>
        <Select id="mode" name="mode" defaultValue={mode}>
          <option value="media">Média dos itens comprados em estoque</option>
          <option value="maior">Maior custo por item em estoque</option>
        </Select>
      </div>
      <Button size="sm" disabled={pending}>{pending ? "Salvando…" : "Salvar parâmetro"}</Button>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
    </form>
  );
}

function productIssues(input: {
  name: string;
  brand: string;
  category: string;
  price: string;
  minStock: string;
  size: string;
  unit: string;
  combo: boolean;
  form?: HTMLFormElement;
  parts?: { product_id: string; quantity: number }[];
}) {
  if (input.name.trim().length < 2) return "Dê um nome ao produto.";
  if (input.brand.trim().length < 2) return "Informe a marca.";
  if (!input.category) return "Escolha a categoria.";
  if (parseBRLToCents(input.price) == null) return "Informe o valor de venda. Use 3,50 por exemplo.";
  if (!input.combo) {
    const min = Number(input.minStock);
    if (!Number.isInteger(min) || min < 0) return "O estoque mínimo precisa ser um número inteiro a partir de zero.";
  }
  const amount = Number(input.size.replace(",", "."));
  if (!input.size.trim() || !Number.isFinite(amount) || amount <= 0) return "Informe o tamanho.";
  if (input.unit !== "ml" && input.unit !== "g") return "Escolha ml ou gramas.";
  if (input.combo) {
    let parts = input.parts ?? [];
    if (!input.parts) {
      if (!input.form) return "Monte o combo com produtos já cadastrados.";
      try {
        parts = JSON.parse(String(new FormData(input.form).get("parts") ?? "[]"));
      } catch {
        return "Monte o combo com produtos já cadastrados.";
      }
    }
    const lines = parts.filter((part) => part.product_id && part.quantity > 0);
    if (new Set(lines.map((part) => part.product_id)).size < 2) return "O combo precisa de dois ou mais produtos diferentes, mesmo sem estoque.";
  }
  return "";
}

function matchPrice(cents: number, op: string, a: string, b: string) {
  if (!op) return true;
  const left = parseBRLToCents(a);
  if (left == null) return true;
  if (op === "eq") return cents === left;
  if (op === "gt") return cents > left;
  if (op === "lt") return cents < left;
  const right = parseBRLToCents(b);
  if (right == null) return true;
  return cents >= Math.min(left, right) && cents <= Math.max(left, right);
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

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>{children}</Select>
    </div>
  );
}

function PriceFilter({
  label,
  op,
  setOp,
  a,
  setA,
  b,
  setB,
}: {
  label: string;
  op: string;
  setOp: (value: string) => void;
  a: string;
  setA: (value: string) => void;
  b: string;
  setB: (value: string) => void;
}) {
  return (
    <div className={op === "between" ? "grid gap-2 sm:grid-cols-3" : "grid gap-2 sm:grid-cols-2"}>
      <FilterSelect label={label} value={op} onChange={setOp}>
        <option value="">Qualquer</option>
        <option value="eq">Igual a</option>
        <option value="gt">Maior que</option>
        <option value="lt">Menor que</option>
        <option value="between">Maior e menor que</option>
      </FilterSelect>
      <div className="space-y-1">
        <Label>{op === "between" ? "De" : "Valor"}</Label>
        <Input value={a} onChange={(event) => setA(event.target.value)} placeholder="0,00" disabled={!op} />
      </div>
      {op === "between" ? (
        <div className="space-y-1">
          <Label>Até</Label>
          <Input value={b} onChange={(event) => setB(event.target.value)} placeholder="0,00" />
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, className, ...props }: React.ComponentProps<"input"> & { label: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="whitespace-nowrap" htmlFor={props.name}>{label}</Label>
      <Input id={props.name} {...props} />
    </div>
  );
}
