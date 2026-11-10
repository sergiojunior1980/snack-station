import Link from "next/link";
import { dayStamp, expiryStatus } from "@/lib/dates";
import { expiryLots } from "@/server/queries";

function formatDay(iso: string) {
  return iso.split("-").reverse().join("/");
}

export async function ExpiryAlert() {
  const today = dayStamp(new Date());
  const urgent = (await expiryLots())
    .map((lot) => ({ ...lot, status: expiryStatus(lot.expires_on, today) }))
    .filter((lot) => lot.status.kind === "expired" || lot.status.kind === "soon")
    .sort((a, b) => (a.expires_on ?? "9999").localeCompare(b.expires_on ?? "9999") || a.product_name.localeCompare(b.product_name, "pt"));
  if (urgent.length === 0) return null;
  const expired = urgent.filter((lot) => lot.status.kind === "expired").length;
  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg">Validade acabando</h2>
        <Link href="/relatorios/validades" className="text-sm font-medium underline">
          Abrir relatório
        </Link>
      </div>
      <p className="mt-1 text-sm">
        {expired ? `${expired} lote${expired === 1 ? "" : "s"} vencido${expired === 1 ? "" : "s"}. ` : ""}
        O aviso aparece quando faltam 14 dias ou menos, ou quando o lote já venceu.
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {urgent.slice(0, 6).map((lot) => (
          <li key={lot.id}>
            <span className="font-medium">{lot.product_name}</span>
            {" · "}
            {lot.quantity_remaining} un
            {lot.expires_on ? ` · ${formatDay(lot.expires_on)}` : ""}
            {" · "}
            {lot.status.label}
          </li>
        ))}
      </ul>
      {urgent.length > 6 ? <p className="mt-2 text-sm">E mais {urgent.length - 6} lote{urgent.length - 6 === 1 ? "" : "s"} no relatório.</p> : null}
    </section>
  );
}
