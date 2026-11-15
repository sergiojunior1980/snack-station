"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { createShop, setShopStatus, updateShop, type ActionState } from "@/server/actions";

export type ShopRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  admin_id: string | null;
  admin_name: string | null;
  admin_username: string | null;
  admin_password: string | null;
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
          <ShopCard key={shop.id} shop={shop} />
        ))}
      </ul>
    </div>
  );
}

function ShopCard({ shop }: { shop: ShopRow }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{shop.name}</p>
          <p className="text-xs text-muted-foreground">
            Código {shop.slug}
            {shop.admin_username ? ` · usuário ${shop.admin_username}` : " · sem administrador"}
            {" · "}
            {shop.status === "suspended" ? "Suspensa" : "Ativa"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ShopStatus shop={shop} />
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen((current) => !current)}>
            {open ? "Fechar" : "Alterar"}
          </Button>
        </div>
      </div>
      {open ? <ShopEdit shop={shop} onClose={() => setOpen(false)} /> : null}
    </li>
  );
}

function ShopEdit({ shop, onClose }: { shop: ShopRow; onClose: () => void }) {
  const [changePassword, setChangePassword] = useState(false);
  const [state, action, pending] = useActionState(updateShop, null as ActionState);
  return (
    <form action={action} className="grid basis-full gap-3 rounded-xl bg-secondary/40 p-3 sm:grid-cols-2">
      <input type="hidden" name="shopId" value={shop.id} />
      <div className="space-y-1.5">
        <Label htmlFor={`name-${shop.id}`}>Nome da loja</Label>
        <Input id={`name-${shop.id}`} name="name" required defaultValue={shop.name} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`slug-${shop.id}`}>Código</Label>
        <Input id={`slug-${shop.id}`} name="slug" required defaultValue={shop.slug} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`admin-name-${shop.id}`}>Nome do administrador</Label>
        <Input id={`admin-name-${shop.id}`} name="adminName" required defaultValue={shop.admin_name ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`admin-user-${shop.id}`}>Usuário</Label>
        <Input id={`admin-user-${shop.id}`} name="adminUsername" required defaultValue={shop.admin_username ?? ""} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`current-password-${shop.id}`}>Senha atual</Label>
        <Input id={`current-password-${shop.id}`} readOnly value={shop.admin_password ?? "Não registrada"} />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={changePassword} onChange={(event) => setChangePassword(event.target.checked)} />
        Trocar a senha
      </label>
      {changePassword ? (
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`admin-password-${shop.id}`}>Nova senha</Label>
          <Input id={`admin-password-${shop.id}`} name="adminPassword" type="text" required minLength={6} placeholder="Mínimo 6 caracteres" />
        </div>
      ) : (
        <input type="hidden" name="adminPassword" value="" />
      )}
      {state?.error ? <p className="text-sm text-destructive sm:col-span-2">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700 sm:col-span-2">{state.ok}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending || !shop.admin_id}>{pending ? "Salvando…" : "Salvar"}</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => { setChangePassword(false); onClose(); }}>Fechar</Button>
      </div>
    </form>
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
