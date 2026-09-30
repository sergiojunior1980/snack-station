import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHero } from "@/components/page-hero";
import { formatDateTime } from "@/lib/dates";
import { canUseMenu } from "@/lib/roles";
import { listAudit, requireUser, tapeModuleLabel } from "@/server/queries";
import { cn } from "@/lib/utils";

const filters = [{ id: "", label: "Todas" }, ...Object.entries(tapeModuleLabel).map(([id, label]) => ({ id, label }))];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ fita?: string }> }) {
  const { user, role, menus } = await requireUser();
  if (!user) redirect("/login");
  if (!canUseMenu(role, menus, "auditoria")) redirect("/");
  const params = await searchParams;
  const selected = filters.some((item) => item.id === params.fita) ? (params.fita ?? "") : "";
  const entries = await listAudit(selected || undefined);

  return (
    <div className="space-y-3">
      <PageHero
        eyebrow="Auditoria"
        title="Fitas do sistema"
        description="Cada lançamento guarda a operação, a data, a hora e quem fez. As outras telas ficam só com o trabalho do dia."
      />
      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <Link
            key={item.id || "todas"}
            href={item.id ? `/auditoria?fita=${item.id}` : "/auditoria"}
            className={cn("rounded-full px-3 py-1.5 text-sm", selected === item.id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}
          >
            {item.label}
          </Link>
        ))}
      </div>
      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Nenhum lançamento nesta fita ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Quando</th>
                <th className="px-3 py-2 font-medium">Fita</th>
                <th className="px-3 py-2 font-medium">Quem</th>
                <th className="px-3 py-2 font-medium">O que aconteceu</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDateTime(entry.created_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{entry.module}</td>
                  <td className="whitespace-nowrap px-3 py-2">{entry.actor}</td>
                  <td className="px-3 py-2">{entry.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
