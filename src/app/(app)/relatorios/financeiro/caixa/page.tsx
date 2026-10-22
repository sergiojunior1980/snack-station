import { CashClosingReport } from "@/components/cash-closing-report";
import { CashSessionPicker } from "@/components/cash-session-picker";
import { ModuleNav } from "@/components/module-nav";
import { EmptyState, PageHero } from "@/components/page-hero";
import { reportLinks } from "@/lib/report-nav";
import { cashClosingReport } from "@/server/queries";

export default async function CashReportPage({
  searchParams,
}: {
  searchParams: Promise<{ caixa?: string }>;
}) {
  const { caixa } = await searchParams;
  const closing = await cashClosingReport(caixa);
  const selectedId = closing.session && !closing.session.open ? closing.session.id : "atual";

  return (
    <div className="space-y-3">
      <PageHero
        eyebrow="Financeiro"
        title="Fechamento de caixa"
        description="O caixa aberto aparece aqui. Para ver um turno já fechado, escolha na lista."
      />
      <ModuleNav items={reportLinks} />
      {closing.closed.length > 0 || closing.hasOpen ? (
        <CashSessionPicker closed={closing.closed} selectedId={closing.hasOpen ? selectedId : closing.session?.id ?? ""} hasOpen={closing.hasOpen} />
      ) : null}
      {closing.session ? (
        <CashClosingReport shopName={closing.shopName} sessions={[closing.session]} />
      ) : (
        <EmptyState
          title={closing.closed.length ? "Nenhum caixa aberto" : "Nenhum caixa"}
          description={
            closing.closed.length
              ? "Escolha um caixa fechado na lista para ver o turno."
              : "A abertura e o fechamento aparecem aqui depois do turno."
          }
        />
      )}
    </div>
  );
}
