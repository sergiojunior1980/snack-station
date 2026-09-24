"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { login, type ActionState } from "@/server/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null as ActionState);

  return (
    <AuthShell title="Entrar" description="Use o e-mail da equipe da Snack Station para lançar vendas e ver o estoque.">
      <form action={action} className="space-y-5 rounded-2xl border bg-card p-7 shadow-[0_8px_24px_rgba(58,36,22,0.05)]">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required placeholder="voce@escola.com" autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        <Button className="w-full" size="lg" disabled={pending}>
          {pending ? "Entrando…" : "Entrar"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Primeiro acesso?{" "}
          <Link href="/cadastro" className="font-medium text-primary hover:underline">
            Criar conta
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
