"use client";

import { useRouter } from "next/navigation";
import { Combobox } from "@/components/ui/combobox";

const base = "/relatorios/financeiro/caixa";

export function CashSessionPicker({
  closed,
  selectedId,
  hasOpen,
}: {
  closed: { id: string; label: string }[];
  selectedId: string;
  hasOpen: boolean;
}) {
  const router = useRouter();
  const options = [...(hasOpen ? [{ value: "atual", label: "Caixa atual" }] : []), ...closed.map((session) => ({ value: session.id, label: session.label }))];

  return (
    <div className="max-w-md">
      <Combobox
        name="caixa"
        label="Caixa"
        options={options}
        value={selectedId}
        onChange={(id) => {
          if (!id || id === "atual") router.push(base);
          else router.push(`${base}?caixa=${id}`);
        }}
        placeholder={hasOpen ? "Caixa atual" : "Escolha um caixa fechado"}
        searchPlaceholder="Buscar caixa fechado"
        emptyLabel="Nenhum caixa fechado encontrado."
      />
    </div>
  );
}
