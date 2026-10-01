import { productFiscalGaps } from "@/lib/fiscal-product";
import type { NfceItem, NfcePayment } from "@/lib/nfce-xml";
import { requireUser, shopFiscal } from "@/server/queries";

type SaleItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
};

type SalePayment = { payment_method: string; amount_cents: number };

type SaleRow = {
  id: string;
  created_at: string;
  total_cents: number;
  sale_items: SaleItem[] | null;
  sale_payments: SalePayment[] | null;
};

export type XmlSale = {
  id: string;
  createdAt: string;
  totalCents: number;
  pending: string;
  storedXml: string | null;
  items: NfceItem[];
  payments: NfcePayment[];
};

export async function salesForXml(from: Date, to: Date) {
  const { supabase, role } = await requireUser();
  const company = await shopFiscal();
  if (!supabase || role !== "admin" || !company) return { company, sales: [] as XmlSale[], truncated: false };
  const { data } = await supabase
    .from("sales")
    .select("id, created_at, total_cents, sale_items(product_id, product_name, quantity, unit_price_cents, total_cents), sale_payments(payment_method, amount_cents)")
    .gte("created_at", from.toISOString())
    .lt("created_at", to.toISOString())
    .order("created_at", { ascending: true })
    .limit(101);
  const list = ((data ?? []) as SaleRow[]);
  const truncated = list.length > 100;
  const page = list.slice(0, 100);
  const ids = page.map((sale) => sale.id);
  const productIds = [...new Set(page.flatMap((sale) => (sale.sale_items ?? []).map((item) => item.product_id)))];
  const [{ data: invoices }, { data: products }, { data: methods }] = await Promise.all([
    ids.length
      ? supabase.from("sale_invoices").select("sale_id, xml").in("sale_id", ids)
      : Promise.resolve({ data: [] as { sale_id: string; xml: string }[] }),
    productIds.length
      ? supabase.from("products").select("id, ncm, cfop, tax_code, origin").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; ncm: string | null; cfop: string; tax_code: string; origin: string }[] }),
    supabase.from("payment_methods").select("id, fiscal_code").eq("kind", "recebimento"),
  ]);
  const stored = new Map((invoices ?? []).map((row) => [row.sale_id, row.xml]));
  const fiscal = new Map((products ?? []).map((product) => [product.id, product]));
  const codes = new Map((methods ?? []).map((method) => [method.id, method.fiscal_code]));
  const sales = page.map((sale) => saleXml(company.crt, sale, stored.get(sale.id) ?? null, fiscal, codes));
  return { company, sales, truncated };
}

function saleXml(
  crt: number,
  sale: SaleRow,
  storedXml: string | null,
  fiscal: Map<string, { ncm: string | null; cfop: string; tax_code: string; origin: string }>,
  codes: Map<string, string | null>,
): XmlSale {
  const items = sale.sale_items ?? [];
  const payments = sale.sale_payments ?? [];
  const gaps = items.flatMap((item) => {
    const product = fiscal.get(item.product_id);
    const missing = productFiscalGaps({
      ncm: product?.ncm ?? "",
      cfop: product?.cfop ?? "",
      taxCode: product?.tax_code ?? "",
      origin: product?.origin ?? "",
    }, crt);
    return missing.length ? [`${item.product_name} ${missing[0]}`] : [];
  });
  const missingPay = payments.some((payment) => !codes.get(payment.payment_method));
  const paid = payments.reduce((sum, payment) => sum + payment.amount_cents, 0);
  let pending = "";
  if (!storedXml) {
    if (!items.length) pending = "sem itens";
    else if (gaps.length) pending = gaps.join("; ");
    else if (!payments.length || missingPay) pending = "forma de pagamento sem código oficial";
    else if (paid !== sale.total_cents) pending = "pagamento diferente do total";
  }
  return {
    id: sale.id,
    createdAt: sale.created_at,
    totalCents: sale.total_cents,
    pending,
    storedXml,
    items: items.map((item) => {
      const product = fiscal.get(item.product_id);
      return {
        name: item.product_name,
        ncm: product?.ncm ?? "",
        cfop: product?.cfop ?? "",
        taxCode: product?.tax_code ?? "",
        origin: product?.origin ?? "0",
        quantity: item.quantity,
        unitCents: item.unit_price_cents,
        totalCents: item.total_cents,
      };
    }),
    payments: payments.map((payment) => ({ code: codes.get(payment.payment_method) ?? "", cents: payment.amount_cents })),
  };
}
