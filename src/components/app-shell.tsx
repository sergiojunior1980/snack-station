"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, LayoutDashboard, LogOut, Package, ShoppingBag, Users, Wallet, Warehouse } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { roleLabel } from "@/lib/roles";
import type { Role } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { logout } from "@/server/actions";

const nav = [
  { href: "/", label: "Início", icon: LayoutDashboard, admin: true, children: [] as { href: string; label: string; admin?: boolean }[] },
  { href: "/vendas", label: "Vender", icon: ShoppingBag, admin: false, children: [] },
  {
    href: "/produtos",
    label: "Produtos",
    icon: Package,
    admin: false,
    children: [
      { href: "/produtos", label: "Cadastro" },
      { href: "/categorias", label: "Categorias", admin: true },
    ],
  },
  {
    href: "/estoque",
    label: "Estoque",
    icon: Warehouse,
    admin: true,
    children: [
      { href: "/estoque", label: "Movimento" },
      { href: "/compras", label: "Compras" },
    ],
  },
  {
    href: "/financeiro",
    label: "Financeiro",
    icon: Wallet,
    admin: true,
    children: [
      { href: "/financeiro", label: "Caixa", hash: "" },
      { href: "/financeiro", label: "Formas de pagamento", hash: "formas" },
    ],
  },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, admin: true, children: [] },
  { href: "/equipe", label: "Equipe", icon: Users, admin: true, children: [] },
];

function groupActive(pathname: string, item: (typeof nav)[number]) {
  if (item.href === "/") return pathname === "/";
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
  return item.children.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`));
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
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [pathname]);
  const items = nav.filter((item) => role === "admin" || !item.admin);

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/70 bg-card/70 p-5 md:flex">
        <BrandLogo className="mb-8" />
        <nav className="flex flex-1 flex-col gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = groupActive(pathname, item);
            const children = item.children.filter((child) => role === "admin" || !("admin" in child && child.admin));
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
                {active && children.length > 1 ? (
                  <div className="mt-1 ml-7 flex flex-col gap-1">
                    {children.map((child) => {
                      const tab = "hash" in child ? child.hash : undefined;
                      const href = tab ? `${child.href}#${tab}` : child.href;
                      const onFinance = child.href === "/financeiro";
                      const selected = onFinance
                        ? pathname === "/financeiro" && (tab ? hash === `#${tab}` : hash !== "#formas")
                        : pathname === child.href;
                      return (
                        <Link
                          key={child.label}
                          href={href}
                          onClick={(event) => {
                            if (pathname !== "/financeiro" || !onFinance) return;
                            event.preventDefault();
                            window.history.replaceState(null, "", href);
                            window.dispatchEvent(new HashChangeEvent("hashchange"));
                          }}
                          className={cn(
                            "rounded-lg px-2 py-1.5 text-xs",
                            selected ? "bg-secondary font-medium text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
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
            const active = groupActive(pathname, item);
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
