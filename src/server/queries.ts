import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { canUseMenu, defaultSellerMenus, normalizeMenus, normalizeRole, type Role } from "@/lib/roles";
import type { ReportGrain } from "@/lib/dates";

export type Product = {
  id: string;
  name: string;
  category: string;
  attributes: Record<string, string>;
  sale_price_cents: number;
  cost_price_cents: number;
  stock_quantity: number;
  min_stock: number;
  active: boolean;
  is_combo?: boolean;
  components?: { product_id: string; quantity: number }[];
  display_cost_cents?: number;
  nearest_expires_on?: string | null;
};

export type CostMode = "media" | "maior";

export function stockUnitCost(
  lots: { quantity_remaining: number; unit_cost_cents: number }[],
  mode: CostMode,
) {
  const alive = lots.filter((lot) => lot.quantity_remaining > 0);
  if (alive.length === 0) return 0;
  if (mode === "maior") return Math.max(...alive.map((lot) => lot.unit_cost_cents));
  const quantity = alive.reduce((sum, lot) => sum + lot.quantity_remaining, 0);
  const total = alive.reduce((sum, lot) => sum + lot.quantity_remaining * lot.unit_cost_cents, 0);
  return quantity > 0 ? Math.round(total / quantity) : 0;
}

export type CategoryField = {
  key: string;
  label: string;
  field_type: "text" | "number" | "select";
  unit: string | null;
  options: string[];
  required: boolean;
  sort_order: number;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  fields: CategoryField[];
};

export const requireUser = cache(async function requireUser() {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, user: null, name: "", role: "vendedor" as Role, menus: [...defaultSellerMenus] };
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { supabase, user: null, name: "", role: "vendedor" as Role, menus: [...defaultSellerMenus] };
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, menus")
    .eq("id", data.user.id)
    .maybeSingle();
  return {
    supabase,
    user: data.user,
    name: profile?.full_name || data.user.email || "Equipe",
    role: normalizeRole(profile?.role),
    menus: normalizeMenus(profile?.menus),
  };
});

export async function listProducts() {
  const { supabase } = await requireUser();
  if (!supabase) return [];
  const withCombo = await supabase
    .from("products")
    .select("id, name, category, attributes, sale_price_cents, cost_price_cents, stock_quantity, min_stock, active, is_combo")
    .order("name");
  const data = withCombo.error
    ? (
        await supabase
          .from("products")
          .select("id, name, category, attributes, sale_price_cents, cost_price_cents, stock_quantity, min_stock, active")
          .order("name")
      ).data
    : withCombo.data;
  const products = ((data ?? []) as Product[]).map((product) => ({
    ...product,
    attributes: product.attributes ?? {},
    cost_price_cents: product.cost_price_cents ?? 0,
    is_combo: Boolean(product.is_combo),
  }));
  const [{ data: parts }, { data: lots }, mode] = await Promise.all([
    supabase.from("product_components").select("combo_id, product_id, quantity"),
    supabase.from("stock_lots").select("product_id, quantity_remaining, unit_cost_cents, expires_on").gt("quantity_remaining", 0),
    costMode(),
  ]);
  const pieces = (parts ?? []) as { combo_id: string; product_id: string; quantity: number }[];
  const byProduct = new Map<string, { quantity_remaining: number; unit_cost_cents: number; expires_on: string | null }[]>();
  for (const lot of (lots ?? []) as { product_id: string; quantity_remaining: number; unit_cost_cents: number; expires_on: string | null }[]) {
    const list = byProduct.get(lot.product_id) ?? [];
    list.push(lot);
    byProduct.set(lot.product_id, list);
  }
  const expiryOf = (productId: string) => {
    const dates = (byProduct.get(productId) ?? []).map((lot) => lot.expires_on).filter((day): day is string => Boolean(day));
    return dates.sort()[0] ?? null;
  };
  const unit = new Map(products.map((product) => [product.id, stockUnitCost(byProduct.get(product.id) ?? [], mode)]));
  const stock = new Map(products.map((product) => [product.id, product.stock_quantity]));
  return products.map((product) => {
    const components = pieces
      .filter((part) => part.combo_id === product.id)
      .map((part) => ({ product_id: part.product_id, quantity: part.quantity }));
    if (!product.is_combo) {
      return { ...product, display_cost_cents: unit.get(product.id) ?? 0, nearest_expires_on: expiryOf(product.id) };
    }
    const available = components.length
      ? Math.min(...components.map((part) => Math.floor((stock.get(part.product_id) ?? 0) / part.quantity)))
      : 0;
    const display = components.reduce((sum, part) => sum + (unit.get(part.product_id) ?? 0) * part.quantity, 0);
    const dates = components.map((part) => expiryOf(part.product_id)).filter((day): day is string => Boolean(day));
    return {
      ...product,
      stock_quantity: available,
      components,
      display_cost_cents: display,
      nearest_expires_on: dates.sort()[0] ?? null,
    };
  });
}

export async function costMode(): Promise<CostMode> {
  const { supabase } = await requireUser();
  if (!supabase) return "media";
  const { data } = await supabase.from("app_settings").select("value").eq("key", "stock_cost_mode").maybeSingle();
  return data?.value === "maior" ? "maior" : "media";
}

export type PayMethod = { id: string; name: string; counts_as_cash: boolean; settles_balance: boolean; active?: boolean };

const fallbackReceipts: PayMethod[] = [
  { id: "dinheiro", name: "Dinheiro", counts_as_cash: true, settles_balance: false },
  { id: "pix", name: "PIX", counts_as_cash: false, settles_balance: false },
  { id: "cartao", name: "Cartão", counts_as_cash: false, settles_balance: false },
];

const fallbackPayments: PayMethod[] = [
  ...fallbackReceipts.map((item) => ({ ...item, counts_as_cash: false, settles_balance: item.id === "dinheiro" })),
  { id: "saldo", name: "Saldo da conta", counts_as_cash: false, settles_balance: true },
];

const loadPaymentMethods = cache(async () => {
  const { supabase } = await requireUser();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("payment_methods")
    .select("id, name, kind, counts_as_cash, settles_balance, active, sort_order")
    .order("sort_order");
  if (error || !data?.length) return null;
  return data as (PayMethod & { kind: string; active: boolean; sort_order: number })[];
});

export async function listPaymentMethods(kind: "recebimento" | "pagamento") {
  const fallback = kind === "recebimento" ? fallbackReceipts : fallbackPayments;
  const data = await loadPaymentMethods();
  if (!data) return fallback;
  const rows = data.filter((item) => item.kind === kind);
  return rows.length ? rows : fallback;
}

export async function listTape(module: "caixa_vendas" | "compras_estoque" | "perfis" | "cadastro_produtos") {
  const { supabase, role, menus } = await requireUser();
  const allowed =
    role === "admin" ||
    (module === "caixa_vendas" && canUseMenu(role, menus, "financeiro")) ||
    (module === "compras_estoque" && canUseMenu(role, menus, "estoque")) ||
    (module === "cadastro_produtos" && canUseMenu(role, menus, "produtos"));
  if (!supabase || !allowed) return [];
  const { data } = await supabase
    .from("audit_tape")
    .select("id, summary, created_at, created_by")
    .eq("module", module)
    .order("id", { ascending: false })
    .limit(40);
  const rows = (data ?? []) as { id: number; summary: string; created_at: string; created_by: string | null }[];
  const ids = [...new Set(rows.map((row) => row.created_by).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    for (const profile of profiles ?? []) names.set(profile.id, profile.full_name);
  }
  return rows.map((row) => ({
    id: row.id,
    summary: row.summary,
    created_at: row.created_at,
    actor: (row.created_by && names.get(row.created_by)) || "Usuário não identificado",
  }));
}

export async function cashIsOpen() {
  const { supabase } = await requireUser();
  if (!supabase) return false;
  const { data, error } = await supabase.from("cash_sessions").select("id").is("closed_at", null).maybeSingle();
  if (error) return true;
  return Boolean(data);
}

export async function accountBalance() {
  const { supabase, role, menus } = await requireUser();
  if (!supabase || !canUseMenu(role, menus, "financeiro")) return 0;
  const { data, error } = await supabase.rpc("account_balance");
  if (error) return 0;
  return Number(data ?? 0);
}
export async function listTeam() {
  const { supabase, role } = await requireUser();
  if (!supabase || role !== "admin") return [];
  const [{ data }, { data: secrets }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, username, role, menus, created_at").order("full_name"),
    supabase.from("seller_passwords").select("user_id, password"),
  ]);
  const passwords = new Map(
    ((secrets ?? []) as { user_id: string; password: string }[]).map((item) => [item.user_id, item.password]),
  );
  return ((data ?? []) as { id: string; full_name: string; username: string | null; role: Role; menus: unknown; created_at: string }[]).map(
    (member) => ({ ...member, menus: normalizeMenus(member.menus), password: passwords.get(member.id) ?? null }),
  );
}

export async function listCategories() {
  const { supabase } = await requireUser();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, category_fields(key, label, field_type, unit, options, required, sort_order)")
    .order("sort_order");
  if (error || !Array.isArray(data)) return [];
  return data.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    fields: [...(Array.isArray(category.category_fields) ? category.category_fields : [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    ),
  }));
}

export async function recentSales(limit = 8) {
  const { supabase } = await requireUser();
  if (!supabase) return [];
  const { data } = await supabase
    .from("sales")
    .select("id, total_cents, payment_method, created_at, sale_items(product_name, quantity), sale_payments(payment_method, amount_cents)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function recentPurchases(limit = 8) {
  const { supabase } = await requireUser();
  if (!supabase) return [];
  const { data } = await supabase
    .from("purchases")
    .select("id, total_cents, supplier, payment_method, created_at, purchased_on, purchase_items(product_id, product_name, quantity, unit_cost_cents, barcode, expires_on)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function financeEntries(from: Date, to: Date) {
  const { supabase, role, menus } = await requireUser();
  if (!supabase || !canUseMenu(role, menus, "financeiro")) return { sales: [], purchases: [], movements: [], sessions: [] };

  const [sales, purchases, movements, sessions] = await Promise.all([
    supabase
      .from("sales")
      .select("id, total_cents, payment_method, created_at")
      .gte("created_at", from.toISOString())
      .lt("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("purchases")
      .select("id, total_cents, supplier, created_at")
      .gte("created_at", from.toISOString())
      .lt("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("cash_movements")
      .select("id, kind, amount_cents, note, created_at")
      .gte("created_at", from.toISOString())
      .lt("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("cash_sessions")
      .select("id, opened_at, opening_cents, opening_note, closed_at, counted_cents, closing_note")
      .gte("opened_at", from.toISOString())
      .lt("opened_at", to.toISOString())
      .order("opened_at", { ascending: false })
      .limit(200),
  ]);

  return {
    sales: (sales.data ?? []) as { id: string; total_cents: number; payment_method: string; created_at: string }[],
    purchases: (purchases.data ?? []) as { id: string; total_cents: number; supplier: string | null; created_at: string }[],
    movements: (movements.data ?? []) as { id: string; kind: "entrada" | "retirada"; amount_cents: number; note: string; created_at: string }[],
    sessions: (sessions.data ?? []) as {
      id: string;
      opened_at: string;
      opening_cents: number;
      opening_note: string | null;
      closed_at: string | null;
      counted_cents: number | null;
      closing_note: string | null;
    }[],
  };
}

export async function cashDesk() {
  const { supabase, role, menus } = await requireUser();
  const empty = { open: null as null, expectedCents: 0, recent: [] as CashSession[] };
  if (!supabase || !canUseMenu(role, menus, "financeiro")) return empty;
  const { data: open, error } = await supabase
    .from("cash_sessions")
    .select("id, opened_at, opening_cents, opening_note, closed_at, counted_cents, expected_cents, difference_cents, closing_note")
    .is("closed_at", null)
    .maybeSingle();
  if (error) return empty;
  let expectedCents = 0;
  if (open) {
    const { data } = await supabase.rpc("cash_expected", { p_session_id: open.id });
    expectedCents = Number(data ?? 0);
  }
  const { data: recent } = await supabase
    .from("cash_sessions")
    .select("id, opened_at, opening_cents, opening_note, closed_at, counted_cents, expected_cents, difference_cents, closing_note")
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false })
    .limit(8);
  return {
    open: open as CashSession | null,
    expectedCents,
    recent: (recent ?? []) as CashSession[],
  };
}

export type CashSession = {
  id: string;
  opened_at: string;
  opening_cents: number;
  opening_note: string | null;
  closed_at: string | null;
  counted_cents: number | null;
  expected_cents: number | null;
  difference_cents: number | null;
  closing_note: string | null;
};

export async function stockBoard() {
  const { supabase, role, menus } = await requireUser();
  if (!supabase || !canUseMenu(role, menus, "estoque")) return { products: [], lots: [], movements: [], ready: false };
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, stock_quantity, avg_cost_cents, cost_price_cents, active")
    .order("name");
  if (error) return { products: [], lots: [], movements: [], ready: false };
  const [{ data: lots }, { data: movements }] = await Promise.all([
    supabase
      .from("stock_lots")
      .select("id, product_id, quantity_remaining, unit_cost_cents, received_on, expires_on, supplier")
      .gt("quantity_remaining", 0)
      .order("expires_on", { ascending: true, nullsFirst: false })
      .limit(40),
    supabase
      .from("stock_movements")
      .select("id, product_id, direction, quantity, unit_cost_cents, received_on, expires_on, reason, note, avg_cost_cents_after, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  return {
    ready: true,
    products: (products ?? []) as StockProduct[],
    lots: (lots ?? []) as StockLot[],
    movements: (movements ?? []) as StockMove[],
  };
}

export type StockProduct = {
  id: string;
  name: string;
  stock_quantity: number;
  avg_cost_cents: number;
  cost_price_cents: number;
  active: boolean;
};

export type StockLot = {
  id: string;
  product_id: string;
  quantity_remaining: number;
  unit_cost_cents: number;
  received_on: string;
  expires_on: string | null;
  supplier: string | null;
};

export type StockMove = {
  id: string;
  product_id: string;
  direction: "entrada" | "saida";
  quantity: number;
  unit_cost_cents: number;
  received_on: string | null;
  expires_on: string | null;
  reason: string | null;
  note: string | null;
  avg_cost_cents_after: number;
  created_at: string;
};

export async function revenueSeries(from: Date, to: Date, grain: ReportGrain) {
  const { supabase } = await requireUser();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("revenue_series", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_grain: grain,
  });
  if (error) return [];
  return (data ?? []) as { bucket: string; total_cents: number; sale_count: number }[];
}

export async function topProducts(from: Date, to: Date) {
  const { supabase } = await requireUser();
  if (!supabase) return [];
  const { data } = await supabase.rpc("top_products", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_limit: 10,
  });
  return (data ?? []) as {
    product_id: string;
    product_name: string;
    quantity: number;
    total_cents: number;
  }[];
}

export async function unsoldProducts(from: Date, to: Date) {
  const { supabase } = await requireUser();
  if (!supabase) return [];
  const { data } = await supabase.rpc("unsold_products", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  return (data ?? []) as {
    product_id: string;
    product_name: string;
    category: string;
    stock_quantity: number;
  }[];
}
