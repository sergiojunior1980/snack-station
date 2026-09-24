"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { paymentMethods } from "@/lib/catalog";
import { homeFor } from "@/lib/roles";
import { loginToEmail, normalizeUsername } from "@/lib/username";
import { parseBRLToCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; ok?: string } | null;

async function db() {
  const supabase = await createClient();
  if (!supabase) throw new Error("Configure o Supabase no arquivo .env.local");
  return supabase;
}

function message(error: { message: string }) {
  const text = error.message;
  if (text.includes("Invalid login credentials")) return "Usuário ou senha incorretos.";
  if (text.includes("already registered") || text.includes("already been registered")) {
    return "Este usuário já existe.";
  }
  if (text.includes("Estoque insuficiente")) return "Estoque insuficiente para um ou mais produtos.";
  if (text.includes("Password should be")) return "A senha precisa ter pelo menos 6 caracteres.";
  return text;
}

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  if (normalizeUsername(username).length < 3 || password.length < 6) {
    return { error: "Informe o usuário e uma senha com 6 caracteres ou mais." };
  }

  const supabase = await db();
  const { data: sessionData, error } = await supabase.auth.signInWithPassword({
    email: loginToEmail(username),
    password,
  });
  if (error) return { error: message(error) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", sessionData.user.id).maybeSingle();
  redirect(homeFor(profile?.role === "admin" ? "admin" : "vendedor"));
}

export async function register(): Promise<ActionState> {
  return { error: "Só o administrador cria o usuário do vendedor." };
}

export async function logout() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}

const productSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome ao produto."),
  category: z.string().trim().min(1, "Escolha a categoria."),
  price: z.string().trim().min(1, "Informe o preço de venda."),
  cost: z.string().trim().min(1, "Informe o valor de compra."),
  minStock: z.coerce.number().int().min(0, "O estoque mínimo não pode ser negativo."),
});

async function readAttributes(supabase: Awaited<ReturnType<typeof db>>, slug: string, formData: FormData) {
  const brand = String(formData.get("brand") ?? "").trim();
  if (brand.length < 2) return { error: "Informe a marca." };

  const { data: category } = await supabase.from("categories").select("id").eq("slug", slug).maybeSingle();
  if (!category) return { error: "Escolha uma categoria." };

  const attributes: Record<string, string> = { marca: brand };
  if (slug === "refrigerante" || slug === "agua") {
    const raw = String(formData.get("attr_volume_ml") ?? "").trim();
    const amount = Number(raw.replace(",", "."));
    if (!raw || !Number.isFinite(amount) || amount <= 0) return { error: "Informe o tamanho da garrafa em ml." };
    attributes.volume_ml = String(amount);
  }
  return { attributes };
}

export async function createProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    price: formData.get("price"),
    cost: formData.get("cost"),
    minStock: formData.get("minStock"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const price = parseBRLToCents(parsed.data.price);
  const cost = parseBRLToCents(parsed.data.cost);
  const stock = Number(formData.get("stock") ?? 0);
  if (price == null) return { error: "Preço de venda inválido. Use 3,50 por exemplo." };
  if (cost == null) return { error: "Valor de compra inválido. Use 2,00 por exemplo." };
  if (!Number.isInteger(stock) || stock < 0) return { error: "Estoque inicial inválido." };

  const supabase = await db();
  const details = await readAttributes(supabase, parsed.data.category, formData);
  if ("error" in details && details.error) return { error: details.error };
  const { error } = await supabase.from("products").insert({
    name: parsed.data.name,
    category: parsed.data.category,
    attributes: details.attributes ?? {},
    sale_price_cents: price,
    cost_price_cents: cost,
    stock_quantity: stock,
    min_stock: parsed.data.minStock,
  });
  if (error) return { error: message(error) };
  revalidatePath("/produtos");
  revalidatePath("/");
  return { ok: "Produto cadastrado." };
}

export async function updateProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    price: formData.get("price"),
    cost: formData.get("cost"),
    minStock: formData.get("minStock"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const price = parseBRLToCents(parsed.data.price);
  const cost = parseBRLToCents(parsed.data.cost);
  if (price == null) return { error: "Preço de venda inválido." };
  if (cost == null) return { error: "Valor de compra inválido." };

  const supabase = await db();
  const details = await readAttributes(supabase, parsed.data.category, formData);
  if ("error" in details && details.error) return { error: details.error };
  const { error } = await supabase
    .from("products")
    .update({
      name: parsed.data.name,
      category: parsed.data.category,
      attributes: details.attributes ?? {},
      sale_price_cents: price,
      cost_price_cents: cost,
      min_stock: parsed.data.minStock,
      active: formData.get("active") === "on",
    })
    .eq("id", id);
  if (error) return { error: message(error) };
  revalidatePath("/produtos");
  revalidatePath("/vendas");
  return { ok: "Produto atualizado." };
}

export async function registerSale(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const payment = String(formData.get("payment") ?? "");
  if (!paymentMethods.some((item) => item.id === payment)) return { error: "Escolha a forma de pagamento." };

  let items: { product_id: string; quantity: number }[] = [];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Carrinho inválido." };
  }
  if (!items.length) return { error: "Adicione pelo menos um produto." };

  const supabase = await db();
  const { error } = await supabase.rpc("register_sale", {
    p_payment_method: payment,
    p_note: String(formData.get("note") ?? ""),
    p_items: items,
  });
  if (error) return { error: message(error) };
  revalidatePath("/vendas");
  revalidatePath("/produtos");
  revalidatePath("/relatorios");
  revalidatePath("/financeiro");
  revalidatePath("/");
  return { ok: "Venda registrada e estoque atualizado." };
}

export async function registerPurchase(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let items: { product_id: string; quantity: number; unit_cost_cents: number }[] = [];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Lista de compra inválida." };
  }
  if (!items.length) return { error: "Adicione pelo menos um produto." };

  const supabase = await db();
  const { data: auth } = await supabase.auth.getUser();
  const { data: roleRow } = auth.user
    ? await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle()
    : { data: null };
  if (roleRow?.role !== "admin") return { error: "Somente o administrador lança compras." };
  const { error } = await supabase.rpc("register_purchase", {
    p_supplier: String(formData.get("supplier") ?? ""),
    p_note: String(formData.get("note") ?? ""),
    p_items: items,
  });
  if (error) return { error: message(error) };
  revalidatePath("/compras");
  revalidatePath("/financeiro");
  revalidatePath("/produtos");
  revalidatePath("/");
  return { ok: "Compra lançada e estoque somado." };
}

export async function setUserRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (role !== "admin" && role !== "vendedor") return { error: "Perfil inválido." };
  const supabase = await db();
  const { error } = await supabase.rpc("set_user_role", { p_user_id: userId, p_role: role });
  if (error) return { error: message(error) };
  revalidatePath("/equipe");
  return { ok: "Perfil atualizado." };
}

export async function createTeamMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Informe o nome."),
      username: z
        .string()
        .trim()
        .min(3, "O usuário precisa ter pelo menos 3 letras.")
        .regex(/^[a-zA-Z0-9._-]+$/, "Use só letras e números no usuário."),
      password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres."),
    })
    .safeParse({
      name: formData.get("name"),
      username: formData.get("username"),
      password: formData.get("password"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const username = normalizeUsername(parsed.data.username);
  const supabase = await db();
  const { error } = await supabase.rpc("create_seller", {
    p_name: parsed.data.name,
    p_username: username,
    p_password: parsed.data.password,
  });
  if (error) return { error: message(error) };

  revalidatePath("/equipe");
  return { ok: `Vendedor ${username} criado. Ele já pode entrar com esse usuário e senha.` };
}
