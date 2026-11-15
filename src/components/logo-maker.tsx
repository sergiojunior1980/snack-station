"use client";

import { useState } from "react";
import { improveUploadedLogo } from "@/lib/logo-improve";
import { createLogoOptions, type LogoOption } from "@/lib/logo-mark";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function LogoMaker({
  shopName,
  logoFile,
  logoUrl,
  onChoose,
}: {
  shopName: string;
  logoFile: File | null;
  logoUrl: string;
  onChoose: (file: File) => void;
}) {
  const [name, setName] = useState(shopName);
  const [options, setOptions] = useState<LogoOption[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [noteTone, setNoteTone] = useState<"info" | "error">("info");
  const [busy, setBusy] = useState(false);
  const hasLogo = Boolean(logoFile) || Boolean(logoUrl);

  if (hasLogo) {
    return (
      <div className="space-y-2 rounded-xl border border-dashed p-3">
        <div>
          <p className="text-sm font-medium">Melhorar a logo</p>
          <p className="text-xs text-muted-foreground">A logo enviada continua no mesmo lugar. O sistema tira o fundo chapado e corta as sobras. As sugestões pelo nome só aparecem quando não há logo.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            const source = logoFile ?? logoUrl;
            if (!source) return;
            setBusy(true);
            setNote(null);
            void improveUploadedLogo(source)
              .then((result) => {
                setNoteTone("info");
                setNote(result.note);
                if (result.file) onChoose(result.file);
              })
              .catch(() => {
                setNoteTone("error");
                setNote("Não foi possível ler a logo. Envie o arquivo de novo para melhorar.");
              })
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Melhorando…" : "Melhorar logo"}
        </Button>
        {note ? <p className={noteTone === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{note}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-dashed p-3">
      <div>
        <Label htmlFor="logoName">Criar logo pelo nome</Label>
        <p className="text-xs text-muted-foreground">Sem logo enviada, o sistema desenha três opções com o nome e a cor dos botões.</p>
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
              setNoteTone("error");
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
                if (!next.length) {
                  setNoteTone("error");
                  setNote("Não foi possível desenhar a logo. Tente outro nome.");
                }
              })
              .catch(() => {
                setNoteTone("error");
                setNote("Não foi possível desenhar a logo. Tente outro nome.");
              })
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
                onChoose(option.file);
              }}
            >
              <img src={option.previewUrl} alt={option.label} className="h-16 w-full object-contain" />
              <span className="mt-1 block text-xs text-muted-foreground">{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      {note ? <p className={noteTone === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{note}</p> : null}
    </div>
  );
}
