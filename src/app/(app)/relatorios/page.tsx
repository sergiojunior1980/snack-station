import { ModuleNav } from "@/components/module-nav";
import { PageHero } from "@/components/page-hero";
import { reportLinks } from "@/lib/report-nav";

export default function ReportsIndex() {
  return (
    <div className="space-y-3">
      <PageHero eyebrow="Relatórios" title="Escolha o relatório" description="Nada abre sozinho. O relatório aparece quando você clica nele." />
      <ModuleNav items={reportLinks} />
    </div>
  );
}
