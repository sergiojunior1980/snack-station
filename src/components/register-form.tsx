"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { register, type ActionState } from "@/server/actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState(register, null as ActionState);

  return (
    <AuthShell title="Criar conta" description="Quem trabalha na estação entra com o próprio e-mail. O estoque é o mesmo para toda a equipe.">
      <form action={action} className="space-y-5 rounded-2xl border bg-card p-7 shadow-[0_8px_24px_rgba(58,36,22,0.05)]">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" name="name" required placeholder="Seu nome" autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required placeholder="voce@escola.com" autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" name="password" type="password" required minLength={6} autoComplete="new-password" />
        </div>
        {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
        <Button className="w-full" size="lg" disabled={pending}>
          {pending ? "Criando…" : "Criar conta"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
