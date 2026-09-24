import { createClient } from "@/lib/supabase/server";
import type { ReportGrain } from "@/lib/dates";

export type Product = {
  id: string;
  name: string;
  category: string;
  attributes: Record<string, string>;
  sale_price_cents: number;
  stock_quantity: number;
  min_stock: number;
  active: boolean;
};

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

export async function requireUser() {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, user: null, name: "" };
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { supabase, user: null, name: "" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", data.user.id)
    .maybeSingle();
  return {
    supabase,
    user: data.user,
    name: profile?.full_name || data.user.email || "Equipe",
  };
}

export async function listProducts() {
  const { supabase } = await requireUser();
  if (!supabase) return [];
  const { data } = await supabase
    .from("products")
    .select("id, name, category, attributes, sale_price_cents, stock_quantity, min_stock, active")
    .order("name");
  return ((data ?? []) as Product[]).map((product) => ({
    ...product,
    attributes: product.attributes ?? {},
  }));
}

export async function listCategories() {
  const { supabase } = await requireUser();
  if (!supabase) return [];
  const { data } = await supabase
    .from("categories")
    .select("id, name, slug, category_fields(key, label, field_type, unit, options, required, sort_order)")
    .order("sort_order");
  return ((data ?? []) as {
    id: string;
    name: string;
    slug: string;
    category_fields: CategoryField[];
  }[]).map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    fields: [...(category.category_fields ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }));
}

export async function recentSales(limit = 8) {
  const { supabase } = await requireUser();
  if (!supabase) return [];
  const { data } = await supabase
    .from("sales")
    .select("id, total_cents, payment_method, created_at, sale_items(product_name, quantity)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function recentPurchases(limit = 8) {
  const { supabase } = await requireUser();
  if (!supabase) return [];
  const { data } = await supabase
    .from("purchases")
    .select("id, total_cents, supplier, created_at, purchase_items(product_name, quantity)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

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
