"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, LayoutDashboard, LogOut, Package, Settings, ShoppingBag, Users, Wallet, Warehouse } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { canUseMenu, roleLabel, type MenuId, type Role } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { clearSessionMark } from "@/lib/browser-session";
import { BrowserSession } from "@/components/browser-session";
import { logout } from "@/server/actions";

type NavChild = { href: string; label: string; admin?: boolean; hash?: string; children?: NavChild[] };
type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  menu?: MenuId;
  children: NavChild[];
};

const nav: NavItem[] = [
  { href: "/", label: "Início", icon: LayoutDashboard, children: [] },
  { href: "/vendas", label: "Vender", icon: ShoppingBag, menu: "vender", children: [] },
  {
    href: "/produtos",
    label: "Produtos",
    icon: Package,
    menu: "produtos",
    children: [
      { href: "/produtos", label: "Cadastro", children: [{ href: "/categorias", label: "Categorias", admin: true }] },
    ],
  },
  {
    href: "/compras",
    label: "Estoque",
    icon: Warehouse,
    menu: "estoque",
    children: [
      { href: "/estoque", label: "Movimento" },
      { href: "/compras", label: "Compras" },
    ],
  },
  {
    href: "/financeiro",
    label: "Financeiro",
    icon: Wallet,
    menu: "financeiro",
    children: [
      { href: "/financeiro", label: "Caixa", hash: "" },
      { href: "/financeiro", label: "Formas de pagamento", hash: "formas" },
    ],
  },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, menu: "relatorios", children: [] },
  { href: "/configuracoes", label: "Configurações", icon: Settings, menu: "configuracoes", children: [] },
  { href: "/equipe", label: "Equipe", icon: Users, children: [] },
];

function childActive(pathname: string, child: NavChild): boolean {
  if (pathname === child.href || (child.href !== "/" && pathname.startsWith(`${child.href}/`))) return true;
  return (child.children ?? []).some((item) => childActive(pathname, item));
}

function groupActive(pathname: string, item: NavItem) {
  if (item.href === "/") return pathname === "/";
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
  return item.children.some((child) => childActive(pathname, child));
}

function visibleChildren(children: NavChild[], role: Role): NavChild[] {
  return children
    .filter((child) => role === "admin" || !child.admin)
    .map((child) => ({ ...child, children: child.children ? visibleChildren(child.children, role) : undefined }));
}

function Submenu({ items, pathname, hash, depth }: { items: NavChild[]; pathname: string; hash: string; depth: number }) {
  return (
    <div className={cn("mt-1 flex flex-col gap-1", depth === 0 ? "ml-7" : "ml-4")}>
      {items.map((child) => {
        const tab = child.hash;
        const href = tab ? `${child.href}#${tab}` : child.href;
        const onFinance = child.hash !== undefined;
        const selected = onFinance
          ? pathname === "/financeiro" && (tab ? hash === `#${tab}` : hash !== "#formas")
          : pathname === child.href;
        const nested = child.children ?? [];
        return (
          <div key={child.label}>
            <Link
              href={href}
              onClick={(event) => {
                if (pathname !== "/financeiro" || !onFinance) return;
                event.preventDefault();
                window.history.replaceState(null, "", href);
                window.dispatchEvent(new HashChangeEvent("hashchange"));
              }}
              className={cn(
                "block rounded-lg px-2 py-1.5 text-xs",
                selected ? "bg-secondary font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {child.label}
            </Link>
            {nested.length > 0 ? <Submenu items={nested} pathname={pathname} hash={hash} depth={depth + 1} /> : null}
          </div>
        );
      })}
    </div>
  );
}

export function AppShell({
  children,
  userName,
  role,
  menus,
}: {
  children: React.ReactNode;
  userName: string;
  role: Role;
  menus: MenuId[];
}) {
  const pathname = usePathname();
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [pathname]);
  const items = nav.filter((item) => (item.menu ? canUseMenu(role, menus, item.menu) : role === "admin"));

  return (
    <BrowserSession>
    <div className="mx-auto flex min-h-screen max-w-7xl">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/70 bg-card/70 p-5 md:flex">
        <BrandLogo className="mb-4" />
        <nav className="flex flex-1 flex-col gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = groupActive(pathname, item);
            const children = visibleChildren(item.children, role);
            const showChildren = children.length > 1 || children.some((child) => (child.children ?? []).length > 0);
            return (
              <div key={item.label}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
                {active && showChildren ? <Submenu items={children} pathname={pathname} hash={hash} depth={0} /> : null}
              </div>
            );
          })}
        </nav>
        <div className="mt-auto rounded-2xl bg-secondary/80 p-3">
          <p className="truncate text-sm font-medium">{userName}</p>
          <p className="text-xs text-muted-foreground">{roleLabel(role)}</p>
          <form action={logout} onSubmit={() => clearSessionMark()}>
            <button type="submit" className="mt-2 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
              <LogOut className="size-3.5" /> Sair
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border/70 bg-card/80 px-4 py-3 md:hidden">
          <BrandLogo />
          <form action={logout} onSubmit={() => clearSessionMark()}>
            <button type="submit" className="text-sm text-muted-foreground">
              Sair
            </button>
          </form>
        </header>
        <main className="flex-1 px-3 py-3 pb-16 md:px-4 md:pb-4">{children}</main>
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
    </BrowserSession>
  );
}
