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

export function bucketKey(value: string | Date, grain: ReportGrain) {
  const date = typeof value === "string" ? new Date(value) : value;
  const start =
    grain === "month" ? startOfSaoPauloMonth(date) : grain === "week" ? startOfSaoPauloWeek(date) : startOfSaoPauloDay(date);
  const { year, month, day } = zonedParts(start);
  return `${year}-${month}-${day}`;
}

export function eachBucket(from: Date, to: Date, grain: ReportGrain) {
  const keys: string[] = [];
  let cursor =
    grain === "month" ? startOfSaoPauloMonth(from) : grain === "week" ? startOfSaoPauloWeek(from) : startOfSaoPauloDay(from);
  while (cursor < to && keys.length < 36) {
    keys.push(bucketKey(cursor, grain));
    cursor = grain === "month" ? addMonths(cursor, 1) : addDays(cursor, grain === "week" ? 7 : 1);
  }
  return keys;
}

function addMonths(date: Date, months: number) {
  const { year, month } = zonedParts(date);
  const next = new Date(Date.UTC(Number(year), Number(month) - 1 + months, 1));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  return new Date(`${y}-${m}-01T00:00:00-03:00`);
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

export function formatDay(value: Date) {
  return value.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
}

export function dayStamp(date: Date) {
  const { year, month, day } = zonedParts(date);
  return `${year}-${month}-${day}`;
}

export function inclusiveRange(start: string, end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  const from = new Date(`${start}T00:00:00-03:00`);
  const last = new Date(`${end}T00:00:00-03:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(last.getTime()) || last < from) return null;
  return { from, to: addDays(last, 1) };
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
