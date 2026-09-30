"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { setRecoveredPassword, type ActionState } from "@/server/actions";

function NewPasswordForm() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState(setRecoveredPassword, null as ActionState);
  const tokenHash = params.get("token_hash") ?? "";
  const code = params.get("code") ?? "";

  return (
    <AuthShell title="Nova senha" description="Crie a senha que vai usar da próxima vez que entrar.">
      <form action={action} className="space-y-5 rounded-2xl border bg-card p-7 shadow-[0_8px_24px_rgba(58,36,22,0.05)]">
        <input type="hidden" name="tokenHash" value={tokenHash} />
        <input type="hidden" name="code" value={code} />
        <div className="space-y-1.5">
          <Label htmlFor="password">Nova senha</Label>
          <Input id="password" name="password" type="password" required minLength={6} autoComplete="new-password" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirmar senha</Label>
          <Input id="confirm" name="confirm" type="password" required minLength={6} autoComplete="new-password" />
        </div>
        {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        <Button className="w-full" size="lg" disabled={pending}>{pending ? "Salvando…" : "Salvar senha"}</Button>
        <p className="text-center text-sm">
          <Link href="/recuperar" className="text-muted-foreground underline-offset-4 hover:underline">Pedir outro link</Link>
        </p>
      </form>
    </AuthShell>
  );
}

export default function NewPasswordPage() {
  return (
    <Suspense>
      <NewPasswordForm />
    </Suspense>
  );
}
