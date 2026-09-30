"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, ChevronDown, ClipboardList, LayoutDashboard, LogOut, Package, Settings, ShoppingBag, Store, Users, Wallet, Warehouse } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { financeReports } from "@/lib/report-nav";
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
      { href: "/financeiro", label: "Formas de pagamento", hash: "formas", admin: true },
    ],
  },
  {
    href: "/relatorios",
    label: "Relatórios",
    icon: BarChart3,
    menu: "relatorios",
    children: [
      { href: "/relatorios/estoque", label: "Estoque" },
      {
        href: "/relatorios/financeiro/lucro",
        label: "Financeiro",
        children: financeReports.map((item) => ({ href: item.href, label: item.label })),
      },
    ],
  },
  { href: "/configuracoes", label: "Configurações", icon: Settings, menu: "configuracoes", children: [] },
  { href: "/auditoria", label: "Auditoria", icon: ClipboardList, menu: "auditoria", children: [] },
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

function menuKey(parent: string, label: string) {
  return parent ? `${parent}/${label}` : label;
}

function branchKeys(parent: string, children: NavChild[], pathname: string, keys: string[]) {
  for (const child of children) {
    const key = menuKey(parent, child.label);
    const nested = child.children ?? [];
    if (nested.length > 0 && childActive(pathname, child)) {
      keys.push(key);
      branchKeys(key, nested, pathname, keys);
    }
  }
}

function Submenu({
  items,
  pathname,
  hash,
  depth,
  parentKey,
  isOpen,
  onToggle,
}: {
  items: NavChild[];
  pathname: string;
  hash: string;
  depth: number;
  parentKey: string;
  isOpen: (key: string) => boolean;
  onToggle: (key: string, href: string) => void;
}) {
  return (
    <div className={cn("mt-1 flex flex-col gap-1", depth === 0 ? "ml-7" : "ml-4")}>
      {items.map((child) => {
        const key = menuKey(parentKey, child.label);
        const nested = child.children ?? [];
        const tab = child.hash;
        const href = tab ? `${child.href}#${tab}` : child.href;
        const onFinance = child.hash !== undefined;
        const selected = onFinance
          ? pathname === "/financeiro" && (tab ? hash === `#${tab}` : hash !== "#formas")
          : pathname === child.href || nested.some((item) => childActive(pathname, item));
        const className = cn(
          "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs",
          selected ? "bg-secondary font-medium text-foreground" : "text-muted-foreground",
        );
        if (nested.length > 0) {
          const open = isOpen(key);
          return (
            <div key={child.label}>
              <button type="button" aria-expanded={open} className={className} onClick={() => onToggle(key, child.href)}>
                {child.label}
                <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
              </button>
              {open ? (
                <Submenu items={nested} pathname={pathname} hash={hash} depth={depth + 1} parentKey={key} isOpen={isOpen} onToggle={onToggle} />
              ) : null}
            </div>
          );
        }
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
            className={className}
          >
            {child.label}
          </Link>
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
  shopName = "",
}: {
  children: React.ReactNode;
  userName: string;
  role: Role;
  menus: MenuId[];
  shopName?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [hash, setHash] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [trackedPath, setTrackedPath] = useState(pathname);
  if (trackedPath !== pathname) {
    setTrackedPath(pathname);
    setOpen({});
  }
  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [pathname]);
  const items = role === "plataforma"
    ? [{ href: "/lojas", label: "Lojas", icon: Store, children: [] as NavChild[] }]
    : nav.filter((item) => {
        if (item.href === "/financeiro") return true;
        return item.menu ? canUseMenu(role, menus, item.menu) : role === "admin";
      });
  const activeKeys = items.flatMap((item) => {
    if (!groupActive(pathname, item)) return [];
    const keys = item.children.length > 0 ? [item.label] : [];
    branchKeys(item.label, visibleChildren(item.children, role), pathname, keys);
    return keys;
  });
  const isOpen = (key: string) => (key in open ? open[key] : activeKeys.includes(key));
  const onToggle = (key: string, href: string) => {
    const opening = !isOpen(key);
    setOpen((current) => ({ ...current, [key]: opening }));
    const path = href.split("#")[0] ?? href;
    if (opening && path && pathname !== path) router.push(path);
  };

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
            const expanded = showChildren && isOpen(item.label);
            const itemClass = cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            );
            return (
              <div key={item.label}>
                {showChildren ? (
                  <button type="button" aria-expanded={expanded} className={itemClass} onClick={() => onToggle(item.label, item.href)}>
                    <Icon className="size-4" />
                    <span className="flex-1">{item.label}</span>
                    <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
                  </button>
                ) : (
                  <Link href={item.href} className={itemClass}>
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                )}
                {expanded ? (
                  <Submenu items={children} pathname={pathname} hash={hash} depth={0} parentKey={item.label} isOpen={isOpen} onToggle={onToggle} />
                ) : null}
              </div>
            );
          })}
        </nav>
        <div className="mt-auto rounded-2xl bg-secondary/80 p-3">
          <p className="truncate text-sm font-medium">{userName}</p>
          <p className="text-xs text-muted-foreground">{shopName ? `${shopName} · ` : ""}{roleLabel(role)}</p>
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
