import { addDays, dayStamp, formatDay, inclusiveRange, periodRange, type ReportGrain, type ReportPeriod } from "@/lib/dates";

export const reportPeriods: { id: ReportPeriod; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Esta semana" },
  { id: "mes", label: "Este mês" },
  { id: "30d", label: "30 dias" },
];

export const reportGrains: { id: ReportGrain; label: string }[] = [
  { id: "day", label: "Por dia" },
  { id: "week", label: "Por semana" },
  { id: "month", label: "Por mês" },
];

export function resolveReportSearch(params: { periodo?: string; visao?: string; inicio?: string; fim?: string }) {
  const period = reportPeriods.some((item) => item.id === params.periodo) ? (params.periodo as ReportPeriod) : "mes";
  const grain = reportGrains.some((item) => item.id === params.visao) ? (params.visao as ReportGrain) : "day";
  const askedCustom = Boolean(params.inicio || params.fim);
  const custom = askedCustom ? inclusiveRange(params.inicio ?? "", params.fim ?? "") : null;
  const selected = custom ?? periodRange(period);
  const startValue = params.inicio || dayStamp(selected.from);
  const endValue = params.fim || dayStamp(addDays(selected.to, -1));
  const description =
    askedCustom && !custom
      ? "A data fim precisa ser igual ou posterior à data início."
      : custom
        ? `De ${formatDay(selected.from)} a ${formatDay(addDays(selected.to, -1))}, incluindo os dois dias.`
        : period === "30d"
          ? `De ${formatDay(selected.from)} a ${formatDay(addDays(selected.to, -1))}. São 30 dias: o dia de hoje e os 29 anteriores.`
          : `De ${formatDay(selected.from)} a ${formatDay(addDays(selected.to, -1))}, no horário de São Paulo.`;

  return { period, grain, custom, selected, startValue, endValue, description };
}
