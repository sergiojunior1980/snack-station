"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { requestPasswordReset, type ActionState } from "@/server/actions";

export default function RecoverPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, null as ActionState);

  return (
    <AuthShell title="Recuperar acesso" description="Informe o e-mail cadastrado na equipe. Chega uma mensagem com o usuário e um link para criar uma nova senha.">
      <form action={action} className="space-y-5 rounded-2xl border bg-card p-7 shadow-[0_8px_24px_rgba(58,36,22,0.05)]">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" placeholder="maria@email.com" />
        </div>
        {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
        <Button className="w-full" size="lg" disabled={pending}>{pending ? "Enviando…" : "Enviar link"}</Button>
        <p className="text-center text-sm">
          <Link href="/login" className="text-muted-foreground underline-offset-4 hover:underline">Voltar para entrar</Link>
        </p>
      </form>
    </AuthShell>
  );
}
