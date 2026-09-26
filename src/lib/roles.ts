export type Role = "admin" | "vendedor";

export const sellerMenus = [
  { id: "vender", label: "Vender", prefixes: ["/vendas"] },
  { id: "produtos", label: "Produtos", prefixes: ["/produtos"] },
  { id: "estoque", label: "Estoque", prefixes: ["/compras", "/estoque"] },
  { id: "financeiro", label: "Financeiro", prefixes: ["/financeiro"] },
  { id: "relatorios", label: "Relatórios", prefixes: ["/relatorios"] },
  { id: "configuracoes", label: "Configurações", prefixes: ["/configuracoes"] },
] as const;

export type MenuId = (typeof sellerMenus)[number]["id"];

export const defaultSellerMenus: MenuId[] = ["vender", "produtos"];

const menuIds = new Set<string>(sellerMenus.map((menu) => menu.id));

export function normalizeRole(role: string | null | undefined): Role {
  return role === "admin" ? "admin" : "vendedor";
}

export function roleLabel(role: Role) {
  return role === "admin" ? "Administrador" : "Vendedor";
}

export function normalizeMenus(value: unknown): MenuId[] {
  if (!Array.isArray(value)) return [...defaultSellerMenus];
  const ids = value.filter((item): item is MenuId => typeof item === "string" && menuIds.has(item));
  return ids.length ? ids : [...defaultSellerMenus];
}

export function canUseMenu(role: Role, menus: MenuId[], menu: MenuId) {
  return role === "admin" || menus.includes(menu);
}

export function canVisit(role: Role, menus: MenuId[], pathname: string) {
  if (role === "admin") return true;
  return sellerMenus.some(
    (menu) => menus.includes(menu.id) && menu.prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
}

export function homeFor(role: Role, menus: MenuId[] = defaultSellerMenus) {
  if (role === "admin") return "/";
  const allowed = sellerMenus.find((menu) => menus.includes(menu.id));
  return allowed?.prefixes[0] ?? "/vendas";
}
