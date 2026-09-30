import { ModuleNav } from "@/components/module-nav";
import { PageHero } from "@/components/page-hero";
import { PurchaseScreen, type SavedPurchase } from "@/components/purchase-desk";
import { listPaymentMethods, listProducts, recentPurchases } from "@/server/queries";

export default async function PurchasesPage() {
  const [products, purchases, methods] = await Promise.all([
    listProducts(),
    recentPurchases(),
    listPaymentMethods("pagamento"),
  ]);

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Reposição"
        title="Comprar produto"
        description="A compra soma estoque e atualiza o custo médio. Dinheiro e saldo da conta abatem a conta corrente."
      />
      <ModuleNav items={[{ href: "/estoque", label: "Movimento" }, { href: "/compras", label: "Compras" }]} />
      {products.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Cadastre um produto antes de lançar a compra.
        </p>
      ) : (
        <PurchaseScreen
          products={products}
          purchases={purchases as SavedPurchase[]}
          methods={methods.filter((method) => method.active !== false)}
        />
      )}
    </div>
  );
}
