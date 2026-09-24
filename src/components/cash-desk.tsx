"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { formatDateTime } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { closeCashSession, openCashSession, registerCashMovement, type ActionState } from "@/server/actions";
import type { CashSession } from "@/server/queries";

export function CashDesk({
  open,
  expectedCents,
  recent,
}: {
  open: CashSession | null;
  expectedCents: number;
  recent: CashSession[];
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <h2 className="font-heading text-2xl">{open ? "Caixa aberto" : "Abrir caixa"}</h2>
        {open ? (
          <CloseForm open={open} expectedCents={expectedCents} />
        ) : (
          <OpenForm />
        )}
      </div>
      <MovementForm />
      {recent.length > 0 ? (
        <div className="space-y-3 lg:col-span-2">
          <h2 className="font-heading text-2xl">Fechamentos</h2>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {recent.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">
                    Contado {formatBRL(session.counted_cents ?? 0)} · esperado {formatBRL(session.expected_cents ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {session.closed_at ? formatDateTime(session.closed_at) : ""}
                    {session.closing_note ? ` · ${session.closing_note}` : ""}
                  </p>
                </div>
                <p className={`text-sm font-medium ${(session.difference_cents ?? 0) < 0 ? "text-destructive" : "text-primary"}`}>
                  {(session.difference_cents ?? 0) > 0 ? "+" : ""}
                  {formatBRL(session.difference_cents ?? 0)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function OpenForm() {
  const [state, action, pending] = useActionState(openCashSession, null as ActionState);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <p className="text-sm text-muted-foreground sm:col-span-2">Informe o troco que está na gaveta no começo do turno.</p>
      <div className="space-y-1.5">
        <Label htmlFor="opening-amount">Valor de abertura</Label>
        <Input id="opening-amount" name="amount" required placeholder="50,00" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="opening-note">Observação</Label>
        <Input id="opening-note" name="note" placeholder="Turno da manhã" />
      </div>
      {state?.error ? <p className="text-sm text-destructive sm:col-span-2">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700 sm:col-span-2">{state.ok}</p> : null}
      <Button disabled={pending}>{pending ? "Abrindo…" : "Abrir caixa"}</Button>
    </form>
  );
}

function CloseForm({ open, expectedCents }: { open: CashSession; expectedCents: number }) {
  const [state, action, pending] = useActionState(closeCashSession, null as ActionState);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <p className="text-sm text-muted-foreground sm:col-span-2">
        Aberto em {formatDateTime(open.opened_at)} com {formatBRL(open.opening_cents)}. O esperado junta esse fundo, as vendas em dinheiro e as entradas e retiradas desde a abertura.
      </p>
      <p className="font-heading text-2xl sm:col-span-2">{formatBRL(expectedCents)}</p>
      <div className="space-y-1.5">
        <Label htmlFor="counted">Valor contado</Label>
        <Input id="counted" name="amount" required placeholder="0,00" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="closing-note">Observação</Label>
        <Input id="closing-note" name="note" placeholder="Diferença conferida" />
      </div>
      {state?.error ? <p className="text-sm text-destructive sm:col-span-2">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700 sm:col-span-2">{state.ok}</p> : null}
      <Button disabled={pending}>{pending ? "Fechando…" : "Fechar caixa"}</Button>
    </form>
  );
}

function MovementForm() {
  const [state, action, pending] = useActionState(registerCashMovement, null as ActionState);
  return (
    <form action={action} className="space-y-3 rounded-2xl border bg-card p-5">
      <h2 className="font-heading text-2xl">Entrada e retirada</h2>
      <p className="text-sm text-muted-foreground">Pode ser lançada com o caixa aberto ou fechado. A observação é obrigatória.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="kind">Tipo</Label>
          <Select id="kind" name="kind" defaultValue="entrada">
            <option value="entrada">Entrada</option>
            <option value="retirada">Retirada</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="movement-amount">Valor</Label>
          <Input id="movement-amount" name="amount" required placeholder="20,00" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="movement-note">Observação</Label>
          <Input id="movement-note" name="note" required placeholder="Por que esse valor entrou ou saiu" />
        </div>
      </div>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
      <Button disabled={pending}>{pending ? "Lançando…" : "Lançar movimento"}</Button>
    </form>
  );
}
