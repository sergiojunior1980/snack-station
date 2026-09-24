"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { paymentMethods } from "@/lib/catalog";
import { parseBRLToCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; ok?: string } | null;

async function db() {
  const supabase = await createClient();
  if (!supabase) throw new Error("Configure o Supabase no arquivo .env.local");
  return supabase;
}

async function appOrigin() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "127.0.0.1:43181";
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function message(error: { message: string }) {
  const text = error.message;
  if (text.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (text.includes("already registered") || text.includes("already been registered")) {
    return "Este e-mail já tem conta.";
  }
  if (text.includes("Estoque insuficiente")) return "Estoque insuficiente para um ou mais produtos.";
  if (text.includes("Password should be")) return "A senha precisa ter pelo menos 6 caracteres.";
  return text;
}

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const parsed = z.object({ email: z.email(), password: z.string().min(6) }).safeParse({ email, password });
  if (!parsed.success) return { error: "Informe um e-mail válido e uma senha com 6 caracteres ou mais." };

  const supabase = await db();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      await supabase.auth.resend({
        type: "signup",
        email: parsed.data.email,
        options: { emailRedirectTo: `${await appOrigin()}/login` },
      });
      return {
        error:
          "Seu e-mail ainda não foi confirmado. Enviei outro link: abra a mensagem neste computador e clique em confirmar.",
      };
    }
    return { error: message(error) };
  }
  redirect("/");
}

export async function register(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Informe seu nome."),
      email: z.email("Informe um e-mail válido."),
      password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres."),
    })
    .safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await db();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.name },
      emailRedirectTo: `${await appOrigin()}/login`,
    },
  });
  if (error) return { error: message(error) };
  if (!data.session) {
    return {
      ok: "Conta criada. Confirme o e-mail para entrar — ou desative a confirmação no Supabase para entrar na hora.",
    };
  }
  redirect("/");
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
    minStock: formData.get("minStock"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const price = parseBRLToCents(parsed.data.price);
  const stock = Number(formData.get("stock") ?? 0);
  if (price == null) return { error: "Preço inválido. Use 3,50 por exemplo." };
  if (!Number.isInteger(stock) || stock < 0) return { error: "Estoque inicial inválido." };

  const supabase = await db();
  const details = await readAttributes(supabase, parsed.data.category, formData);
  if ("error" in details && details.error) return { error: details.error };
  const { error } = await supabase.from("products").insert({
    name: parsed.data.name,
    category: parsed.data.category,
    attributes: details.attributes ?? {},
    sale_price_cents: price,
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
    minStock: formData.get("minStock"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const price = parseBRLToCents(parsed.data.price);
  if (price == null) return { error: "Preço inválido." };

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
  const { error } = await supabase.rpc("register_purchase", {
    p_supplier: String(formData.get("supplier") ?? ""),
    p_note: String(formData.get("note") ?? ""),
    p_items: items,
  });
  if (error) return { error: message(error) };
  revalidatePath("/compras");
  revalidatePath("/produtos");
  revalidatePath("/");
  return { ok: "Compra lançada e estoque somado." };
}
