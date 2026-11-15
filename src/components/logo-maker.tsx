"use client";

import { useState } from "react";
import { createLogoOptions, type LogoOption } from "@/lib/logo-mark";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function LogoMaker({
  shopName,
  onChoose,
}: {
  shopName: string;
  onChoose: (file: File, previewUrl: string) => void;
}) {
  const [name, setName] = useState(shopName);
  const [options, setOptions] = useState<LogoOption[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-2 rounded-xl border border-dashed p-3">
      <div>
        <Label htmlFor="logoName">Criar logo pelo nome</Label>
        <p className="text-xs text-muted-foreground">O sistema desenha três logos com o nome e a cor dos botões. Escolha uma e salve a aparência.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id="logoName" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Nome da empresa" />
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            const written = name.trim();
            if (!written) {
              setNote("Escreva o nome da empresa.");
              return;
            }
            const colorInput = document.getElementById("buttonColor");
            const accent = colorInput instanceof HTMLInputElement ? colorInput.value : "#b8002e";
            setBusy(true);
            setNote(null);
            void createLogoOptions(written, accent)
              .then((next) => {
                setOptions((current) => {
                  current.forEach((option) => URL.revokeObjectURL(option.previewUrl));
                  return next;
                });
                setChosen(null);
                if (!next.length) setNote("Não foi possível desenhar a logo. Tente outro nome.");
              })
              .catch(() => setNote("Não foi possível desenhar a logo. Tente outro nome."))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Criando…" : "Criar 3 opções"}
        </Button>
      </div>
      {options.length ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={cn("rounded-xl border bg-white p-2 text-left", chosen === option.id ? "border-primary ring-2 ring-primary" : "border-border")}
              onClick={() => {
                setChosen(option.id);
                onChoose(option.file, option.previewUrl);
              }}
            >
              <img src={option.previewUrl} alt={option.label} className="h-16 w-full object-contain" />
              <span className="mt-1 block text-xs text-muted-foreground">{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      {note ? <p className="text-sm text-destructive">{note}</p> : null}
    </div>
  );
}
