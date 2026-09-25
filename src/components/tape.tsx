import { formatDateTime } from "@/lib/dates";

export function Tape({
  title,
  entries,
}: {
  title: string;
  entries: { id: number; summary: string; created_at: string; actor: string }[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-2xl">{title}</h2>
      <p className="text-sm text-muted-foreground">Cada lançamento guarda a operação, a data, a hora e quem fez.</p>
      {entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum lançamento nesta fita ainda.
        </p>
      ) : (
        <ol className="divide-y overflow-hidden rounded-2xl border bg-card">
          {entries.map((entry) => (
            <li key={entry.id} className="px-4 py-3">
              <p className="text-sm">{entry.summary}</p>
              <p className="text-xs text-muted-foreground">
                {entry.actor} · {formatDateTime(entry.created_at)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
