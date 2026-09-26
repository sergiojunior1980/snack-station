"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { deleteCategory, saveCategory, type ActionState } from "@/server/actions";

export function CategoryManager({
  categories,
}: {
  categories: { id: string; name: string; slug: string; fields: { key: string }[] }[];
}) {
  return (
    <div className="space-y-6">
      <CategoryForm />
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {categories.map((category) => (
          <li key={category.id}>
            <CategoryForm category={category} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoryForm({ category }: { category?: { id: string; name: string } }) {
  const [state, action, pending] = useActionState(saveCategory, null as ActionState);
  const [removed, removeAction, removing] = useActionState(deleteCategory, null as ActionState);
  const [name, setName] = useState(category?.name ?? "");
  const notice = state ?? removed;

  return (
    <div className="grid gap-3 p-4">
      <form action={action} className="grid gap-3">
        {category ? <input type="hidden" name="id" value={category.id} /> : null}
        <div className="space-y-1.5">
          <Label htmlFor={category?.id ?? "new-category"}>{category ? "Nome" : "Nova categoria"}</Label>
          <Input id={category?.id ?? "new-category"} name="name" value={name} onChange={(event) => setName(event.target.value)} required />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={pending}>{pending ? "Salvando…" : category ? "Salvar" : "Criar"}</Button>
          {category ? (
            <Button type="submit" form={`excluir-categoria-${category.id}`} variant="ghost" disabled={removing}>
              {removing ? "Excluindo…" : "Excluir"}
            </Button>
          ) : null}
        </div>
        {notice?.error ? <p className="text-sm text-destructive">{notice.error}</p> : null}
        {notice?.ok ? <p className="text-sm text-emerald-700">{notice.ok}</p> : null}
      </form>
      {category ? (
        <form id={`excluir-categoria-${category.id}`} action={removeAction} className="hidden">
          <input type="hidden" name="id" value={category.id} />
        </form>
      ) : null}
    </div>
  );
}
