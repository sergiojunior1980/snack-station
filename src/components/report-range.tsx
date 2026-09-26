"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function ReportRange({ inicio, fim, visao }: { inicio: string; fim: string; visao: string }) {
  const router = useRouter();

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const query = new URLSearchParams({
          inicio: String(data.get("inicio") ?? ""),
          fim: String(data.get("fim") ?? ""),
          visao,
        });
        router.push(`/relatorios?${query.toString()}`);
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="inicio">Data início</Label>
        <Input id="inicio" name="inicio" type="date" required defaultValue={inicio} className="w-40" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="fim">Data fim</Label>
        <Input id="fim" name="fim" type="date" required defaultValue={fim} className="w-40" />
      </div>
      <Button type="submit" size="sm">Ver período</Button>
    </form>
  );
}
