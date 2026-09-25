"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { savePaymentMethod, type ActionState } from "@/server/actions";
import type { PayMethod } from "@/server/queries";

export function PaymentMethodManager({
  receipts,
  payments,
}: {
  receipts: (PayMethod & { active?: boolean })[];
  payments: (PayMethod & { active?: boolean })[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <MethodColumn title="Recebimento" hint="Aparecem na venda." kind="recebimento" methods={receipts} />
      <MethodColumn title="Pagamento" hint="Aparecem na compra." kind="pagamento" methods={payments} />
    </div>
  );
}

function MethodColumn({
  title,
  hint,
  kind,
  methods,
}: {
  title: string;
  hint: string;
  kind: "recebimento" | "pagamento";
  methods: (PayMethod & { active?: boolean })[];
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-heading text-2xl">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {methods.map((method) => (
          <li key={method.id} className="px-4 py-3 text-sm">
            {method.name}
            {method.counts_as_cash ? " · entra no caixa" : ""}
            {method.settles_balance ? " · abate o saldo" : ""}
          </li>
        ))}
      </ul>
      <MethodForm kind={kind} />
    </section>
  );
}

function MethodForm({ kind }: { kind: "recebimento" | "pagamento" }) {
  const [state, action, pending] = useActionState(savePaymentMethod, null as ActionState);
  const [name, setName] = useState("");
  return (
    <form action={action} className="grid gap-3 rounded-2xl border bg-card p-4">
      <input type="hidden" name="kind" value={kind} />
      <div className="space-y-1.5">
        <Label htmlFor={`${kind}-name`}>Nova forma</Label>
        <Input id={`${kind}-name`} name="name" value={name} onChange={(event) => setName(event.target.value)} required placeholder="Vale-refeição" />
      </div>
      {kind === "recebimento" ? (
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="counts_as_cash" className="mr-3 size-4 shrink-0 accent-primary" />
          Entra no dinheiro do caixa
        </label>
      ) : (
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="settles_balance" className="mr-3 size-4 shrink-0 accent-primary" />
          Abate o saldo da conta corrente
        </label>
      )}
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
      <Button disabled={pending}>{pending ? "Salvando…" : "Cadastrar"}</Button>
    </form>
  );
}
