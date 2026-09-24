export type Role = "admin" | "vendedor";

export function normalizeRole(role: string | null | undefined): Role {
  return role === "admin" ? "admin" : "vendedor";
}

export function roleLabel(role: Role) {
  return role === "admin" ? "Administrador" : "Vendedor";
}

const sellerPrefixes = ["/vendas", "/produtos"];

export function sellerCanVisit(pathname: string) {
  return sellerPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function homeFor(role: Role) {
  return role === "admin" ? "/" : "/vendas";
}
