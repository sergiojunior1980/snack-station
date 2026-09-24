import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { AppShell } from "@/components/app-shell";
import { supabaseEnv } from "@/lib/supabase/env";
import { requireUser } from "@/server/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseEnv()) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Quase lá</p>
        <h1 className="font-heading mt-2 text-4xl">Conecte o Supabase</h1>
        <p className="mt-3 text-muted-foreground">
          Copie <code>.env.example</code> para <code>.env.local</code>, cole a URL e a chave anon do projeto, rode o SQL em{" "}
          <code>supabase/migrations/001_init.sql</code> e reinicie o servidor.
        </p>
      </div>
    );
  }

  const { user, name, role } = await requireUser();
  if (!user) redirect("/login");
  return <AppShell userName={name} role={role}>{children}</AppShell>;
}
