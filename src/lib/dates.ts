const TZ = "America/Sao_Paulo";
const DAY = 86_400_000;

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    weekday: get("weekday"),
  };
}

export function startOfSaoPauloDay(date = new Date()) {
  const { year, month, day } = zonedParts(date);
  return new Date(`${year}-${month}-${day}T00:00:00-03:00`);
}

export function startOfSaoPauloWeek(date = new Date()) {
  const start = startOfSaoPauloDay(date);
  const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(zonedParts(date).weekday);
  return new Date(start.getTime() - Math.max(index, 0) * DAY);
}

export function startOfSaoPauloMonth(date = new Date()) {
  const { year, month } = zonedParts(date);
  return new Date(`${year}-${month}-01T00:00:00-03:00`);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY);
}

export type ReportPeriod = "hoje" | "semana" | "mes" | "30d";
export type ReportGrain = "day" | "week" | "month";

export function periodRange(period: ReportPeriod, now = new Date()) {
  const tomorrow = addDays(startOfSaoPauloDay(now), 1);
  if (period === "hoje") return { from: startOfSaoPauloDay(now), to: tomorrow };
  if (period === "semana") return { from: startOfSaoPauloWeek(now), to: tomorrow };
  if (period === "30d") return { from: addDays(startOfSaoPauloDay(now), -29), to: tomorrow };
  return { from: startOfSaoPauloMonth(now), to: tomorrow };
}

export function seriesRange(grain: ReportGrain, now = new Date()) {
  const tomorrow = addDays(startOfSaoPauloDay(now), 1);
  if (grain === "day") return { from: addDays(startOfSaoPauloDay(now), -13), to: tomorrow };
  if (grain === "week") return { from: addDays(startOfSaoPauloWeek(now), -7 * 7), to: tomorrow };
  const monthStart = startOfSaoPauloMonth(now);
  const from = new Date(monthStart);
  from.setUTCMonth(from.getUTCMonth() - 11);
  return { from, to: tomorrow };
}

export function formatBucket(bucket: string, grain: ReportGrain) {
  const date = new Date(`${bucket}T12:00:00-03:00`);
  if (grain === "month") {
    return date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: TZ });
  }
  if (grain === "week") {
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: TZ });
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: TZ });
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
