import Link from "next/link";
import { EmptyState, PageHero, Stat } from "@/components/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { paymentLabel } from "@/lib/catalog";
import { periodRange } from "@/lib/dates";
import { formatDateTime } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { listProducts, recentSales, revenueSeries } from "@/server/queries";

export default async function HomePage() {
  const today = periodRange("hoje");
  const month = periodRange("mes");
  const [products, sales, todaySeries, monthSeries] = await Promise.all([
    listProducts(),
    recentSales(6),
    revenueSeries(today.from, today.to, "day"),
    revenueSeries(month.from, month.to, "month"),
  ]);

  const todayTotal = todaySeries.reduce((sum, row) => sum + Number(row.total_cents), 0);
  const todayCount = todaySeries.reduce((sum, row) => sum + Number(row.sale_count), 0);
  const monthTotal = monthSeries.reduce((sum, row) => sum + Number(row.total_cents), 0);
  const low = products.filter((product) => product.active && product.stock_quantity <= product.min_stock);

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Painel"
        title="Como está a estação hoje"
        description="Venda no balcão, reponha o que acabou e acompanhe o que entrou no caixa."
        actions={
          <>
            <Button asChild>
              <Link href="/vendas">Registrar venda</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/compras">Lançar compra</Link>
            </Button>
          </>
        }
      />
      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Hoje" value={formatBRL(todayTotal)} hint={`${todayCount} venda${todayCount === 1 ? "" : "s"}`} />
        <Stat label="Este mês" value={formatBRL(monthTotal)} hint="Faturamento acumulado" />
        <Stat label="Estoque baixo" value={String(low.length)} hint={low.length ? "Vale repor antes do intervalo" : "Nada pedindo reposição"} />
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-heading text-2xl">Últimas vendas</h2>
          {sales.length === 0 ? (
            <EmptyState title="Ainda sem vendas" description="A primeira venda aparece aqui e já sai do estoque." />
          ) : (
            <ul className="space-y-2">
              {sales.map((sale) => {
                const items = (sale.sale_items as { product_name: string; quantity: number }[]) ?? [];
                return (
                  <li key={sale.id} className="rounded-2xl border bg-card px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{formatBRL(sale.total_cents)}</p>
                      <Badge>{paymentLabel(sale.payment_method)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {items.map((item) => `${item.quantity}× ${item.product_name}`).join(", ")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(sale.created_at)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="space-y-3">
          <h2 className="font-heading text-2xl">Para repor</h2>
          {low.length === 0 ? (
            <EmptyState title="Estoque tranquilo" description="Nenhum produto ativo está no mínimo ou abaixo dele." />
          ) : (
            <ul className="space-y-2">
              {low.map((product) => (
                <li key={product.id} className="flex items-center justify-between rounded-2xl border bg-card px-4 py-3">
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">Mínimo {product.min_stock}</p>
                  </div>
                  <Badge tone={product.stock_quantity === 0 ? "high" : "watch"}>{product.stock_quantity} un</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
