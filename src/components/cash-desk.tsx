"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { printCashSlip, type CashSlip } from "@/lib/cash-slip";
import { formatDateTime } from "@/lib/dates";
import { centsToInput, formatBRL } from "@/lib/money";
import { closeCashSession, correctCashSession, openCashSession, registerCashMovement, type ActionState } from "@/server/actions";
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
  const [closeState, closeAction, closing] = useActionState(closeCashSession, null as ActionState);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const slip = closeState?.slip;
  const askPrint = Boolean(slip && dismissed !== slip.id);

  return (
    <>
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <h2 className="font-heading text-2xl">{open ? "Caixa aberto" : "Abrir caixa"}</h2>
        {open ? (
          <>
            <CloseForm open={open} expectedCents={expectedCents} action={closeAction} pending={closing} error={closeState?.error} />
            <CorrectOpening sessionId={open.id} openingCents={open.opening_cents} />
          </>
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
              <li key={session.id} className="space-y-3 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
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
                </div>
                <CorrectClosed session={session} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
    {askPrint && slip ? <PrintAsk slip={slip} onDone={() => setDismissed(slip.id)} /> : null}
    </>
  );
}

function PrintAsk({ slip, onDone }: { slip: CashSlip; onDone: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-card p-5 shadow-lg">
        <p className="font-heading text-xl">Imprimir o fechamento?</p>
        <p className="text-sm text-muted-foreground">O comprovante discrimina o faturamento do turno por forma de pagamento, os valores do caixa e um espaço para assinatura.</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => {
              printCashSlip(slip);
              onDone();
            }}
          >
            Imprimir
          </Button>
          <Button type="button" variant="outline" onClick={onDone}>
            Agora não
          </Button>
        </div>
      </div>
    </div>
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
      <Button className="sm:col-span-2" disabled={pending}>{pending ? "Abrindo…" : "Abrir caixa"}</Button>
    </form>
  );
}

function CloseForm({
  open,
  expectedCents,
  action,
  pending,
  error,
}: {
  open: CashSession;
  expectedCents: number;
  action: (payload: FormData) => void;
  pending: boolean;
  error?: string;
}) {
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
      {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
      <Button className="sm:col-span-2" disabled={pending}>{pending ? "Fechando…" : "Fechar caixa"}</Button>
    </form>
  );
}

function CorrectOpening({ sessionId, openingCents }: { sessionId: string; openingCents: number }) {
  const [state, action, pending] = useActionState(correctCashSession, null as ActionState);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant="outline" className="sm:col-span-2" onClick={() => setOpen(true)}>
        Corrigir fundo de troco
      </Button>
    );
  }
  return (
    <form action={action} className="grid gap-3 rounded-xl bg-muted p-3 sm:col-span-2 sm:grid-cols-2">
      <input type="hidden" name="sessionId" value={sessionId} />
      <p className="text-sm text-muted-foreground sm:col-span-2">O valor esperado usa esse fundo. Corrigir aqui acerta o caixa sem abrir outro turno.</p>
      <div className="space-y-1.5">
        <Label htmlFor={`opening-${sessionId}`}>Fundo de troco</Label>
        <Input id={`opening-${sessionId}`} name="opening" required defaultValue={centsToInput(openingCents)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`opening-note-${sessionId}`}>Observação</Label>
        <Input id={`opening-note-${sessionId}`} name="note" placeholder="Valor digitado errado" />
      </div>
      {state?.error ? <p className="text-sm text-destructive sm:col-span-2">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700 sm:col-span-2">{state.ok}</p> : null}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button disabled={pending}>{pending ? "Corrigindo…" : "Salvar correção"}</Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </form>
  );
}

function CorrectClosed({ session }: { session: CashSession }) {
  const [state, action, pending] = useActionState(correctCashSession, null as ActionState);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Corrigir valores
      </Button>
    );
  }
  return (
    <form action={action} className="grid gap-3 rounded-xl bg-muted p-3 sm:grid-cols-2">
      <input type="hidden" name="sessionId" value={session.id} />
      <p className="text-sm text-muted-foreground sm:col-span-2">Ajuste o fundo de troco ou o valor contado. A diferença é recalculada.</p>
      <div className="space-y-1.5">
        <Label htmlFor={`closed-opening-${session.id}`}>Fundo de troco</Label>
        <Input id={`closed-opening-${session.id}`} name="opening" required defaultValue={centsToInput(session.opening_cents)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`closed-counted-${session.id}`}>Valor contado</Label>
        <Input id={`closed-counted-${session.id}`} name="counted" required defaultValue={centsToInput(session.counted_cents ?? 0)} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`closed-note-${session.id}`}>Observação</Label>
        <Input id={`closed-note-${session.id}`} name="note" placeholder="Conferência do valor" />
      </div>
      {state?.error ? <p className="text-sm text-destructive sm:col-span-2">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700 sm:col-span-2">{state.ok}</p> : null}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button size="sm" disabled={pending}>{pending ? "Corrigindo…" : "Salvar correção"}</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </form>
  );
}

function MovementForm() {
  const [state, action, pending] = useActionState(registerCashMovement, null as ActionState);
  return (
    <form action={action} className="space-y-3 rounded-2xl border bg-card p-5">
      <h2 className="font-heading text-lg">Entrada e saída</h2>
      <p className="text-sm text-muted-foreground">Pode ser lançada com o caixa aberto ou fechado. A observação é obrigatória.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="kind">Tipo</Label>
          <Select id="kind" name="kind" defaultValue="entrada">
            <option value="entrada">Entrada</option>
            <option value="retirada">Saída</option>
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
