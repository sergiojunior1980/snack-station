"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { createShop, setShopStatus, type ActionState } from "@/server/actions";

export type ShopRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

export function ShopDesk({ shops }: { shops: ShopRow[] }) {
  const [state, action, pending] = useActionState(createShop, null as ActionState);

  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="font-heading text-xl">Abrir loja</h2>
          <p className="text-sm text-muted-foreground">A loja nasce vazia, com o caixa fechado. Você entrega o código, o usuário e a senha temporária.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Nome da loja</Label>
          <Input id="name" name="name" required placeholder="Cantina São José" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug">Código</Label>
          <Input id="slug" name="slug" required placeholder="sao-jose" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="adminName">Nome do administrador</Label>
          <Input id="adminName" name="adminName" required placeholder="Maria Souza" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="adminUsername">Usuário</Label>
          <Input id="adminUsername" name="adminUsername" required placeholder="maria" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="adminPassword">Senha temporária</Label>
          <Input id="adminPassword" name="adminPassword" type="text" required minLength={6} placeholder="Mínimo 6 caracteres" />
        </div>
        {state?.error ? <p className="text-sm text-destructive sm:col-span-2">{state.error}</p> : null}
        {state?.ok ? <p className="text-sm text-emerald-700 sm:col-span-2">{state.ok}</p> : null}
        <Button disabled={pending}>{pending ? "Abrindo…" : "Abrir loja"}</Button>
      </form>

      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {shops.map((shop) => (
          <li key={shop.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-medium">{shop.name}</p>
              <p className="text-xs text-muted-foreground">
                Código {shop.slug} · {shop.status === "suspended" ? "Suspensa" : "Ativa"}
              </p>
            </div>
            <ShopStatus shop={shop} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ShopStatus({ shop }: { shop: ShopRow }) {
  const [state, action, pending] = useActionState(setShopStatus, null as ActionState);
  const next = shop.status === "suspended" ? "active" : "suspended";
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="shopId" value={shop.id} />
      <input type="hidden" name="status" value={next} />
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {next === "suspended" ? "Suspender" : "Reativar"}
      </Button>
    </form>
  );
}
