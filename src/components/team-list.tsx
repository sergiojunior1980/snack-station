"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { roleLabel, type Role } from "@/lib/roles";
import { createTeamMember, setUserRole, type ActionState } from "@/server/actions";

export function TeamList({
  members,
  currentUserId,
}: {
  members: { id: string; full_name: string; username: string | null; role: Role }[];
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
        <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="font-medium">{member.full_name}</p>
            <p className="text-xs text-muted-foreground">
              {member.username ? `@${member.username} · ` : ""}
              {roleLabel(member.role)}
            </p>
          </div>
          <RoleSwitch member={member} disabled={member.id === currentUserId && member.role === "admin"} />
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
        <p className="text-sm text-muted-foreground">O vendedor entra com o usuário e a senha que você definir aqui.</p>
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
      <div className="flex items-end sm:col-span-2 lg:col-span-1">
        <Button className="w-full" disabled={pending}>
          {pending ? "Criando…" : "Criar vendedor"}
        </Button>
      </div>
      {state?.error ? <p className="text-sm text-destructive sm:col-span-2 lg:col-span-5">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700 sm:col-span-2 lg:col-span-5">{state.ok}</p> : null}
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
