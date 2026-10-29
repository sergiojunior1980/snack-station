import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { defaultAppearance, defaultLoginBrand, isHexColor, type Appearance, type LoginBrand } from "@/lib/brand";
import { canUseMenu, defaultSellerMenus, normalizeMenus, normalizeRole, type Role } from "@/lib/roles";
import { slipRevenue } from "@/lib/cash-revenue";
import type { CashClosing } from "@/lib/cash-closing";
import { paymentLabel } from "@/lib/catalog";
import { formatBRL } from "@/lib/money";
import { emptyShopFiscal, type ShopFiscal } from "@/lib/company";
import type { CashSlip } from "@/lib/cash-slip";
import { bucketKey, formatDateTime, type ReportGrain } from "@/lib/dates";

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
  ncm?: string | null;
  cfop?: string;
  tax_code?: string;
  origin?: string;
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
  active: boolean;
  fields: CategoryField[];
};

export const requireUser = cache(async function requireUser() {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, user: null, name: "", role: "vendedor" as Role, menus: [...defaultSellerMenus], shopName: "", shopStatus: null as string | null };
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { supabase, user: null, name: "", role: "vendedor" as Role, menus: [...defaultSellerMenus], shopName: "", shopStatus: null as string | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, menus, tenants(name, status)")
    .eq("id", data.user.id)
    .maybeSingle();
  const shop = Array.isArray(profile?.tenants) ? profile?.tenants[0] : profile?.tenants;
  return {
    supabase,
    user: data.user,
    name: profile?.full_name || data.user.email || "Equipe",
    role: normalizeRole(profile?.role),
    menus: normalizeMenus(profile?.menus),
    shopName: shop?.name ?? "",
    shopStatus: shop?.status ?? null,
  };
});

export const appearance = cache(async (): Promise<Appearance> => {
  const supabase = await createClient();
  if (!supabase) return defaultAppearance;
  const [{ data }, { data: userData }] = await Promise.all([
    supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["brand_button_color", "brand_background_color", "brand_logo_url", "brand_tagline", "brand_tagline_note"]),
    supabase.auth.getUser(),
  ]);
  let name = "";
  if (userData.user) {
    const { data: profile } = await supabase.from("profiles").select("tenants(name)").eq("id", userData.user.id).maybeSingle();
    const shop = Array.isArray(profile?.tenants) ? profile.tenants[0] : profile?.tenants;
    name = shop?.name?.trim() ?? "";
  }
  const values = new Map((data ?? []).map((row) => [row.key, row.value]));
  const buttonColor = values.get("brand_button_color") ?? "";
  const backgroundColor = values.get("brand_background_color") ?? "";
  return {
    name,
    buttonColor: isHexColor(buttonColor) ? buttonColor : defaultAppearance.buttonColor,
    backgroundColor: isHexColor(backgroundColor) ? backgroundColor : defaultAppearance.backgroundColor,
    logoUrl: values.get("brand_logo_url") ?? "",
    tagline: values.get("brand_tagline")?.trim() || defaultAppearance.tagline,
    taglineNote: values.get("brand_tagline_note")?.trim() || defaultAppearance.taglineNote,
  };
});

export async function loginBrand(shop: string): Promise<LoginBrand> {
  const supabase = await createClient();
  if (!supabase) return defaultLoginBrand;
  const { data } = await supabase.rpc("shop_login_brand", { p_shop: shop });
  if (!data || typeof data !== "object") return defaultLoginBrand;
  const row = data as { name?: string; logo_url?: string; tagline?: string; tagline_note?: string; button_color?: string; background_color?: string };
  const buttonColor = row.button_color ?? "";
  const backgroundColor = row.background_color ?? "";
  return {
    name: row.name?.trim() || defaultLoginBrand.name,
    logoUrl: row.logo_url ?? "",
    tagline: row.tagline?.trim() || defaultLoginBrand.tagline,
    taglineNote: row.tagline_note?.trim() || defaultLoginBrand.taglineNote,
    buttonColor: isHexColor(buttonColor) ? buttonColor : defaultLoginBrand.buttonColor,
    backgroundColor: isHexColor(backgroundColor) ? backgroundColor : defaultLoginBrand.backgroundColor,
  };
}

export async function listProducts() {
  const { supabase } = await requireUser();
  if (!supabase) return [];
  const withCombo = await supabase
    .from("products")
    .select("id, name, category, attributes, sale_price_cents, cost_price_cents, stock_quantity, min_stock, active, is_combo, ncm, cfop, tax_code, origin")
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

export type PayMethod = {
  id: string;
  name: string;
  counts_as_cash: boolean;
  settles_balance: boolean;
  active?: boolean;
  fiscal_code?: string | null;
};

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
    .select("id, name, kind, counts_as_cash, settles_balance, active, sort_order, fiscal_code")
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

const tapeModules = ["caixa_vendas", "compras_estoque", "cadastro_produtos", "perfis", "empresa"] as const;
export type TapeModule = (typeof tapeModules)[number];

export const tapeModuleLabel: Record<TapeModule, string> = {
  caixa_vendas: "Caixa e vendas",
  compras_estoque: "Compras e estoque",
  cadastro_produtos: "Cadastro de produtos",
  perfis: "Equipe",
  empresa: "Empresa",
};

export async function shopFiscal(): Promise<ShopFiscal | null> {
  const { supabase, role } = await requireUser();
  if (!supabase || role !== "admin") return null;
  const { data } = await supabase.from("shop_fiscal_form").select("*").maybeSingle();
  if (!data) return null;
  return {
    ...emptyShopFiscal,
    legalName: data.legal_name ?? "",
    tradeName: data.trade_name ?? "",
    cnpj: data.cnpj ?? "",
    stateRegistration: data.state_registration ?? "",
    street: data.street ?? "",
    number: data.number ?? "",
    complement: data.complement ?? "",
    district: data.district ?? "",
    cityName: data.city_name ?? "",
    cityCode: data.city_code ?? "",
    state: data.state ?? "SP",
    zip: data.zip ?? "",
    crt: Number(data.crt) || 1,
    nfceSeries: Number(data.nfce_series) || 1,
    nfceNextNumber: Number(data.nfce_next_number) || 1,
    environment: data.environment === "producao" ? "producao" : "homologacao",
    cscId: data.csc_id ?? "",
    cscConfigured: Boolean(data.csc_configured),
    certificateConfigured: Boolean(data.certificate_configured),
  };
}

export async function listAudit(module?: string) {
  const { supabase, role, menus } = await requireUser();
  if (!supabase || !canUseMenu(role, menus, "auditoria")) return [];
  const selected = tapeModules.find((item) => item === module);
  let query = supabase.from("audit_tape").select("id, module, summary, created_at, created_by").order("id", { ascending: false }).limit(150);
  if (selected) query = query.eq("module", selected);
  const { data } = await query;
  const rows = (data ?? []) as { id: number; module: TapeModule; summary: string; created_at: string; created_by: string | null }[];
  const ids = [...new Set(rows.map((row) => row.created_by).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    for (const profile of profiles ?? []) names.set(profile.id, profile.full_name);
  }
  return rows.map((row) => ({
    id: row.id,
    module: tapeModuleLabel[row.module] ?? row.module,
    summary: row.summary,
    created_at: row.created_at,
    actor: (row.created_by && names.get(row.created_by)) || "Usuário não identificado",
  }));
}

type ClosingSession = {
  id: string;
  opened_at: string;
  opening_cents: number;
  opening_note: string | null;
  opened_by: string;
  closed_at: string | null;
  closed_by: string | null;
  counted_cents: number | null;
  expected_cents: number | null;
  difference_cents: number | null;
  closing_note: string | null;
};

type ClosingSale = {
  id: string;
  total_cents: number;
  payment_method: string;
  seller_name: string | null;
  created_at: string;
  sale_items: { product_id: string | null; product_name: string; quantity: number; total_cents: number }[] | null;
  sale_payments: { payment_method: string; amount_cents: number }[] | null;
};

type ClosingMovement = {
  id: string;
  kind: "entrada" | "retirada";
  amount_cents: number;
  note: string;
  created_at: string;
  created_by: string | null;
};

type ClosingPurchase = {
  id: string;
  total_cents: number;
  supplier: string | null;
  payment_method: string | null;
  created_at: string;
  purchase_items: { product_name: string; quantity: number }[] | null;
};

async function rowsInWindow<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await load(start, start + pageSize - 1);
    if (error || !data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

function personName(names: Map<string, string>, id: string | null) {
  if (!id) return "";
  return names.get(id) || "Usuário não identificado";
}

function pieceList(parts: { quantity: number; name: string }[]) {
  if (parts.length === 0) return "Sem itens";
  return parts.map((part) => `${part.quantity}× ${part.name}`).join(", ");
}

export async function cashClosingReport(sessionId?: string) {
  const { supabase, role, menus, shopName } = await requireUser();
  const empty = {
    shopName: shopName || "Loja",
    session: null as CashClosing | null,
    closed: [] as { id: string; label: string }[],
    hasOpen: false,
  };
  if (!supabase || !canUseMenu(role, menus, "relatorios")) return empty;
  const { data } = await supabase
    .from("cash_sessions")
    .select("id, opened_at, opening_cents, opening_note, opened_by, closed_at, closed_by, counted_cents, expected_cents, difference_cents, closing_note")
    .order("opened_at", { ascending: false })
    .limit(200);
  const all = (data ?? []) as ClosingSession[];
  const openSession = all.find((session) => session.closed_at == null) ?? null;
  const closed = all
    .filter((session) => session.closed_at)
    .map((session) => ({
      id: session.id,
      label: `${formatDateTime(session.opened_at)} – ${formatDateTime(session.closed_at as string)}`,
    }));
  const picked =
    (sessionId ? all.find((session) => session.id === sessionId && session.closed_at) : null) ?? openSession;
  const listed = { shopName: shopName || "Loja", closed, hasOpen: Boolean(openSession) };
  if (!picked) return { ...listed, session: null };
  const now = Date.now();
  const sessions = [picked];

  const windowStart = sessions.reduce((min, session) => Math.min(min, new Date(session.opened_at).getTime()), Number.POSITIVE_INFINITY);
  const windowEnd = sessions.reduce((max, session) => Math.max(max, session.closed_at ? new Date(session.closed_at).getTime() : now), 0);
  const startIso = new Date(windowStart).toISOString();
  const endIso = new Date(windowEnd).toISOString();
  const ordered = [...sessions].sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());
  const owner = (at: string) => {
    const time = new Date(at).getTime();
    return ordered.find((session) => {
      const opened = new Date(session.opened_at).getTime();
      const closed = session.closed_at ? new Date(session.closed_at).getTime() : now;
      return time >= opened && time < closed;
    });
  };

  const [{ data: methods }, sales, movements, purchases] = await Promise.all([
    supabase.from("payment_methods").select("id, name, kind, counts_as_cash, settles_balance, sort_order"),
    rowsInWindow<ClosingSale>((start, end) =>
      supabase
        .from("sales")
        .select("id, total_cents, payment_method, seller_name, created_at, sale_items(product_id, product_name, quantity, total_cents), sale_payments(payment_method, amount_cents)")
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("created_at", { ascending: true })
        .range(start, end),
    ),
    rowsInWindow<ClosingMovement>((start, end) =>
      supabase
        .from("cash_movements")
        .select("id, kind, amount_cents, note, created_at, created_by")
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("created_at", { ascending: true })
        .range(start, end),
    ),
    rowsInWindow<ClosingPurchase>((start, end) =>
      supabase
        .from("purchases")
        .select("id, total_cents, supplier, payment_method, created_at, purchase_items(product_name, quantity)")
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("created_at", { ascending: true })
        .range(start, end),
    ),
  ]);

  const methodRows = (methods ?? []) as {
    id: string;
    name: string;
    kind: string;
    counts_as_cash: boolean;
    settles_balance: boolean;
    sort_order: number;
  }[];
  const methodName = new Map<string, string>();
  for (const method of methodRows) {
    if (!methodName.has(method.id)) methodName.set(method.id, method.name);
  }
  const labelOf = (id: string) => methodName.get(id) || paymentLabel(id);
  const cashIds = new Set(methodRows.filter((method) => method.kind === "recebimento" && method.counts_as_cash).map((method) => method.id));
  const drawerIds = new Set(methodRows.filter((method) => method.kind === "pagamento" && method.settles_balance).map((method) => method.id));
  const receiptMethods = methodRows
    .filter((method) => method.kind === "recebimento")
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt"));

  const people = [
    ...new Set(
      [
        ...sessions.flatMap((session) => [session.opened_by, session.closed_by]),
        ...movements.map((movement) => movement.created_by),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: profiles } = people.length
    ? await supabase.from("profiles").select("id, full_name").in("id", people)
    : { data: [] as { id: string; full_name: string }[] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));

  const buckets = new Map(sessions.map((session) => [session.id, {
    sales: [] as ClosingSale[],
    movements: [] as ClosingMovement[],
    purchases: [] as ClosingPurchase[],
  }]));
  for (const sale of sales) {
    const session = owner(sale.created_at);
    if (session) buckets.get(session.id)?.sales.push(sale);
  }
  for (const movement of movements) {
    const session = owner(movement.created_at);
    if (session) buckets.get(session.id)?.movements.push(movement);
  }
  for (const purchase of purchases) {
    const session = owner(purchase.created_at);
    if (session) buckets.get(session.id)?.purchases.push(purchase);
  }

  const [session] = sessions.map((session) => {
      const bucket = buckets.get(session.id) ?? { sales: [], movements: [], purchases: [] };
      const payments: { method: string; cents: number }[] = [];
      const sellers = new Map<string, { count: number; cents: number }>();
      const products = new Map<string, { name: string; quantity: number; cents: number }>();
      let units = 0;
      const saleRows = bucket.sales.map((sale) => {
        const parts = sale.sale_payments?.length
          ? sale.sale_payments.map((payment) => ({ method: payment.payment_method, cents: payment.amount_cents }))
          : [{ method: sale.payment_method, cents: sale.total_cents }];
        payments.push(...parts);
        const seller = sale.seller_name?.trim() || "Sem vendedor";
        const sold = sellers.get(seller) ?? { count: 0, cents: 0 };
        sold.count += 1;
        sold.cents += sale.total_cents;
        sellers.set(seller, sold);
        for (const item of sale.sale_items ?? []) {
          units += item.quantity;
          const key = item.product_id || item.product_name;
          const row = products.get(key) ?? { name: item.product_name, quantity: 0, cents: 0 };
          row.quantity += item.quantity;
          row.cents += item.total_cents;
          products.set(key, row);
        }
        return {
          id: sale.id,
          at: sale.created_at,
          seller,
          cents: sale.total_cents,
          items: pieceList((sale.sale_items ?? []).map((item) => ({ quantity: item.quantity, name: item.product_name }))),
          payments: parts.map((part) => `${labelOf(part.method)} ${formatBRL(part.cents)}`).join(" · "),
        };
      });
      const byMethod = new Map<string, { cents: number; count: number }>();
      for (const payment of payments) {
        const row = byMethod.get(payment.method) ?? { cents: 0, count: 0 };
        row.cents += payment.cents;
        row.count += 1;
        byMethod.set(payment.method, row);
      }
      const seen = new Set<string>();
      const revenue = receiptMethods.map((method) => {
        seen.add(method.id);
        const row = byMethod.get(method.id);
        return { name: method.name, cents: row?.cents ?? 0, count: row?.count ?? 0 };
      });
      for (const [id, row] of byMethod) {
        if (seen.has(id) || row.cents === 0) continue;
        revenue.push({ name: labelOf(id), cents: row.cents, count: row.count });
      }
      const cashSalesCents = payments.reduce((sum, payment) => sum + (cashIds.has(payment.method) ? payment.cents : 0), 0);
      const inCents = bucket.movements.filter((movement) => movement.kind === "entrada").reduce((sum, movement) => sum + movement.amount_cents, 0);
      const outCents = bucket.movements.filter((movement) => movement.kind === "retirada").reduce((sum, movement) => sum + movement.amount_cents, 0);
      const purchaseRows = bucket.purchases.map((purchase) => ({
        id: purchase.id,
        at: purchase.created_at,
        supplier: purchase.supplier?.trim() || "Sem fornecedor",
        method: purchase.payment_method ? labelOf(purchase.payment_method) : "Sem forma",
        cents: purchase.total_cents,
        fromDrawer: Boolean(purchase.payment_method && drawerIds.has(purchase.payment_method)),
        items: pieceList((purchase.purchase_items ?? []).map((item) => ({ quantity: item.quantity, name: item.product_name }))),
      }));
      const purchaseCents = purchaseRows.filter((purchase) => purchase.fromDrawer).reduce((sum, purchase) => sum + purchase.cents, 0);
      const composedCents = session.opening_cents + cashSalesCents + inCents - outCents - purchaseCents;
      const open = session.closed_at == null;
      const expectedCents = !open && session.expected_cents != null ? session.expected_cents : composedCents;
      return {
        id: session.id,
        open,
        openedAt: session.opened_at,
        closedAt: session.closed_at,
        openedBy: personName(names, session.opened_by),
        closedBy: personName(names, session.closed_by),
        openingNote: session.opening_note,
        closingNote: session.closing_note,
        openingCents: session.opening_cents,
        cashSalesCents,
        cashMethods: methodRows.filter((method) => method.kind === "recebimento" && method.counts_as_cash).map((method) => method.name).join(", "),
        inCents,
        outCents,
        purchaseCents,
        composedCents,
        expectedCents,
        countedCents: session.counted_cents,
        differenceCents: open ? null : session.difference_cents,
        mismatch: !open && session.expected_cents != null && session.expected_cents !== composedCents,
        billedCents: bucket.sales.reduce((sum, sale) => sum + sale.total_cents, 0),
        saleCount: bucket.sales.length,
        units,
        revenue,
        sellers: [...sellers.entries()]
          .map(([name, row]) => ({ name, cents: row.cents, count: row.count }))
          .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name, "pt")),
        products: [...products.values()].sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name, "pt")),
        movements: bucket.movements.map((movement) => ({
          id: movement.id,
          at: movement.created_at,
          kind: movement.kind,
          cents: movement.amount_cents,
          note: movement.note,
          actor: personName(names, movement.created_by) || "Usuário não identificado",
        })),
        purchases: purchaseRows,
        sales: saleRows,
      } satisfies CashClosing;
  });
  return { ...listed, session: session ?? null };
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
    supabase.from("profiles").select("id, full_name, username, email, role, menus, created_at").order("full_name"),
    supabase.from("seller_passwords").select("user_id, password"),
  ]);
  const passwords = new Map(
    ((secrets ?? []) as { user_id: string; password: string }[]).map((item) => [item.user_id, item.password]),
  );
  return ((data ?? []) as { id: string; full_name: string; username: string | null; email: string | null; role: Role; menus: unknown; created_at: string }[]).map(
    (member) => ({ ...member, menus: normalizeMenus(member.menus), password: passwords.get(member.id) ?? null }),
  );
}

export async function listCategories() {
  const { supabase } = await requireUser();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, active, category_fields(key, label, field_type, unit, options, required, sort_order)")
    .order("sort_order");
  if (error || !Array.isArray(data)) return [];
  return data.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    active: category.active !== false,
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
    .select("id, total_cents, payment_method, seller_name, created_at, sale_items(product_name, quantity), sale_payments(payment_method, amount_cents)")
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
      .select("id, total_cents, payment_method, seller_name, created_at")
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
    sales: (sales.data ?? []) as { id: string; total_cents: number; payment_method: string; seller_name: string; created_at: string }[],
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
  const { supabase } = await requireUser();
  const empty = { open: null as null, expectedCents: 0, recent: [] as CashSession[] };
  if (!supabase) return empty;
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

type SessionSale = {
  total_cents: number;
  payment_method: string;
  sale_payments: { payment_method: string; amount_cents: number }[] | null;
};

async function sessionSales(
  supabase: NonNullable<Awaited<ReturnType<typeof requireUser>>["supabase"]>,
  openedAt: string,
  closedAt: string,
) {
  const sales: SessionSale[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("sales")
      .select("total_cents, payment_method, sale_payments(payment_method, amount_cents)")
      .gte("created_at", openedAt)
      .lt("created_at", closedAt)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error || !data) break;
    sales.push(...(data as SessionSale[]));
    if (data.length < pageSize) break;
  }
  return sales;
}

export async function cashClosingSlip(sessionId: string) {
  const { supabase, name, shopName } = await requireUser();
  if (!supabase) return null;
  const { data: session } = await supabase
    .from("cash_sessions")
    .select("id, opened_at, opening_cents, opening_note, closed_at, counted_cents, expected_cents, difference_cents, closing_note")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session?.closed_at || session.counted_cents == null || session.expected_cents == null || session.difference_cents == null) return null;

  const [{ data: methods }, sales, { data: movements }] = await Promise.all([
    supabase.from("payment_methods").select("id, name, kind, counts_as_cash, sort_order"),
    sessionSales(supabase, session.opened_at, session.closed_at),
    supabase
      .from("cash_movements")
      .select("kind, amount_cents")
      .gte("created_at", session.opened_at)
      .lt("created_at", session.closed_at),
  ]);
  const methodRows = (methods ?? []) as { id: string; name: string; kind: string; counts_as_cash: boolean; sort_order: number }[];
  const cashMethods = new Set(
    methodRows.filter((method) => method.kind === "recebimento" && method.counts_as_cash).map((method) => method.id),
  );
  const payments = sales.flatMap((sale) => {
    const parts = sale.sale_payments?.length
      ? sale.sale_payments
      : [{ payment_method: sale.payment_method, amount_cents: sale.total_cents }];
    return parts.map((payment) => ({ method: payment.payment_method, cents: payment.amount_cents }));
  });
  const revenue = slipRevenue(
    methodRows.map((method) => ({ id: method.id, name: method.name, kind: method.kind, sortOrder: method.sort_order })),
    payments,
  );
  const salesCents = payments.reduce((sum, payment) => sum + (cashMethods.has(payment.method) ? payment.cents : 0), 0);
  const moved = ((movements ?? []) as { kind: "entrada" | "retirada"; amount_cents: number }[]).reduce(
    (sum, movement) => {
      if (movement.kind === "entrada") sum.inCents += movement.amount_cents;
      else sum.outCents += movement.amount_cents;
      return sum;
    },
    { inCents: 0, outCents: 0 },
  );
  const purchaseCents = session.opening_cents + salesCents + moved.inCents - moved.outCents - session.expected_cents;

  return {
    shopName: shopName || "Loja",
    id: session.id as string,
    openedAt: session.opened_at as string,
    closedAt: session.closed_at as string,
    operator: name || "Responsável",
    openingCents: session.opening_cents as number,
    openingNote: (session.opening_note as string | null) ?? null,
    revenue: revenue.lines,
    billedCents: revenue.billedCents,
    salesCents,
    inCents: moved.inCents,
    outCents: moved.outCents,
    purchaseCents: Math.max(0, purchaseCents),
    expectedCents: session.expected_cents as number,
    countedCents: session.counted_cents as number,
    differenceCents: session.difference_cents as number,
    closingNote: (session.closing_note as string | null) ?? null,
  } satisfies CashSlip;
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
    .select("id, name, stock_quantity, avg_cost_cents, cost_price_cents, active, is_combo")
    .order("name");
  if (error) return { products: [], lots: [], movements: [], ready: false };
  const [{ data: lots }, { data: movements }, { data: parts }] = await Promise.all([
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
    supabase.from("product_components").select("combo_id, product_id, quantity"),
  ]);
  const rows = (products ?? []) as (StockProduct & { is_combo?: boolean })[];
  const stock = new Map(rows.map((product) => [product.id, product.stock_quantity]));
  const pieces = (parts ?? []) as { combo_id: string; product_id: string; quantity: number }[];
  return {
    ready: true,
    products: rows.map((product) => {
      const item = {
        id: product.id,
        name: product.name,
        stock_quantity: product.stock_quantity,
        avg_cost_cents: product.avg_cost_cents,
        cost_price_cents: product.cost_price_cents,
        active: product.active,
      };
      if (!product.is_combo) return item;
      const components = pieces.filter((part) => part.combo_id === product.id);
      const available = components.length
        ? Math.min(...components.map((part) => Math.floor((stock.get(part.product_id) ?? 0) / part.quantity)))
        : 0;
      return { ...item, stock_quantity: available };
    }),
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

type ProfitSale = {
  id: string;
  total_cents: number;
  created_at: string;
  sale_items: { product_id: string | null; product_name: string; quantity: number; total_cents: number }[] | null;
};

type CostProduct = {
  id: string;
  name: string;
  avg_cost_cents: number | null;
  cost_price_cents: number | null;
  is_combo: boolean | null;
};

function recordedCost(product: CostProduct | undefined) {
  if (!product) return 0;
  if ((product.avg_cost_cents ?? 0) > 0) return product.avg_cost_cents ?? 0;
  return product.cost_price_cents ?? 0;
}

export async function accumulatedProfit() {
  const { supabase, role, menus } = await requireUser();
  const empty = {
    revenue: 0,
    cost: 0,
    profit: 0,
    sales: 0,
    units: 0,
    missing: 0,
    months: [] as { key: string; revenue: number; cost: number; profit: number; accumulated: number }[],
    products: [] as { name: string; quantity: number; revenue: number; cost: number; profit: number }[],
  };
  if (!supabase || !canUseMenu(role, menus, "relatorios")) return empty;

  const [{ data: productRows }, { data: partRows }, sales] = await Promise.all([
    supabase.from("products").select("id, name, avg_cost_cents, cost_price_cents, is_combo"),
    supabase.from("product_components").select("combo_id, product_id, quantity"),
    rowsInWindow<ProfitSale>((start, end) =>
      supabase
        .from("sales")
        .select("id, total_cents, created_at, sale_items(product_id, product_name, quantity, total_cents)")
        .order("created_at", { ascending: true })
        .range(start, end),
    ),
  ]);

  const catalog = (productRows ?? []) as CostProduct[];
  const byId = new Map(catalog.map((product) => [product.id, product]));
  const byName = new Map(catalog.map((product) => [product.name, product]));
  const parts = (partRows ?? []) as { combo_id: string; product_id: string; quantity: number }[];
  const comboCost = new Map<string, number>();
  for (const product of catalog) {
    if (!product.is_combo) continue;
    const cost = parts
      .filter((part) => part.combo_id === product.id)
      .reduce((sum, part) => sum + recordedCost(byId.get(part.product_id)) * part.quantity, 0);
    if (cost > 0) comboCost.set(product.id, cost);
  }

  const unitCost = (productId: string | null, name: string) => {
    const product = (productId && byId.get(productId)) || byName.get(name);
    if (!product) return 0;
    if (product.is_combo && comboCost.has(product.id)) return comboCost.get(product.id) ?? 0;
    return recordedCost(product);
  };

  const months = new Map<string, { revenue: number; cost: number; profit: number }>();
  const byProduct = new Map<string, { name: string; quantity: number; revenue: number; cost: number; profit: number }>();
  let revenue = 0;
  let cost = 0;
  let units = 0;
  let missing = 0;

  for (const sale of sales) {
    revenue += sale.total_cents;
    let saleCost = 0;
    for (const item of sale.sale_items ?? []) {
      const unit = unitCost(item.product_id, item.product_name);
      const lineCost = unit * item.quantity;
      if (unit === 0) missing += item.quantity;
      saleCost += lineCost;
      units += item.quantity;
      const row = byProduct.get(item.product_name) ?? { name: item.product_name, quantity: 0, revenue: 0, cost: 0, profit: 0 };
      row.quantity += item.quantity;
      row.revenue += item.total_cents;
      row.cost += lineCost;
      row.profit = row.revenue - row.cost;
      byProduct.set(item.product_name, row);
    }
    cost += saleCost;
    const key = bucketKey(sale.created_at, "month");
    const month = months.get(key) ?? { revenue: 0, cost: 0, profit: 0 };
    month.revenue += sale.total_cents;
    month.cost += saleCost;
    month.profit = month.revenue - month.cost;
    months.set(key, month);
  }

  let accumulated = 0;
  const monthRows = [...months.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, row]) => {
      accumulated += row.profit;
      return { key, ...row, accumulated };
    });

  return {
    revenue,
    cost,
    profit: revenue - cost,
    sales: sales.length,
    units,
    missing,
    months: monthRows,
    products: [...byProduct.values()].sort((a, b) => b.profit - a.profit || a.name.localeCompare(b.name, "pt")),
  };
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
