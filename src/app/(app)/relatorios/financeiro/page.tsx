import { ModuleNav } from "@/components/module-nav";
import { PageHero } from "@/components/page-hero";
import { financeReports } from "@/lib/report-nav";

export default function FinanceReportIndex() {
  return (
    <div className="space-y-3">
      <PageHero eyebrow="Financeiro" title="Escolha o relatório" description="Nada abre sozinho. O relatório aparece quando você clica nele." />
      <ModuleNav items={[...financeReports]} />
    </div>
  );
}
