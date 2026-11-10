import { ModuleNav } from "@/components/module-nav";
import { EmptyState, PageHero } from "@/components/page-hero";
import { Badge } from "@/components/ui/badge";
import { dayStamp, expiryStatus } from "@/lib/dates";
import { reportLinks } from "@/lib/report-nav";
import { expiryLots } from "@/server/queries";

function formatDay(iso: string) {
  return iso.split("-").reverse().join("/");
}

export default async function ExpiryReportPage() {
  const today = dayStamp(new Date());
  const lots = (await expiryLots())
    .map((lot) => ({ ...lot, status: expiryStatus(lot.expires_on, today) }))
    .sort((a, b) => {
      if (!a.expires_on && !b.expires_on) return a.product_name.localeCompare(b.product_name, "pt");
      if (!a.expires_on) return 1;
      if (!b.expires_on) return -1;
      return a.expires_on.localeCompare(b.expires_on) || a.product_name.localeCompare(b.product_name, "pt");
    });
  const expired = lots.filter((lot) => lot.status.kind === "expired").length;
  const soon = lots.filter((lot) => lot.status.kind === "soon").length;
  const missing = lots.filter((lot) => lot.status.kind === "missing").length;

  return (
    <div className="space-y-3">
      <PageHero
        eyebrow="Estoque"
        title="Validade dos produtos"
        description={`${expired} vencido${expired === 1 ? "" : "s"}, ${soon} com 14 dias ou menos e ${missing} sem data. O aviso usa os lotes que ainda têm quantidade.`}
      />
      <ModuleNav items={reportLinks} />
      {lots.length === 0 ? (
        <EmptyState title="Nenhum lote em estoque" description="A validade aparece aqui depois da compra ou da entrada." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Produto</th>
                <th className="px-3 py-2 font-medium">Quantidade</th>
                <th className="px-3 py-2 font-medium">Entrada</th>
                <th className="px-3 py-2 font-medium">Validade</th>
                <th className="px-3 py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => (
                <tr key={lot.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">
                    {lot.product_name}
                    {lot.supplier ? <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{lot.supplier}</span> : null}
                  </td>
                  <td className="px-3 py-2">{lot.quantity_remaining}</td>
                  <td className="px-3 py-2">{formatDay(lot.received_on)}</td>
                  <td className="px-3 py-2">{lot.expires_on ? formatDay(lot.expires_on) : "—"}</td>
                  <td className="px-3 py-2">
                    <Badge tone={lot.status.kind === "expired" ? "high" : lot.status.kind === "soon" ? "watch" : lot.status.kind === "missing" ? "muted" : "ok"}>
                      {lot.status.label}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
