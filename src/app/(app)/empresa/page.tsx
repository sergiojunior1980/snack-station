import { redirect } from "next/navigation";
import { CompanyForm } from "@/components/company-form";
import { PageHero } from "@/components/page-hero";
import { emptyShopFiscal } from "@/lib/company";
import { requireUser, shopFiscal } from "@/server/queries";

export default async function CompanyPage() {
  const { user, role } = await requireUser();
  if (!user) redirect("/login");
  if (role !== "admin") redirect("/");
  const company = (await shopFiscal()) ?? emptyShopFiscal;

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Empresa"
        title="Dados da empresa"
        description="CNPJ, endereço, regime, série da NFC-e, CSC e certificado A1. Salvar estes dados ainda não emite nota."
      />
      <CompanyForm company={company} />
    </div>
  );
}
