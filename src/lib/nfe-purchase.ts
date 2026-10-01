export type ParsedInvoiceItem = {
  name: string;
  barcode: string;
  quantity: number;
  unitCostCents: number;
  ncm: string;
};

export type ParsedInvoice = {
  accessKey: string;
  supplier: string;
  cnpj: string;
  purchasedOn: string;
  items: ParsedInvoiceItem[];
};

function tag(block: string, name: string) {
  const match = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([^<]*)</(?:[\\w.-]+:)?${name}>`, "i").exec(block);
  return match?.[1]?.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').trim() ?? "";
}

function blocks(xml: string, name: string) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>[\\s\\S]*?</(?:[\\w.-]+:)?${name}>`, "gi");
  return xml.match(re) ?? [];
}

export function parseSupplierInvoice(xml: string): ParsedInvoice | { error: string } {
  const source = xml.replace(/^\uFEFF/, "");
  if (!/<(?:[\w.-]+:)?infNFe\b/i.test(source)) return { error: "Este arquivo não é um XML de nota fiscal." };
  const info = blocks(source, "infNFe")[0] ?? source;
  const id = /Id="NFe(\d{44})"/i.exec(info)?.[1] ?? "";
  if (id.length !== 44) return { error: "A nota não tem a chave de 44 dígitos." };
  const emit = blocks(info, "emit")[0] ?? "";
  const supplier = tag(emit, "xNome");
  if (supplier.length < 2) return { error: "A nota não informa o fornecedor." };
  const emitted = tag(blocks(info, "ide")[0] ?? "", "dhEmi") || tag(blocks(info, "ide")[0] ?? "", "dEmi");
  const purchasedOn = emitted.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchasedOn)) return { error: "A nota não informa a data." };
  const items = blocks(info, "det").map((det) => {
    const prod = blocks(det, "prod")[0] ?? det;
    const barcode = tag(prod, "cEAN");
    const quantity = Number(tag(prod, "qCom").replace(",", "."));
    const unit = Number(tag(prod, "vUnCom").replace(",", "."));
    return {
      name: tag(prod, "xProd"),
      barcode: barcode === "SEM GTIN" ? "" : barcode,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      unitCostCents: Number.isFinite(unit) ? Math.round(unit * 100) : -1,
      ncm: tag(prod, "NCM").replace(/\D/g, ""),
    };
  }).filter((item) => item.name);
  if (!items.length) return { error: "A nota não tem itens." };
  return {
    accessKey: id,
    supplier,
    cnpj: tag(emit, "CNPJ").replace(/\D/g, ""),
    purchasedOn,
    items,
  };
}

export function normalizeProductName(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}
