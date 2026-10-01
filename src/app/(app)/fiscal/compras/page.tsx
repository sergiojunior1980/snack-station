import { redirect } from "next/navigation";
import { PageHero } from "@/components/page-hero";
import { PurchaseInvoiceDesk } from "@/components/purchase-invoice-desk";
import { listPaymentMethods, listProducts, requireUser } from "@/server/queries";

export default async function PurchaseInvoicePage() {
  const { user, role } = await requireUser();
  if (!user) redirect("/login");
  if (role !== "admin") redirect("/");
  const [products, methods] = await Promise.all([
    listProducts(),
    listPaymentMethods("pagamento"),
  ]);

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Fiscal"
        title="Nota de compra"
        description="Envie o XML do fornecedor. O sistema preenche o fornecedor, a data e os itens. A validade continua com você."
      />
      <PurchaseInvoiceDesk products={products} methods={methods} />
    </div>
  );
}
