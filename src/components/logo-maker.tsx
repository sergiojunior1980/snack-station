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
  onClear,
}: {
  shopName: string;
  logoFile: File | null;
  logoUrl: string;
  onChoose: (file: File) => void;
  onClear?: () => void;
}) {
  const [draft, setDraft] = useState<{ file: File; url: string } | null>(null);
  const [applied, setApplied] = useState(false);
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
          <p className="text-xs text-muted-foreground">O sistema lê a logo, aumenta o que estiver pequeno e mostra uma prévia grande. A logo da loja só muda se você usar essa versão e salvar.</p>
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
            setApplied(false);
            onClear?.();
            void improveUploadedLogo(source)
              .then((result) => {
                if (!result.file) {
                  setNoteTone("error");
                  setNote(result.note);
                  return;
                }
                setDraft((current) => {
                  if (current) URL.revokeObjectURL(current.url);
                  return { file: result.file as File, url: URL.createObjectURL(result.file as File) };
                });
                setNoteTone("info");
                setNote("Esta é só a prévia. A logo do sistema continua a atual até você usar esta versão e salvar.");
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
        {draft ? (
          <div className="space-y-3">
            <div className="rounded-2xl border bg-white p-4">
              <p className="mb-2 text-xs text-muted-foreground">Logo melhorada</p>
              <img src={draft.url} alt="Prévia da logo melhorada" className="mx-auto h-56 w-full object-contain" />
            </div>
            <div className="rounded-xl border bg-card px-4 py-3">
              <p className="mb-2 text-xs text-muted-foreground">Como fica no sistema</p>
              <img src={draft.url} alt="Prévia no cabeçalho" className="h-14 max-w-[13rem] object-contain" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => {
                  onChoose(draft.file);
                  setApplied(true);
                  setNoteTone("info");
                  setNote("Prévia confirmada. Salve a aparência para aplicar no sistema.");
                }}
              >
                Usar esta logo
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDraft((current) => {
                    if (current) URL.revokeObjectURL(current.url);
                    return null;
                  });
                  setApplied(false);
                  setNote(null);
                  onClear?.();
                }}
              >
                Descartar
              </Button>
            </div>
            {applied ? null : <p className="text-xs text-muted-foreground">Ainda não alterou a logo da loja.</p>}
          </div>
        ) : null}
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
