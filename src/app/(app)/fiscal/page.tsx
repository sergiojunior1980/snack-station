import { redirect } from "next/navigation";
import { ModuleNav } from "@/components/module-nav";
import { PageHero } from "@/components/page-hero";
import { requireUser } from "@/server/queries";

const links = [
  { href: "/empresa", label: "Empresa" },
  { href: "/fiscal/vendas", label: "XML das vendas" },
  { href: "/fiscal/compras", label: "Nota de compra" },
];

export default async function FiscalHome() {
  const { user, role } = await requireUser();
  if (!user) redirect("/login");
  if (role !== "admin") redirect("/");

  return (
    <div className="space-y-3">
      <PageHero eyebrow="Fiscal" title="Escolha a área" description="Nada abre sozinho. A página aparece quando você clica nela." />
      <ModuleNav items={links} />
    </div>
  );
}
