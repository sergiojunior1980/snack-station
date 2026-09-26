"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { homeFor, normalizeMenus, sellerMenus, type MenuId } from "@/lib/roles";
import { loginToEmail, normalizeUsername } from "@/lib/username";
import { parseBRLToCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { costMode, stockUnitCost } from "@/server/queries";

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
  if (text.includes("Abra o caixa")) return "Abra o caixa antes de registrar a venda.";
  if (text.includes("soma dos pagamentos")) return "A soma dos pagamentos precisa ser igual ao total da venda.";
  if (text.includes("Já existe um caixa aberto")) return "Já existe um caixa aberto.";
  if (text.includes("Não há caixa aberto")) return "Não há caixa aberto.";
  if (text.includes("Informe a observação")) return "Informe a observação do movimento.";
  if (text.includes("validade")) return "A validade não pode ser anterior à entrada.";
  if (text.includes("Could not find the function") || text.includes("schema cache")) {
    return "Rode o SQL 006_cash_and_stock.sql no Supabase para liberar caixa e estoque.";
  }
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
  const { data: profile } = await supabase.from("profiles").select("role, menus").eq("id", sessionData.user.id).maybeSingle();
  const role = profile?.role === "admin" ? "admin" : "vendedor";
  redirect(homeFor(role, normalizeMenus(profile?.menus)));
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

function parseComboParts(formData: FormData): { lines: { product_id: string; quantity: number }[] } | { error: string } {
  if (formData.get("combo") !== "on") return { lines: [] };
  let parts: { product_id: string; quantity: number }[] = [];
  try {
    parts = JSON.parse(String(formData.get("parts") ?? "[]"));
  } catch {
    return { error: "Monte o combo com produtos já cadastrados." };
  }
  const lines = parts.filter((part) => part.product_id && Number.isInteger(part.quantity) && part.quantity > 0);
  if (new Set(lines.map((part) => part.product_id)).size < 2) {
    return { error: "O combo precisa de mais de um produto já cadastrado." };
  }
  return { lines };
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
  if (price == null) return { error: "Preço de venda inválido. Use 3,50 por exemplo." };
  const combo = formData.get("combo") === "on";
  const parts = parseComboParts(formData);
  if (combo && "error" in parts) return { error: parts.error };

  const supabase = await db();
  const details = await readAttributes(supabase, parsed.data.category, formData);
  if ("error" in details && details.error) return { error: details.error };
  const comboCost = combo && "lines" in parts ? await comboCostCents(supabase, parts.lines) : 0;
  const { data: created, error } = await supabase.from("products").insert({
    name: parsed.data.name,
    category: parsed.data.category,
    attributes: details.attributes ?? {},
    sale_price_cents: price,
    cost_price_cents: comboCost,
    avg_cost_cents: comboCost,
    stock_quantity: 0,
    min_stock: combo ? 0 : parsed.data.minStock,
    is_combo: combo,
    active: true,
  }).select("id").single();
  if (error || !created) return { error: error ? message(error) : "Não foi possível cadastrar." };
  if (combo && "lines" in parts) {
    const { error: partError } = await supabase.from("product_components").insert(
      parts.lines.map((part) => ({ combo_id: created.id, product_id: part.product_id, quantity: part.quantity })),
    );
    if (partError) return { error: message(partError) };
  }
  await supabase.rpc("append_tape", {
    p_module: "cadastro_produtos",
    p_summary: combo ? `Combo criado: ${parsed.data.name}` : `Produto criado: ${parsed.data.name}`,
  });
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
  if (price == null) return { error: "Preço de venda inválido." };
  const combo = formData.get("combo") === "on";
  const parts = parseComboParts(formData);
  if (combo && "error" in parts) return { error: parts.error };

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
      ...(combo && "lines" in parts ? { cost_price_cents: await comboCostCents(supabase, parts.lines) } : {}),
      min_stock: combo ? 0 : parsed.data.minStock,
      active: formData.get("active") === "on",
      is_combo: combo,
    })
    .eq("id", id);
  if (error) return { error: message(error) };
  if (combo && "lines" in parts) {
    await supabase.from("product_components").delete().eq("combo_id", id);
    const { error: partError } = await supabase.from("product_components").insert(
      parts.lines.map((part) => ({ combo_id: id, product_id: part.product_id, quantity: part.quantity })),
    );
    if (partError) return { error: message(partError) };
  } else {
    await supabase.from("product_components").delete().eq("combo_id", id);
  }
  await supabase.rpc("append_tape", {
    p_module: "cadastro_produtos",
    p_summary: `Produto atualizado: ${parsed.data.name}`,
  });
  revalidatePath("/produtos");
  revalidatePath("/vendas");
  return { ok: "Produto atualizado." };
}

export async function deleteProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const supabase = await db();
  const { data: product } = await supabase.from("products").select("name").eq("id", id).maybeSingle();
  if (!product) return { error: "Produto não encontrado." };

  const { count } = await supabase.from("product_components").select("combo_id", { count: "exact", head: true }).eq("product_id", id);
  if (count) return { error: "Este produto entra num combo. Tire ele do combo antes de excluir." };

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") return { error: "Este produto já entrou em venda ou compra. Não dá para excluir." };
    return { error: message(error) };
  }
  await supabase.rpc("append_tape", { p_module: "cadastro_produtos", p_summary: `Produto excluído: ${product.name}` });
  revalidatePath("/produtos");
  revalidatePath("/vendas");
  revalidatePath("/compras");
  return { ok: "Produto excluído." };
}

async function comboCostCents(
  supabase: Awaited<ReturnType<typeof db>>,
  lines: { product_id: string; quantity: number }[],
) {
  const mode = await costMode();
  const { data: lots } = await supabase
    .from("stock_lots")
    .select("product_id, quantity_remaining, unit_cost_cents")
    .in("product_id", lines.map((line) => line.product_id))
    .gt("quantity_remaining", 0);
  const byProduct = new Map<string, { quantity_remaining: number; unit_cost_cents: number }[]>();
  for (const lot of lots ?? []) {
    const list = byProduct.get(lot.product_id) ?? [];
    list.push(lot);
    byProduct.set(lot.product_id, list);
  }
  return lines.reduce((sum, line) => sum + stockUnitCost(byProduct.get(line.product_id) ?? [], mode) * line.quantity, 0);
}

export async function saveCostMode(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const mode = formData.get("mode") === "maior" ? "maior" : "media";
  const supabase = await db();
  const { error } = await supabase.from("app_settings").upsert({ key: "stock_cost_mode", value: mode });
  if (error) return { error: message(error) };
  revalidatePath("/produtos");
  return { ok: mode === "maior" ? "Custo pelo maior valor em estoque." : "Custo pela média do estoque." };
}

export async function registerSale(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let items: { product_id: string; quantity: number }[] = [];
  let payments: { method: string; amount_cents: number }[] = [];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
    payments = JSON.parse(String(formData.get("payments") ?? "[]"));
  } catch {
    return { error: "Carrinho inválido." };
  }
  if (!items.length) return { error: "Adicione pelo menos um produto." };
  if (!payments.length || payments.some((item) => !item.method || item.amount_cents <= 0)) {
    return { error: "Informe as formas de recebimento." };
  }

  const supabase = await db();
  const { error } = await supabase.rpc("register_sale", {
    p_payment_method: payments[0]?.method ?? "pix",
    p_note: String(formData.get("note") ?? ""),
    p_items: items,
    p_payments: payments,
  });
  if (error) return { error: message(error) };
  revalidatePath("/vendas");
  revalidatePath("/produtos");
  revalidatePath("/relatorios");
  revalidatePath("/financeiro");
  revalidatePath("/");
  return { ok: "Venda registrada e estoque atualizado." };
}

export async function cancelSale(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Venda não encontrada." };
  const supabase = await db();
  const { error } = await supabase.rpc("cancel_sale", { p_sale_id: id });
  if (error) return { error: message(error) };
  revalidatePath("/vendas");
  revalidatePath("/produtos");
  revalidatePath("/relatorios");
  revalidatePath("/financeiro");
  revalidatePath("/estoque");
  revalidatePath("/");
  return { ok: "Venda cancelada e estoque devolvido." };
}

export async function registerPurchase(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let items: { product_id: string; quantity: number; unit_cost_cents: number; barcode?: string; expires_on?: string }[] = [];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Lista de compra inválida." };
  }
  const purchasedOn = String(formData.get("purchasedOn") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchasedOn)) return { error: "Informe a data da compra." };
  if (!String(formData.get("supplier") ?? "").trim()) return { error: "Informe o fornecedor." };
  if (!items.length || items.some((item) => !item.expires_on)) return { error: "Cada item precisa de descrição, quantidade, valor e validade." };

  const supabase = await db();
  const { data: auth } = await supabase.auth.getUser();
  const { data: roleRow } = auth.user
    ? await supabase.from("profiles").select("role, menus").eq("id", auth.user.id).maybeSingle()
    : { data: null };
  const sellerMenus = normalizeMenus(roleRow?.menus);
  if (roleRow?.role !== "admin" && !sellerMenus.includes("estoque")) return { error: "Este perfil não lança compras." };

  const invoice = formData.get("invoice");
  let invoicePath: string | null = null;
  if (invoice instanceof File && invoice.size > 0) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(invoice.type)) return { error: "A nota precisa ser uma imagem JPG, PNG ou WebP." };
    if (invoice.size > 5_242_880) return { error: "A imagem da nota passa de 5 MB." };
    const ext = invoice.type === "image/png" ? "png" : invoice.type === "image/webp" ? "webp" : "jpg";
    invoicePath = `${auth.user?.id ?? "nota"}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("notas").upload(invoicePath, invoice, { contentType: invoice.type });
    if (uploadError) return { error: message(uploadError) };
  }

  const { error } = await supabase.rpc("register_purchase", {
    p_supplier: String(formData.get("supplier") ?? ""),
    p_note: "",
    p_items: items,
    p_payment_method: String(formData.get("payment") ?? "dinheiro"),
    p_purchased_on: purchasedOn,
    p_invoice_path: invoicePath,
  });
  if (error) {
    if (invoicePath) await supabase.storage.from("notas").remove([invoicePath]);
    return { error: message(error) };
  }
  revalidatePath("/compras");
  revalidatePath("/financeiro");
  revalidatePath("/estoque");
  revalidatePath("/estoque");
  revalidatePath("/produtos");
  revalidatePath("/");
  return { ok: "Compra lançada e estoque somado." };
}

async function readPurchaseForm(formData: FormData) {
  let items: { product_id: string; quantity: number; unit_cost_cents: number; barcode?: string; expires_on?: string }[] = [];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Lista de compra inválida." } as const;
  }
  const purchasedOn = String(formData.get("purchasedOn") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchasedOn)) return { error: "Informe a data da compra." } as const;
  if (!String(formData.get("supplier") ?? "").trim()) return { error: "Informe o fornecedor." } as const;
  if (!items.length || items.some((item) => !item.expires_on)) {
    return { error: "Cada item precisa de descrição, quantidade, valor e validade." } as const;
  }
  return { items, purchasedOn } as const;
}

async function storeInvoice(formData: FormData, userId: string | undefined) {
  const invoice = formData.get("invoice");
  if (!(invoice instanceof File) || invoice.size === 0) return { path: null as string | null };
  if (!["image/jpeg", "image/png", "image/webp"].includes(invoice.type)) return { error: "A nota precisa ser uma imagem JPG, PNG ou WebP." };
  if (invoice.size > 5_242_880) return { error: "A imagem da nota passa de 5 MB." };
  const ext = invoice.type === "image/png" ? "png" : invoice.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId ?? "nota"}/${crypto.randomUUID()}.${ext}`;
  return { path, file: invoice };
}

export async function updatePurchase(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const parsed = await readPurchaseForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const supabase = await db();
  const { data: auth } = await supabase.auth.getUser();
  const stored = await storeInvoice(formData, auth.user?.id);
  if ("error" in stored && stored.error) return { error: stored.error };
  let invoicePath: string | null = null;
  if (stored.path && stored.file) {
    const { error: uploadError } = await supabase.storage.from("notas").upload(stored.path, stored.file, { contentType: stored.file.type });
    if (uploadError) return { error: message(uploadError) };
    invoicePath = stored.path;
  }
  const { error } = await supabase.rpc("update_purchase", {
    p_purchase_id: id,
    p_supplier: String(formData.get("supplier") ?? ""),
    p_note: "",
    p_items: parsed.items,
    p_payment_method: String(formData.get("payment") ?? "dinheiro"),
    p_purchased_on: parsed.purchasedOn,
    p_invoice_path: invoicePath,
  });
  if (error) {
    if (invoicePath) await supabase.storage.from("notas").remove([invoicePath]);
    return { error: message(error) };
  }
  revalidatePath("/compras");
  revalidatePath("/financeiro");
  revalidatePath("/estoque");
  revalidatePath("/produtos");
  revalidatePath("/");
  return { ok: "Compra atualizada." };
}

export async function deletePurchase(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await db();
  const { error } = await supabase.rpc("delete_purchase", { p_purchase_id: String(formData.get("id") ?? "") });
  if (error) return { error: message(error) };
  revalidatePath("/compras");
  revalidatePath("/financeiro");
  revalidatePath("/estoque");
  revalidatePath("/produtos");
  revalidatePath("/");
  return { ok: "Compra excluída." };
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

function selectedMenus(formData: FormData) {
  const allowed = new Set<string>(sellerMenus.map((menu) => menu.id));
  return formData.getAll("menus").map(String).filter((item): item is MenuId => allowed.has(item));
}

export async function setSellerMenus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = String(formData.get("userId") ?? "");
  const menus = selectedMenus(formData);
  if (!menus.length) return { error: "Escolha pelo menos um menu." };
  const supabase = await db();
  const { error } = await supabase.rpc("set_seller_menus", { p_user_id: userId, p_menus: menus });
  if (error) return { error: message(error) };
  revalidatePath("/equipe");
  return { ok: "Menus do vendedor atualizados." };
}

export async function deleteTeamMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Usuário não encontrado." };
  const supabase = await db();
  const { error } = await supabase.rpc("delete_team_member", { p_user_id: userId });
  if (error) return { error: message(error) };
  revalidatePath("/equipe");
  return { ok: "Usuário excluído." };
}

export async function resetSellerPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 6) return { error: "A senha precisa ter pelo menos 6 caracteres." };
  const supabase = await db();
  const { error } = await supabase.rpc("reset_seller_password", { p_user_id: userId, p_password: password });
  if (error) return { error: message(error) };
  revalidatePath("/equipe");
  return { ok: "Senha redefinida." };
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
  const menus = selectedMenus(formData);
  if (!menus.length) return { error: "Escolha pelo menos um menu." };

  const username = normalizeUsername(parsed.data.username);
  const supabase = await db();
  const { error } = await supabase.rpc("create_seller", {
    p_name: parsed.data.name,
    p_username: username,
    p_password: parsed.data.password,
    p_menus: menus,
  });
  if (error) return { error: message(error) };

  revalidatePath("/equipe");
  return { ok: `Vendedor ${username} criado. Ele já pode entrar com esse usuário e senha.` };
}

function revalidateCash() {
  revalidatePath("/financeiro");
  revalidatePath("/estoque");
  revalidatePath("/produtos");
  revalidatePath("/");
}

export async function openCashSession(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const amount = parseBRLToCents(String(formData.get("amount") ?? "0"));
  if (amount == null) return { error: "Valor de abertura inválido." };
  const supabase = await db();
  const { error } = await supabase.rpc("open_cash_session", {
    p_opening_cents: amount,
    p_note: String(formData.get("note") ?? ""),
  });
  if (error) return { error: message(error) };
  revalidateCash();
  return { ok: "Caixa aberto." };
}

export async function closeCashSession(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const amount = parseBRLToCents(String(formData.get("amount") ?? ""));
  if (amount == null) return { error: "Informe o valor contado no caixa." };
  const supabase = await db();
  const { error } = await supabase.rpc("close_cash_session", {
    p_counted_cents: amount,
    p_note: String(formData.get("note") ?? ""),
  });
  if (error) return { error: message(error) };
  revalidateCash();
  return { ok: "Caixa fechado." };
}

export async function registerCashMovement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const kind = String(formData.get("kind") ?? "");
  const amount = parseBRLToCents(String(formData.get("amount") ?? ""));
  const note = String(formData.get("note") ?? "").trim();
  if (kind !== "entrada" && kind !== "retirada") return { error: "Escolha entrada ou retirada." };
  if (amount == null || amount <= 0) return { error: "Informe um valor maior que zero." };
  if (note.length < 3) return { error: "A observação precisa explicar o movimento." };
  const supabase = await db();
  const { error } = await supabase.rpc("register_cash_movement", {
    p_kind: kind,
    p_amount_cents: amount,
    p_note: note,
  });
  if (error) return { error: message(error) };
  revalidateCash();
  return { ok: kind === "entrada" ? "Entrada lançada." : "Retirada lançada." };
}

export async function registerStockMove(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const direction = String(formData.get("direction") ?? "");
  const quantity = Number(formData.get("quantity"));
  const cost = parseBRLToCents(String(formData.get("cost") ?? ""));
  const receivedOn = String(formData.get("receivedOn") ?? "");
  const expiresOn = String(formData.get("expiresOn") ?? "");
  if (direction !== "entrada" && direction !== "saida") return { error: "Escolha entrada ou saída." };
  if (!Number.isInteger(quantity) || quantity <= 0) return { error: "Quantidade inválida." };
  if (direction === "entrada" && cost == null) return { error: "Informe o custo unitário da entrada." };
  const supabase = await db();
  const { error } = await supabase.rpc("register_stock_move", {
    p_product_id: String(formData.get("productId") ?? ""),
    p_direction: direction,
    p_quantity: quantity,
    p_unit_cost_cents: direction === "entrada" ? cost : 0,
    p_received_on: receivedOn || null,
    p_expires_on: expiresOn || null,
    p_supplier: String(formData.get("supplier") ?? ""),
    p_reason: String(formData.get("reason") ?? ""),
    p_note: String(formData.get("note") ?? ""),
  });
  if (error) return { error: message(error) };
  revalidateCash();
  revalidatePath("/compras");
  return { ok: direction === "entrada" ? "Entrada lançada e custo médio atualizado." : "Saída lançada." };
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export async function saveCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Informe o nome da categoria." };
  const supabase = await db();
  const liquid = formData.get("liquid") === "on";
  if (id) {
    const { error } = await supabase.from("categories").update({ name }).eq("id", id);
    if (error) return { error: message(error) };
    if (liquid) {
      await supabase.from("category_fields").upsert(
        { category_id: id, key: "volume_ml", label: "Tamanho", field_type: "number", unit: "ml", required: true, sort_order: 1 },
        { onConflict: "category_id,key" },
      );
    } else {
      await supabase.from("category_fields").delete().eq("category_id", id).eq("key", "volume_ml");
    }
    await supabase.rpc("append_tape", { p_module: "compras_estoque", p_summary: `Categoria editada: ${name}` });
  } else {
    const slug = slugify(name);
    if (!slug) return { error: "Use um nome com letras." };
    const { data, error } = await supabase.from("categories").insert({ name, slug }).select("id").single();
    if (error || !data) return { error: error ? message(error) : "Não foi possível criar a categoria." };
    if (liquid) {
      await supabase.from("category_fields").insert({
        category_id: data.id,
        key: "volume_ml",
        label: "Tamanho",
        field_type: "number",
        unit: "ml",
        required: true,
        sort_order: 1,
      });
    }
    await supabase.rpc("append_tape", { p_module: "compras_estoque", p_summary: `Categoria criada: ${name}` });
  }
  revalidatePath("/produtos");
  revalidatePath("/categorias");
  revalidatePath("/vendas");
  return { ok: id ? "Categoria atualizada." : "Categoria criada." };
}

export async function deleteCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Categoria inválida." };
  const supabase = await db();
  const { data: category } = await supabase.from("categories").select("id, name, slug").eq("id", id).maybeSingle();
  if (!category) return { error: "Categoria não encontrada." };
  const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("category", category.slug);
  if (count) return { error: "Esta categoria está em produtos. Mude esses produtos antes de tirar." };
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { error: message(error) };
  await supabase.rpc("append_tape", { p_module: "compras_estoque", p_summary: `Categoria removida: ${category.name}` });
  revalidatePath("/produtos");
  revalidatePath("/categorias");
  revalidatePath("/vendas");
  return { ok: "Categoria removida." };
}

export async function saveCombo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const price = parseBRLToCents(String(formData.get("price") ?? ""));
  let parts: { product_id: string; quantity: number }[] = [];
  try {
    parts = JSON.parse(String(formData.get("parts") ?? "[]"));
  } catch {
    return { error: "Monte o combo com os produtos." };
  }
  const lines = parts.filter((part) => part.product_id && part.quantity > 0);
  if (name.length < 2) return { error: "Informe o nome do combo." };
  if (price == null) return { error: "Informe o preço do combo." };
  if (new Set(lines.map((part) => part.product_id)).size < 2) return { error: "O combo precisa de pelo menos 2 produtos." };

  const supabase = await db();
  const { data, error } = await supabase
    .from("products")
    .insert({
      name,
      category: "outro",
      sale_price_cents: price,
      cost_price_cents: 0,
      stock_quantity: 0,
      min_stock: 0,
      is_combo: true,
      attributes: {},
    })
    .select("id")
    .single();
  if (error || !data) return { error: error ? message(error) : "Não foi possível criar o combo." };
  const { error: partError } = await supabase.from("product_components").insert(
    lines.map((part) => ({ combo_id: data.id, product_id: part.product_id, quantity: part.quantity })),
  );
  if (partError) return { error: message(partError) };
  await supabase.rpc("append_tape", { p_module: "compras_estoque", p_summary: `Combo criado: ${name}` });
  revalidatePath("/produtos");
  revalidatePath("/vendas");
  return { ok: "Combo criado." };
}

export async function savePaymentMethod(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const kind = String(formData.get("kind") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const id = slugify(String(formData.get("id") ?? name));
  if (kind !== "recebimento" && kind !== "pagamento") return { error: "Escolha recebimento ou pagamento." };
  if (name.length < 2 || !id) return { error: "Informe o nome da forma." };
  const supabase = await db();
  const { error } = await supabase.from("payment_methods").upsert(
    {
      id,
      name,
      kind,
      counts_as_cash: kind === "recebimento" && formData.get("counts_as_cash") === "on",
      settles_balance: kind === "pagamento" && formData.get("settles_balance") === "on",
      active: formData.get("active") !== "off",
    },
    { onConflict: "kind,id" },
  );
  if (error) return { error: message(error) };
  await supabase.rpc("append_tape", { p_module: "caixa_vendas", p_summary: `Forma de ${kind} salva: ${name}` });
  revalidatePath("/financeiro/formas");
  revalidatePath("/vendas");
  revalidatePath("/compras");
  return { ok: "Forma salva." };
}
