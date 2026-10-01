"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { OFFICIAL_PAYMENT_CODES } from "@/lib/fiscal-payment";
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
      <MethodColumn title="Recebimento" hint="Aparecem na venda. O código oficial entra na nota." kind="recebimento" methods={receipts} />
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
          <MethodRow key={method.id} kind={kind} method={method} />
        ))}
      </ul>
      <MethodForm kind={kind} />
    </section>
  );
}

function MethodRow({ kind, method }: { kind: "recebimento" | "pagamento"; method: PayMethod }) {
  const [state, action, pending] = useActionState(savePaymentMethod, null as ActionState);
  const selectId = `${kind}-${method.id}-fiscal`;
  return (
    <li className="px-4 py-3 text-sm">
      <form action={action} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_16rem_auto] sm:items-center">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={method.id} />
        <input type="hidden" name="name" value={method.name} />
        {method.counts_as_cash ? <input type="hidden" name="counts_as_cash" value="on" /> : null}
        {method.settles_balance ? <input type="hidden" name="settles_balance" value="on" /> : null}
        <div>
          <p className="font-medium">{method.name}</p>
          <p className="text-xs text-muted-foreground">
            {method.counts_as_cash ? "Entra no caixa" : ""}
            {method.settles_balance ? "Abate o saldo" : ""}
            {!method.counts_as_cash && !method.settles_balance ? "Código da nota" : ""}
            {method.id === "cartao" && !method.fiscal_code ? " · crédito 03 ou débito 04" : ""}
          </p>
        </div>
        <Select id={selectId} name="fiscalCode" defaultValue={method.fiscal_code ?? ""} aria-label={`Código oficial de ${method.name}`}>
          <option value="">{kind === "recebimento" ? "Escolha o código" : "Não entra na nota"}</option>
          {OFFICIAL_PAYMENT_CODES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.code} · {item.label}
            </option>
          ))}
        </Select>
        <Button disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
      </form>
      {state?.error ? <p className="mt-2 text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="mt-2 text-sm text-emerald-700">{state.ok}</p> : null}
    </li>
  );
}

function MethodForm({ kind }: { kind: "recebimento" | "pagamento" }) {
  const [state, action, pending] = useActionState(savePaymentMethod, null as ActionState);
  return (
    <form action={action} className="grid gap-3 rounded-2xl border bg-card p-4">
      <input type="hidden" name="kind" value={kind} />
      <div className="space-y-1.5">
        <Label htmlFor={`${kind}-name`}>Nova forma</Label>
        <Input id={`${kind}-name`} name="name" required placeholder="Vale-refeição" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${kind}-fiscal`}>Código oficial</Label>
        <Select id={`${kind}-fiscal`} name="fiscalCode" defaultValue="" required={kind === "recebimento"}>
          <option value="">{kind === "recebimento" ? "Escolha o código" : "Não entra na nota"}</option>
          {OFFICIAL_PAYMENT_CODES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.code} · {item.label}
            </option>
          ))}
        </Select>
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
