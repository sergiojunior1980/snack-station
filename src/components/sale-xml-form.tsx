"use client";

import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { generateSaleXml, type FiscalXmlState } from "@/server/fiscal";

export function SaleXmlForm({ inicio, fim }: { inicio: string; fim: string }) {
  const [state, action, pending] = useActionState(generateSaleXml, null as FiscalXmlState);
  const saved = useRef<FiscalXmlState>(null);

  useEffect(() => {
    if (!state?.file || saved.current === state) return;
    saved.current = state;
    const bytes = Uint8Array.from(atob(state.file.base64), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = state.file.name;
    link.click();
    URL.revokeObjectURL(url);
  }, [state]);

  return (
    <form action={action} className="space-y-3 rounded-xl border bg-card p-3">
      <input type="hidden" name="inicio" value={inicio} />
      <input type="hidden" name="fim" value={fim} />
      <p className="text-sm text-muted-foreground">
        Cada venda vira um XML. O arquivo ainda não vai assinado e ainda não foi enviado à SEFAZ.
      </p>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
      {state?.notes?.length ? (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {state.notes.map((note, index) => (
            <li key={`${index}-${note}`}>{note}</li>
          ))}
        </ul>
      ) : null}
      <Button disabled={pending}>{pending ? "Gerando…" : "Gerar XML do período"}</Button>
    </form>
  );
}
