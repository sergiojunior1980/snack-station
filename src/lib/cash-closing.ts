import { formatDateTime } from "@/lib/dates";
import { formatBRL } from "@/lib/money";

export type CashClosingLine = { name: string; cents: number; count?: number; quantity?: number };

export type CashClosingMovement = {
  id: string;
  at: string;
  kind: "entrada" | "retirada";
  cents: number;
  note: string;
  actor: string;
};

export type CashClosingPurchase = {
  id: string;
  at: string;
  supplier: string;
  method: string;
  cents: number;
  fromDrawer: boolean;
  items: string;
};

export type CashClosingSale = {
  id: string;
  at: string;
  seller: string;
  cents: number;
  items: string;
  payments: string;
};

export type CashClosing = {
  id: string;
  open: boolean;
  openedAt: string;
  closedAt: string | null;
  openedBy: string;
  closedBy: string;
  openingNote: string | null;
  closingNote: string | null;
  openingCents: number;
  cashSalesCents: number;
  cashMethods: string;
  inCents: number;
  outCents: number;
  purchaseCents: number;
  composedCents: number;
  expectedCents: number;
  countedCents: number | null;
  differenceCents: number | null;
  mismatch: boolean;
  billedCents: number;
  saleCount: number;
  units: number;
  revenue: CashClosingLine[];
  sellers: CashClosingLine[];
  products: CashClosingLine[];
  movements: CashClosingMovement[];
  purchases: CashClosingPurchase[];
  sales: CashClosingSale[];
};

function text(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function signed(cents: number) {
  if (cents > 0) return `+${formatBRL(cents)}`;
  return formatBRL(cents);
}

function moneyCell(cents: number) {
  return `<td class="num">${formatBRL(cents)}</td>`;
}

function table(headers: string[], rows: string[]) {
  if (rows.length === 0) return `<p class="empty">Nada neste turno.</p>`;
  return `<table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

export function cashClosingDocument(shopName: string, session: CashClosing) {
  const closed = session.closedAt ? formatDateTime(session.closedAt) : "Ainda aberto";
  const notes = [session.openingNote ? `Abertura: ${text(session.openingNote)}` : "", session.closingNote ? `Fechamento: ${text(session.closingNote)}` : ""]
    .filter(Boolean)
    .join("<br>");
  const revenue = session.revenue.map(
    (line) => `<tr><td>${text(line.name)}</td><td class="num">${line.count ?? 0}</td>${moneyCell(line.cents)}</tr>`,
  );
  const sellers = session.sellers.map(
    (line) => `<tr><td>${text(line.name)}</td><td class="num">${line.count ?? 0}</td>${moneyCell(line.cents)}</tr>`,
  );
  const products = session.products.map(
    (line) => `<tr><td>${text(line.name)}</td><td class="num">${line.quantity ?? 0}</td>${moneyCell(line.cents)}</tr>`,
  );
  const movements = session.movements.map(
    (line) =>
      `<tr><td>${formatDateTime(line.at)}</td><td>${line.kind === "entrada" ? "Entrada" : "Retirada"}</td><td>${text(line.note)}</td><td>${text(line.actor)}</td>${moneyCell(line.kind === "entrada" ? line.cents : -line.cents)}</tr>`,
  );
  const purchases = session.purchases.map(
    (line) =>
      `<tr><td>${formatDateTime(line.at)}</td><td>${text(line.supplier)}</td><td>${text(line.items)}</td><td>${text(line.method)}${line.fromDrawer ? "" : " · fora do caixa"}</td>${moneyCell(line.cents)}</tr>`,
  );
  const sales = session.sales.map(
    (line) =>
      `<tr><td>${formatDateTime(line.at)}</td><td>${text(line.seller)}</td><td>${text(line.items)}</td><td>${text(line.payments)}</td>${moneyCell(line.cents)}</tr>`,
  );

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Fechamento de caixa</title>
  <style>
    @page { margin: 12mm; }
    body { font-family: Arial, sans-serif; color: #111; font-size: 12px; }
    h1 { font-size: 18px; margin: 0; }
    h2 { font-size: 13px; margin: 18px 0 6px; }
    p { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th, td { border-bottom: 1px solid #ddd; padding: 4px 6px; text-align: left; vertical-align: top; }
    th { font-size: 11px; text-transform: uppercase; color: #444; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .summary td { border: 0; padding: 2px 12px 2px 0; }
    .empty { color: #555; }
  </style>
</head>
<body>
  <h1>${text(shopName || "Fechamento de caixa")}</h1>
  <p><strong>${session.open ? "Caixa ainda aberto" : "Fechamento de caixa"}</strong></p>
  <p>Aberto em ${formatDateTime(session.openedAt)} por ${text(session.openedBy)}</p>
  <p>Fechado em ${closed}${session.closedBy ? ` por ${text(session.closedBy)}` : ""}</p>
  ${notes ? `<p>${notes}</p>` : ""}
  <table class="summary">
    <tr><td>Faturamento</td><td class="num">${formatBRL(session.billedCents)}</td><td>Vendas</td><td class="num">${session.saleCount}</td></tr>
    <tr><td>Unidades</td><td class="num">${session.units}</td><td>Ticket médio</td><td class="num">${session.saleCount ? formatBRL(Math.round(session.billedCents / session.saleCount)) : formatBRL(0)}</td></tr>
    <tr><td>Valor esperado</td><td class="num">${formatBRL(session.expectedCents)}</td><td>Valor contado</td><td class="num">${session.countedCents == null ? "—" : formatBRL(session.countedCents)}</td></tr>
    <tr><td>Diferença</td><td class="num">${session.differenceCents == null ? "—" : signed(session.differenceCents)}</td><td></td><td></td></tr>
  </table>
  <h2>Faturamento por forma</h2>
  ${table(["Forma", "Lançamentos", "Valor"], revenue)}
  <h2>Composição do caixa</h2>
  <table>
    <tbody>
      <tr><td>Fundo de troco</td>${moneyCell(session.openingCents)}</tr>
      <tr><td>Vendas no caixa${session.cashMethods ? ` (${text(session.cashMethods)})` : ""}</td>${moneyCell(session.cashSalesCents)}</tr>
      <tr><td>Entradas</td>${moneyCell(session.inCents)}</tr>
      <tr><td>Saídas</td>${moneyCell(-session.outCents)}</tr>
      <tr><td>Compras pagas pelo caixa</td>${moneyCell(-session.purchaseCents)}</tr>
      ${session.mismatch ? `<tr><td><strong>Soma da composição</strong></td>${moneyCell(session.composedCents)}</tr>` : ""}
    </tbody>
  </table>
  ${session.mismatch ? `<p>O valor gravado no fechamento foi ${formatBRL(session.expectedCents)}. A composição acima foi recalculada com as vendas, movimentos e compras do turno.</p>` : ""}
  <h2>Vendedores</h2>
  ${table(["Vendedor", "Vendas", "Valor"], sellers)}
  <h2>Produtos vendidos</h2>
  ${table(["Produto", "Quantidade", "Valor"], products)}
  <h2>Entradas e retiradas</h2>
  ${table(["Hora", "Tipo", "Observação", "Quem lançou", "Valor"], movements)}
  <h2>Compras do turno</h2>
  ${table(["Hora", "Fornecedor", "Itens", "Pagamento", "Valor"], purchases)}
  <h2>Vendas do turno</h2>
  ${table(["Hora", "Vendedor", "Itens", "Pagamento", "Total"], sales)}
  <p style="margin-top:36px">Conferi os valores deste fechamento.</p>
  <p style="margin-top:28px;border-top:1px solid #111;width:240px;padding-top:6px">Assinatura</p>
</body>
</html>`;
}

export function printCashClosing(shopName: string, session: CashClosing) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    return;
  }
  win.document.open();
  win.document.write(cashClosingDocument(shopName, session));
  win.document.close();
  const cleanup = () => frame.remove();
  win.addEventListener("afterprint", cleanup);
  window.setTimeout(() => {
    win.focus();
    win.print();
  }, 200);
  window.setTimeout(cleanup, 60_000);
}
