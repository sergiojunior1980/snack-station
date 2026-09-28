import Link from "next/link";
import { ReportRange } from "@/components/report-range";
import { reportGrains, reportPeriods } from "@/lib/report-search";

type ReportWindow = {
  period: string;
  grain: string;
  custom: { from: Date; to: Date } | null;
  startValue: string;
  endValue: string;
};

export function reportHref(base: string, query: Record<string, string>) {
  return `${base}?${new URLSearchParams(query).toString()}`;
}

export function ReportControls({ base, report, grain = false }: { base: string; report: ReportWindow; grain?: boolean }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {reportPeriods.map((item) => (
          <Link
            key={item.id}
            href={reportHref(base, grain ? { periodo: item.id, visao: report.grain } : { periodo: item.id })}
            className={`rounded-full px-3 py-1 text-sm ${!report.custom && item.id === report.period ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <ReportRange key={`${report.startValue}-${report.endValue}-${report.grain}`} inicio={report.startValue} fim={report.endValue} visao={report.grain} base={base} />
      {grain ? (
        <div className="flex flex-wrap gap-2">
          {reportGrains.map((item) => (
            <Link
              key={item.id}
              href={reportHref(
                base,
                report.custom
                  ? { inicio: report.startValue, fim: report.endValue, visao: item.id }
                  : { periodo: report.period, visao: item.id },
              )}
              className={`rounded-full px-3 py-1 text-sm ${item.id === report.grain ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </>
  );
}
