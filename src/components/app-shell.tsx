"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutDashboard, LogOut, Package, ShoppingBag, Truck, Users, Wallet } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { roleLabel } from "@/lib/roles";
import type { Role } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { logout } from "@/server/actions";

const nav = [
  { href: "/", label: "Início", icon: LayoutDashboard, admin: true },
  { href: "/vendas", label: "Vender", icon: ShoppingBag, admin: false },
  { href: "/produtos", label: "Produtos", icon: Package, admin: false },
  { href: "/compras", label: "Compras", icon: Truck, admin: true },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, admin: true },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, admin: true },
  { href: "/equipe", label: "Equipe", icon: Users, admin: true },
];

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

export function AppShell({
  children,
  userName,
  role,
}: {
  children: React.ReactNode;
  userName: string;
  role: Role;
}) {
  const pathname = usePathname();
  const items = nav.filter((item) => role === "admin" || !item.admin);

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/70 bg-card/70 p-5 md:flex">
        <BrandLogo className="mb-8" />
        <nav className="flex flex-1 flex-col gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-2xl bg-secondary/80 p-3">
          <p className="truncate text-sm font-medium">{userName}</p>
          <p className="text-xs text-muted-foreground">{roleLabel(role)}</p>
          <form action={logout}>
            <button type="submit" className="mt-2 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
              <LogOut className="size-3.5" /> Sair
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border/70 bg-card/80 px-4 py-3 md:hidden">
          <BrandLogo />
          <form action={logout}>
            <button type="submit" className="text-sm text-muted-foreground">
              Sair
            </button>
          </form>
        </header>
        <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:pb-10">{children}</main>
        <nav className={`fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-background/95 px-1 py-2 backdrop-blur md:hidden ${items.length <= 2 ? "grid-cols-2" : items.length > 6 ? "grid-cols-4" : "grid-cols-6"}`}>
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn("flex flex-col items-center gap-1 rounded-lg py-1 text-[10px]", active ? "text-primary" : "text-muted-foreground")}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
