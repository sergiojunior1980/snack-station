"use server";

import { revalidatePath } from "next/cache";
import { inclusiveRange } from "@/lib/dates";
import { companyFiscalGaps, buildNfceXml, nfceCode } from "@/lib/nfce-xml";
import { normalizeProductName, parseSupplierInvoice } from "@/lib/nfe-purchase";
import { zipStored } from "@/lib/zip-stored";
import { salesForXml } from "@/server/fiscal-data";
import { listProducts, requireUser } from "@/server/queries";

export type FiscalXmlState = {
  error?: string;
  ok?: string;
  notes?: string[];
  file?: { name: string; base64: string };
} | null;

export type ImportLine = {
  key: string;
  name: string;
  barcode: string;
  quantity: string;
  cost: string;
  expires: string;
  ncm: string;
  productId: string;
  warning: string;
};

export type PurchaseDraft = {
  accessKey: string;
  supplier: string;
  purchasedOn: string;
  lines: ImportLine[];
};

export type PurchaseImportState = {
  error?: string;
  ok?: string;
  draft?: PurchaseDraft;
} | null;

async function adminDb() {
  const { supabase, role } = await requireUser();
  if (!supabase || role !== "admin") return { error: "Só o administrador usa o menu fiscal." as const, supabase: null };
  return { error: null, supabase };
}

export async function generateSaleXml(_prev: FiscalXmlState, formData: FormData): Promise<FiscalXmlState> {
  const range = inclusiveRange(String(formData.get("inicio") ?? ""), String(formData.get("fim") ?? ""));
  if (!range) return { error: "Informe o período." };
  const { error, supabase } = await adminDb();
  if (error || !supabase) return { error: error ?? "Entre para gerar o XML." };
  const { company, sales, truncated } = await salesForXml(range.from, range.to);
  if (!company) return { error: "Cadastre a empresa antes de gerar o XML." };
  const gaps = companyFiscalGaps(company);
  if (gaps.length) return { error: `Falta na empresa: ${gaps.join(", ")}.` };
  const { data: token } = await supabase.rpc("shop_csc_token");
  const cscToken = typeof token === "string" ? token : "";
  const notes: string[] = [];
  if (truncated) notes.push("O arquivo traz as 100 primeiras vendas do período.");
  if (company.state !== "SP") notes.push("O QR Code desta UF ainda não entra no XML. O restante da nota é gerado.");
  const files: { name: string; data: Uint8Array }[] = [];
  let created = 0;
  for (const sale of sales) {
    if (sale.storedXml) {
      const key = /Id="NFe(\d{44})"/.exec(sale.storedXml)?.[1] ?? sale.id;
      files.push({ name: `${key}-nfce.xml`, data: new TextEncoder().encode(sale.storedXml) });
      continue;
    }
    if (sale.pending) {
      notes.push(`Venda de ${formatWhen(sale.createdAt)} ficou de fora: ${sale.pending}.`);
      continue;
    }
    const number = company.nfceNextNumber + created;
    const built = buildNfceXml(company, cscToken, {
      series: company.nfceSeries,
      number,
      code: nfceCode(sale.id, number),
      emittedAt: new Date(sale.createdAt),
      items: sale.items,
      payments: sale.payments,
    });
    const { error: saveError } = await supabase.rpc("save_sale_nfce", {
      p_sale_id: sale.id,
      p_series: company.nfceSeries,
      p_number: number,
      p_access_key: built.key,
      p_xml: built.xml,
    });
    if (saveError) return { error: saveError.message, notes };
    files.push({ name: `${built.key}-nfce.xml`, data: new TextEncoder().encode(built.xml) });
    created += 1;
  }
  if (!files.length) return { error: "Nenhuma venda deste período está pronta para o XML.", notes };
  const zip = zipStored(files);
  let binary = "";
  for (const byte of zip) binary += String.fromCharCode(byte);
  return {
    ok: created ? `${files.length} XML no arquivo. ${created} ${created === 1 ? "foi gerado agora" : "foram gerados agora"}.` : `${files.length} XML já gerados.`,
    notes,
    file: { name: `nfce-${String(formData.get("inicio"))}-a-${String(formData.get("fim"))}.zip`, base64: btoa(binary) },
  };
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export async function readSupplierInvoice(_prev: PurchaseImportState, formData: FormData): Promise<PurchaseImportState> {
  const { error } = await adminDb();
  if (error) return { error };
  const file = formData.get("xml");
  if (!(file instanceof File) || file.size === 0) return { error: "Envie o XML da nota do fornecedor." };
  if (file.size > 2_000_000) return { error: "O XML passa de 2 MB." };
  const parsed = parseSupplierInvoice(await file.text());
  if ("error" in parsed) return { error: parsed.error };
  const typedKey = String(formData.get("accessKey") ?? "").replace(/\D/g, "");
  if (typedKey && typedKey !== parsed.accessKey) return { error: "A chave digitada não é a chave deste XML." };
  const products = await listProducts();
  const lines = parsed.items.map((item, index) => {
    const whole = Number.isInteger(item.quantity);
    const quantity = whole ? item.quantity : Math.max(1, Math.round(item.quantity));
    const match = products.find((product) => !product.is_combo && normalizeProductName(product.name) === normalizeProductName(item.name));
    return {
      key: String(index + 1),
      name: item.name,
      barcode: item.barcode,
      quantity: String(quantity),
      cost: (item.unitCostCents / 100).toFixed(2).replace(".", ","),
      expires: "",
      ncm: /^\d{8}$/.test(item.ncm) ? item.ncm : "",
      productId: match?.id ?? "",
      warning: whole ? "" : "A quantidade da nota não é inteira. Ajuste antes de lançar.",
    };
  });
  return {
    draft: {
      accessKey: parsed.accessKey,
      supplier: parsed.supplier,
      purchasedOn: parsed.purchasedOn,
      lines,
    },
  };
}

export async function launchSupplierInvoice(_prev: PurchaseImportState, formData: FormData): Promise<PurchaseImportState> {
  const { error, supabase } = await adminDb();
  if (error || !supabase) return { error: error ?? "Entre para lançar a compra." };
  const accessKey = String(formData.get("accessKey") ?? "").replace(/\D/g, "");
  if (!/^\d{44}$/.test(accessKey)) return { error: "A chave da nota tem 44 dígitos." };
  let rows: ImportLine[] = [];
  try {
    rows = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { error: "Não foi possível ler os itens da nota." };
  }
  const purchasedOn = String(formData.get("purchasedOn") ?? "");
  const supplier = String(formData.get("supplier") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchasedOn)) return { error: "Informe a data da compra." };
  if (supplier.length < 2) return { error: "Informe o fornecedor." };
  const items = rows.map((line) => ({
    product_id: line.productId,
    quantity: Number(line.quantity),
    unit_cost_cents: Math.round(Number(String(line.cost).replace(",", ".")) * 100),
    barcode: line.barcode,
    expires_on: line.expires,
    ncm: line.ncm,
  }));
  if (!items.length || items.some((item) => !item.product_id || !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unit_cost_cents) || item.unit_cost_cents < 0 || !item.expires_on)) {
    return { error: "Cada item precisa de produto, quantidade inteira, valor e validade." };
  }
  const { data: purchaseId, error: purchaseError } = await supabase.rpc("register_purchase", {
    p_supplier: supplier,
    p_note: "",
    p_items: items.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_cost_cents: item.unit_cost_cents,
      barcode: item.barcode,
      expires_on: item.expires_on,
    })),
    p_payment_method: String(formData.get("payment") ?? "dinheiro"),
    p_purchased_on: purchasedOn,
    p_invoice_path: null,
  });
  if (purchaseError || !purchaseId) return { error: purchaseError?.message ?? "Não foi possível lançar a compra." };
  const { error: keyError } = await supabase.rpc("attach_invoice_key", { p_purchase_id: purchaseId, p_key: accessKey });
  if (keyError) return { error: keyError.message };
  for (const item of items) {
    if (!/^\d{8}$/.test(item.ncm)) continue;
    await supabase.from("products").update({ ncm: item.ncm }).eq("id", item.product_id).is("ncm", null);
  }
  revalidatePath("/compras");
  revalidatePath("/estoque");
  revalidatePath("/produtos");
  revalidatePath("/fiscal/compras");
  return { ok: "Compra lançada com os itens da nota." };
}
