"use client";

import { useActionState, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { deleteCategory, saveCategory, setCategoryActive, type ActionState } from "@/server/actions";
import type { Category } from "@/server/queries";

export function CategoryManager({ categories }: { categories: Category[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const editingCategory = categories.find((category) => category.id === editing) ?? null;
  const removingCategory = categories.find((category) => category.id === removing) ?? null;

  return (
    <div className="space-y-4">
      <CategoryForm />
      {categories.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Nenhuma categoria cadastrada.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <article key={category.id} className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-medium">{category.name}</h2>
                <div className="flex shrink-0 gap-1">
                  <Button type="button" variant="outline" size="sm" className="size-8 px-0" aria-label={`Alterar ${category.name}`} onClick={() => setEditing(category.id)}>
                    <Pencil />
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="size-8 px-0 text-destructive" aria-label={`Excluir ${category.name}`} onClick={() => setRemoving(category.id)}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <ActiveToggle category={category} />
            </article>
          ))}
        </div>
      )}
      {editingCategory ? <EditCategoryDialog category={editingCategory} onClose={() => setEditing(null)} /> : null}
      {removingCategory ? <DeleteCategoryDialog category={removingCategory} onClose={() => setRemoving(null)} /> : null}
    </div>
  );
}

function CategoryForm() {
  const [state, action, pending] = useActionState(saveCategory, null as ActionState);
  const [name, setName] = useState("");
  const [seen, setSeen] = useState(state);
  if (state?.ok && state !== seen) {
    setSeen(state);
    setName("");
  }

  return (
    <form action={action} className="space-y-3 rounded-2xl border bg-card p-4">
      <div>
        <h2 className="font-heading text-xl">Nova categoria</h2>
        <p className="text-sm text-muted-foreground">Ela nasce ativa e aparece como filtro na venda.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-category">Nome</Label>
        <Input id="new-category" name="name" value={name} onChange={(event) => setName(event.target.value)} required />
      </div>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
      <Button disabled={pending}>{pending ? "Salvando…" : "Criar"}</Button>
    </form>
  );
}

function ActiveToggle({ category }: { category: Category }) {
  const [state, action, pending] = useActionState(setCategoryActive, null as ActionState);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={category.id} />
      <input type="hidden" name="active" value={category.active ? "false" : "true"} />
      <label className="flex items-center text-sm">
        <input
          type="checkbox"
          checked={category.active}
          disabled={pending}
          onChange={(event) => {
            const hidden = event.currentTarget.form?.elements.namedItem("active");
            if (hidden instanceof HTMLInputElement) hidden.value = event.currentTarget.checked ? "true" : "false";
            event.currentTarget.form?.requestSubmit();
          }}
          className="mr-2 size-4 shrink-0 accent-primary"
        />
        {category.active ? "Ativa" : "Inativa"}
      </label>
      {state?.error ? <p className="mt-1 text-xs text-destructive">{state.error}</p> : null}
    </form>
  );
}

function EditCategoryDialog({ category, onClose }: { category: Category; onClose: () => void }) {
  const [state, action, pending] = useActionState(saveCategory, null as ActionState);
  const [name, setName] = useState(category.name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form action={action} className="w-full max-w-md space-y-3 rounded-2xl bg-card p-5 shadow-lg">
        <input type="hidden" name="id" value={category.id} />
        <p className="font-heading text-xl">Alterar categoria</p>
        <div className="space-y-1.5">
          <Label htmlFor={`editar-${category.id}`}>Nome</Label>
          <Input id={`editar-${category.id}`} name="name" value={name} onChange={(event) => setName(event.target.value)} required />
        </div>
        {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
          <Button type="button" variant="outline" onClick={onClose}>Voltar</Button>
        </div>
      </form>
    </div>
  );
}

function DeleteCategoryDialog({ category, onClose }: { category: Category; onClose: () => void }) {
  const [state, action, pending] = useActionState(deleteCategory, null as ActionState);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form action={action} className="w-full max-w-md space-y-3 rounded-2xl bg-card p-5 shadow-lg">
        <input type="hidden" name="id" value={category.id} />
        <p className="font-heading text-xl">Excluir {category.name}?</p>
        <p className="text-sm text-muted-foreground">Se algum produto usa esta categoria, a exclusão é recusada.</p>
        {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="destructive" disabled={pending || Boolean(state?.ok)}>{pending ? "Excluindo…" : "Excluir"}</Button>
          <Button type="button" variant="outline" onClick={onClose}>Voltar</Button>
        </div>
      </form>
    </div>
  );
}
