import { EmptyState, PageHero } from "@/components/page-hero";
import { ModuleNav } from "@/components/module-nav";
import { StockDesk } from "@/components/stock-desk";
import { StockNotice } from "@/components/stock-notice";
import { Tape } from "@/components/tape";
import { formatDateTime } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { stockBoard, listTape } from "@/server/queries";

const reasons: Record<string, string> = {
  vencimento: "Vencimento",
  perda: "Perda",
  consumo: "Consumo interno",
  ajuste: "Ajuste",
  compra: "Compra",
  entrada: "Entrada",
};

export default async function StockPage() {
  const [{ products, lots, movements, ready }, tape] = await Promise.all([stockBoard(), listTape("compras_estoque")]);
  const names = new Map(products.map((product) => [product.id, product.name]));

  return (
    <div className="space-y-4">
      <StockNotice />
      <ModuleNav items={[{ href: "/estoque", label: "Movimento" }, { href: "/compras", label: "Compras" }]} />
      <PageHero
        eyebrow="Estoque"
        title="Entrada, saída e custo médio"
        description="Cada entrada nova pesa o custo pelo que já está no estoque. A saída segue a validade mais próxima."
      />
      {!ready ? (
        <EmptyState title="Estoque ainda não liberado" description="Rode o SQL 006_cash_and_stock.sql no Supabase para lançar entrada, saída e custo médio." />
      ) : (
        <>
          <StockDesk products={products} />
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <article key={product.id} className="rounded-2xl border bg-card px-4 py-3">
                <p className="font-medium">{product.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{product.stock_quantity} em estoque</p>
                <p className="mt-1 text-sm">Custo médio {formatBRL(product.avg_cost_cents)}</p>
              </article>
            ))}
          </section>
          <section className="space-y-3">
            <h2 className="font-heading text-2xl">Lotes em estoque</h2>
            {lots.length === 0 ? (
              <EmptyState title="Sem lotes" description="A primeira entrada cria o lote com custo, data e validade." />
            ) : (
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {lots.map((lot) => (
                  <li key={lot.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-medium">{names.get(lot.product_id) ?? "Produto"}</p>
                      <p className="text-xs text-muted-foreground">
                        Entrou em {lot.received_on.split("-").reverse().join("/")}
                        {lot.expires_on ? ` · vence ${lot.expires_on.split("-").reverse().join("/")}` : " · sem validade"}
                        {lot.supplier ? ` · ${lot.supplier}` : ""}
                      </p>
                    </div>
                    <p className="text-sm">
                      {lot.quantity_remaining} un · {formatBRL(lot.unit_cost_cents)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="font-heading text-2xl">Últimos movimentos</h2>
            {movements.length === 0 ? (
              <EmptyState title="Nenhum movimento" description="Entradas e saídas aparecem aqui com o custo médio depois do lançamento." />
            ) : (
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {movements.map((move) => (
                  <li key={move.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-medium">
                        {move.direction === "entrada" ? "Entrada" : "Saída"} · {names.get(move.product_id) ?? "Produto"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(move.created_at)}
                        {move.reason ? ` · ${reasons[move.reason] ?? move.reason}` : ""}
                        {move.note ? ` · ${move.note}` : ""}
                      </p>
                    </div>
                    <p className="text-sm">
                      {move.direction === "entrada" ? "+" : "−"}
                      {move.quantity} · médio {formatBRL(move.avg_cost_cents_after)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      <Tape title="Fita de compras e estoque" entries={tape} />
    </div>
  );
}
