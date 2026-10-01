import type { SlipRevenueLine } from "@/lib/cash-revenue";
import { formatDateTime } from "@/lib/dates";
import { formatBRL } from "@/lib/money";

export type CashSlip = {
  shopName: string;
  id: string;
  openedAt: string;
  closedAt: string;
  operator: string;
  openingCents: number;
  openingNote: string | null;
  revenue: SlipRevenueLine[];
  billedCents: number;
  salesCents: number;
  inCents: number;
  outCents: number;
  purchaseCents: number;
  expectedCents: number;
  countedCents: number;
  differenceCents: number;
  closingNote: string | null;
};

function signed(cents: number) {
  if (cents > 0) return `+${formatBRL(cents)}`;
  return formatBRL(cents);
}

function text(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function row(label: string, value: string) {
  return `<tr><td>${label}</td><td>${value}</td></tr>`;
}

export function cashSlipDocument(slip: CashSlip) {
  const note = [slip.openingNote ? `Abertura: ${text(slip.openingNote)}` : "", slip.closingNote ? `Fechamento: ${text(slip.closingNote)}` : ""]
    .filter(Boolean)
    .join("<br>");
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Fechamento de caixa</title>
  <style>
    @page { margin: 8mm; }
    body { font-family: Arial, sans-serif; color: #111; width: 72mm; margin: 0 auto; font-size: 12px; }
    h1 { font-size: 16px; margin: 0; }
    h2 { font-size: 13px; margin: 4px 0 12px; font-weight: 600; }
    p { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    td { padding: 3px 0; vertical-align: top; }
    td:last-child { text-align: right; white-space: nowrap; font-weight: 600; }
    td.section { padding-top: 10px; text-align: left; font-weight: 700; }
    .line { border-top: 1px dashed #111; }
    .sign { margin-top: 36px; }
    .sign .space { height: 42px; border-bottom: 1px solid #111; }
    .sign p { margin-top: 6px; text-align: center; }
  </style>
</head>
<body>
  <h1>${text(slip.shopName || "Fechamento de caixa")}</h1>
  <h2>Comprovante de fechamento de caixa</h2>
  <p>Aberto em ${formatDateTime(slip.openedAt)}</p>
  <p>Fechado em ${formatDateTime(slip.closedAt)}</p>
  <p>Responsável: ${text(slip.operator)}</p>
  <table>
    <tr><td class="section" colspan="2">Faturamento do turno</td></tr>
    ${slip.revenue.map((line) => row(text(line.name), formatBRL(line.cents))).join("")}
    <tr class="line"><td>Total faturado</td><td>${formatBRL(slip.billedCents)}</td></tr>
    <tr><td class="section" colspan="2">Caixa</td></tr>
    ${row("Fundo de troco", formatBRL(slip.openingCents))}
    ${row("Vendas em dinheiro", formatBRL(slip.salesCents))}
    ${row("Entradas", formatBRL(slip.inCents))}
    ${row("Saídas", formatBRL(slip.outCents))}
    ${row("Compras no caixa", formatBRL(slip.purchaseCents))}
    <tr class="line"><td>Valor esperado</td><td>${formatBRL(slip.expectedCents)}</td></tr>
    ${row("Valor contado", formatBRL(slip.countedCents))}
    ${row("Diferença", signed(slip.differenceCents))}
  </table>
  ${note ? `<p style="margin-top:12px">${note}</p>` : ""}
  <div class="sign">
    <p>Conferi os valores deste fechamento.</p>
    <div class="space"></div>
    <p>Assinatura</p>
  </div>
</body>
</html>`;
}

export function printCashSlip(slip: CashSlip) {
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
  win.document.write(cashSlipDocument(slip));
  win.document.close();
  const cleanup = () => frame.remove();
  win.addEventListener("afterprint", cleanup);
  window.setTimeout(() => {
    win.focus();
    win.print();
  }, 200);
  window.setTimeout(cleanup, 60_000);
}
