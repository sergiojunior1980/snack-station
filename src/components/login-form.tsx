"use client";

import Link from "next/link";
import { useActionState, useState, useSyncExternalStore } from "react";
import { Eye, EyeOff } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { markSessionOpen } from "@/lib/browser-session";
import { login, type ActionState } from "@/server/actions";

const REMEMBER_USER_KEY = "snack-remember-user";
const REMEMBER_SHOP_KEY = "snack-remember-shop";

function subscribeRemembered(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function readRememberedUser() {
  return localStorage.getItem(REMEMBER_USER_KEY) ?? "";
}

function readRememberedShop() {
  return localStorage.getItem(REMEMBER_SHOP_KEY) ?? "";
}

export function LoginForm({ suspended = false, passwordReset = false }: { suspended?: boolean; passwordReset?: boolean }) {
  const [state, action, pending] = useActionState(login, null as ActionState);
  const saved = useSyncExternalStore(subscribeRemembered, readRememberedUser, () => "");
  const savedShop = useSyncExternalStore(subscribeRemembered, readRememberedShop, () => "");
  const [shop, setShop] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [remember, setRemember] = useState<boolean | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const shopValue = shop ?? savedShop;
  const usernameValue = username ?? saved;
  const rememberUser = remember ?? (saved.length > 0 || savedShop.length > 0);

  return (
    <AuthShell title="Entrar" description="Informe o código da loja, o usuário e a senha.">
      <form
        action={action}
        className="space-y-5 rounded-2xl border bg-card p-7 shadow-[0_8px_24px_rgba(58,36,22,0.05)]"
        onSubmit={() => {
          markSessionOpen();
          if (rememberUser) {
            const shopCode = shopValue.trim();
            const userName = usernameValue.trim();
            if (shopCode) localStorage.setItem(REMEMBER_SHOP_KEY, shopCode);
            else localStorage.removeItem(REMEMBER_SHOP_KEY);
            if (userName) localStorage.setItem(REMEMBER_USER_KEY, userName);
            else localStorage.removeItem(REMEMBER_USER_KEY);
          } else {
            localStorage.removeItem(REMEMBER_USER_KEY);
            localStorage.removeItem(REMEMBER_SHOP_KEY);
          }
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="shop">Loja</Label>
          <Input
            id="shop"
            name="shop"
            required
            placeholder="código da loja"
            autoComplete="organization"
            value={shopValue}
            onChange={(event) => setShop(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="username">Usuário</Label>
          <Input
            id="username"
            name="username"
            required
            placeholder="admin"
            autoComplete="username"
            value={usernameValue}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
        <label className="flex items-center text-sm">
          <input
            type="checkbox"
            checked={rememberUser}
            onChange={(event) => setRemember(event.target.checked)}
            className="mr-3 size-4 shrink-0 accent-primary"
          />
          Guardar loja e usuário neste aparelho
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              className="pr-10"
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground"
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        {suspended ? <p className="text-sm text-destructive">Esta loja está suspensa.</p> : null}
        {passwordReset ? <p className="text-sm text-emerald-700">Senha atualizada. Entre com a nova senha.</p> : null}
        {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        <Button className="w-full" size="lg" disabled={pending}>
          {pending ? "Entrando…" : "Entrar"}
        </Button>
        <p className="text-center text-sm">
          <Link href="/recuperar" className="text-muted-foreground underline-offset-4 hover:underline">
            Esqueci o usuário ou a senha
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
