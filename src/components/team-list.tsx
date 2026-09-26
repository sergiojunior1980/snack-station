"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { defaultSellerMenus, roleLabel, sellerMenus, type MenuId, type Role } from "@/lib/roles";
import { createTeamMember, deleteTeamMember, resetSellerPassword, setSellerMenus, setUserRole, type ActionState } from "@/server/actions";

export function TeamList({
  members,
  currentUserId,
}: {
  members: { id: string; full_name: string; username: string | null; role: Role; menus: MenuId[]; password: string | null }[];
  currentUserId: string;
}) {
  return (
    <div className="space-y-6">
      <CreateMember />
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {members.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</li>
        ) : (
          members.map((member) => (
        <li key={member.id} className="space-y-3 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{member.full_name}</p>
              <p className="text-xs text-muted-foreground">{roleLabel(member.role)}</p>
              {member.role === "vendedor" ? (
                <div className="mt-2 space-y-1 text-sm">
                  <p>Usuário: {member.username ?? "não definido"}</p>
                  <p>Senha: {member.password ?? "ainda não registrada"}</p>
                </div>
              ) : member.username ? (
                <p className="text-xs text-muted-foreground">@{member.username}</p>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-2">
              <RoleSwitch member={member} disabled={member.id === currentUserId && member.role === "admin"} />
              {member.id === currentUserId ? null : <DeleteMember member={member} />}
            </div>
          </div>
          {member.role === "vendedor" ? <PasswordReset member={member} /> : null}
          {member.role === "vendedor" ? <MenuAccess member={member} /> : null}
        </li>
          ))
        )}
      </ul>
    </div>
  );
}

function CreateMember() {
  const [state, action, pending] = useActionState(createTeamMember, null as ActionState);

  return (
    <form action={action} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
      <div className="space-y-1.5 sm:col-span-2 lg:col-span-5">
        <h2 className="font-heading text-xl">Novo usuário</h2>
        <p className="text-sm text-muted-foreground">O vendedor entra com o usuário e a senha que você definir aqui. Escolha os menus que ele poderá ver.</p>
      </div>
      <div className="space-y-2 sm:col-span-2 lg:col-span-5">
        <p className="text-sm font-medium">Menus</p>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          {sellerMenus.map((menu) => (
            <label key={menu.id} className="flex items-center text-sm">
              <input
                type="checkbox"
                name="menus"
                value={menu.id}
                defaultChecked={defaultSellerMenus.includes(menu.id)}
                className="mr-3 size-4 shrink-0 accent-primary"
              />
              {menu.label}
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" name="name" required placeholder="Nome" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="username">Usuário</Label>
        <Input id="username" name="username" required placeholder="maria" autoComplete="off" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Senha</Label>
        <Input id="password" name="password" type="password" required minLength={6} placeholder="Mínimo 6" />
      </div>
      {state?.error ? <p className="text-sm text-destructive sm:col-span-2 lg:col-span-5">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700 sm:col-span-2 lg:col-span-5">{state.ok}</p> : null}
      <div className="sm:col-span-2 lg:col-span-5">
        <Button disabled={pending}>
          {pending ? "Criando…" : "Criar vendedor"}
        </Button>
      </div>
    </form>
  );
}

function DeleteMember({ member }: { member: { id: string; full_name: string } }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteTeamMember, null as ActionState);

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Excluir
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form action={action} className="w-full max-w-md space-y-3 rounded-2xl bg-card p-5 shadow-lg">
            <input type="hidden" name="userId" value={member.id} />
            <p className="font-heading text-xl">Excluir {member.full_name}?</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Essa pessoa deixa de entrar no sistema.</li>
              <li>O usuário, a senha e os menus são apagados.</li>
              <li>Vendas, compras e a fita que ela registrou continuam no histórico.</li>
            </ul>
            {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
            {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>{pending ? "Excluindo…" : "Excluir usuário"}</Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

function PasswordReset({ member }: { member: { id: string } }) {
  const [state, action, pending] = useActionState(resetSellerPassword, null as ActionState);

  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <input type="hidden" name="userId" value={member.id} />
      <div className="space-y-1.5">
        <Label htmlFor={`new-password-${member.id}`}>Nova senha</Label>
        <Input id={`new-password-${member.id}`} name="password" required minLength={6} autoComplete="off" placeholder="Mínimo 6" />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Redefinindo…" : "Redefinir senha"}
      </Button>
      {state?.error ? <p className="w-full text-xs text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="w-full text-xs text-emerald-700">{state.ok}</p> : null}
    </form>
  );
}

function MenuAccess({ member }: { member: { id: string; menus: MenuId[] } }) {
  const [state, action, pending] = useActionState(setSellerMenus, null as ActionState);

  return (
    <form action={action} className="space-y-3 rounded-xl bg-muted px-3 py-3">
      <input type="hidden" name="userId" value={member.id} />
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        {sellerMenus.map((menu) => (
          <label key={menu.id} className="flex items-center text-sm">
            <input
              type="checkbox"
              name="menus"
              value={menu.id}
              defaultChecked={member.menus.includes(menu.id)}
              className="mr-3 size-4 shrink-0 accent-primary"
            />
            {menu.label}
          </label>
        ))}
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Salvando…" : "Salvar acessos"}
      </Button>
      {state?.error ? <p className="w-full text-xs text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="w-full text-xs text-emerald-700">{state.ok}</p> : null}
    </form>
  );
}

function RoleSwitch({
  member,
  disabled,
}: {
  member: { id: string; role: Role };
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(setUserRole, null as ActionState);
  const next = member.role === "admin" ? "vendedor" : "admin";

  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="userId" value={member.id} />
      <input type="hidden" name="role" value={next} />
      {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
      <Button type="submit" size="sm" variant="outline" disabled={disabled || pending}>
        {pending ? "Salvando…" : next === "admin" ? "Tornar administrador" : "Tornar vendedor"}
      </Button>
    </form>
  );
}
