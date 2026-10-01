"use client";

import { useActionState, useState, type ReactNode } from "react";
import {
  BRAZIL_STATES,
  CERT_MAX_BYTES,
  CERT_SIZE_ERROR,
  CERT_TYPE_ERROR,
  FISCAL_ENVIRONMENTS,
  TAX_REGIMES,
  certificateAccepted,
  formatCnpj,
  formatZip,
  type ShopFiscal,
} from "@/lib/company";
import { saveShopFiscal, type ActionState } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function Field({
  id,
  label,
  children,
  className,
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function CompanyForm({ company }: { company: ShopFiscal }) {
  const [state, action, pending] = useActionState(saveShopFiscal, null as ActionState);
  const [fileError, setFileError] = useState<string | null>(null);

  return (
    <form
      action={action}
      autoComplete="off"
      className="space-y-4 rounded-2xl border bg-card p-4"
      onSubmit={(event) => {
        if (fileError) event.preventDefault();
      }}
    >
      <section className="space-y-3">
        <h2 className="font-heading text-base">Identificação</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="legalName" label="Razão social">
            <Input id="legalName" name="legalName" maxLength={60} defaultValue={company.legalName} required />
          </Field>
          <Field id="tradeName" label="Nome fantasia">
            <Input id="tradeName" name="tradeName" maxLength={60} defaultValue={company.tradeName} required />
          </Field>
          <Field id="cnpj" label="CNPJ">
            <Input id="cnpj" name="cnpj" inputMode="numeric" maxLength={18} defaultValue={formatCnpj(company.cnpj)} required />
          </Field>
          <Field id="stateRegistration" label="Inscrição estadual">
            <Input id="stateRegistration" name="stateRegistration" maxLength={14} defaultValue={company.stateRegistration} placeholder="ISENTO" required />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-base">Endereço</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="street" label="Logradouro" className="sm:col-span-2">
            <Input id="street" name="street" maxLength={60} defaultValue={company.street} required />
          </Field>
          <Field id="number" label="Número">
            <Input id="number" name="number" maxLength={60} defaultValue={company.number} required />
          </Field>
          <Field id="complement" label="Complemento">
            <Input id="complement" name="complement" maxLength={60} defaultValue={company.complement} />
          </Field>
          <Field id="district" label="Bairro">
            <Input id="district" name="district" maxLength={60} defaultValue={company.district} required />
          </Field>
          <Field id="cityName" label="Município">
            <Input id="cityName" name="cityName" maxLength={60} defaultValue={company.cityName} required />
          </Field>
          <Field id="cityCode" label="Município (IBGE)">
            <Input id="cityCode" name="cityCode" inputMode="numeric" maxLength={7} defaultValue={company.cityCode} required />
          </Field>
          <Field id="state" label="UF">
            <Select id="state" name="state" defaultValue={company.state}>
              {BRAZIL_STATES.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="zip" label="CEP">
            <Input id="zip" name="zip" inputMode="numeric" maxLength={9} defaultValue={formatZip(company.zip)} required />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-base">Nota fiscal</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="crt" label="Regime tributário">
            <Select id="crt" name="crt" defaultValue={String(company.crt)}>
              {TAX_REGIMES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="environment" label="Ambiente">
            <Select id="environment" name="environment" defaultValue={company.environment}>
              {FISCAL_ENVIRONMENTS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="nfceSeries" label="Série da NFC-e">
            <Input id="nfceSeries" name="nfceSeries" inputMode="numeric" defaultValue={company.nfceSeries} required />
          </Field>
          <Field id="nfceNextNumber" label="Próximo número da NFC-e">
            <Input id="nfceNextNumber" name="nfceNextNumber" inputMode="numeric" defaultValue={company.nfceNextNumber} required />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">Homologação é o teste da SEFAZ. Produção emite a nota que vale para o imposto.</p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-base">CSC da NFC-e</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="cscId" label="Identificador CSC">
            <Input id="cscId" name="cscId" inputMode="numeric" maxLength={6} defaultValue={company.cscId} autoComplete="off" />
          </Field>
          <Field id="cscToken" label="Token CSC">
            <Input id="cscToken" name="cscToken" type="password" maxLength={36} autoComplete="new-password" />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          {company.cscConfigured
            ? "Token já cadastrado. Preencha de novo só para trocar. O valor não volta para esta tela."
            : "O token não volta para esta tela depois de salvo."}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-base">Certificado digital A1</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="certificate" label="Arquivo PFX ou P12">
            <Input
              id="certificate"
              name="certificate"
              type="file"
              accept=".pfx,.p12,application/x-pkcs12,application/pkcs12"
              onChange={(event) => {
                const input = event.currentTarget;
                const file = input.files?.[0];
                if (!file) {
                  setFileError(null);
                  return;
                }
                if (file.size > CERT_MAX_BYTES) {
                  input.value = "";
                  setFileError(CERT_SIZE_ERROR);
                  return;
                }
                void file.slice(0, 4).arrayBuffer().then((buffer) => {
                  if (!certificateAccepted(file.name, new Uint8Array(buffer))) {
                    input.value = "";
                    setFileError(CERT_TYPE_ERROR);
                    return;
                  }
                  setFileError(null);
                });
              }}
            />
          </Field>
          <Field id="certificatePassword" label="Senha do certificado">
            <Input id="certificatePassword" name="certificatePassword" type="password" maxLength={64} autoComplete="new-password" />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          {company.certificateConfigured
            ? "Certificado já enviado. Envie outro arquivo só para trocar. A senha não volta para esta tela."
            : "Arquivo de até 100 KB. A senha fica guardada para a assinatura e não volta para esta tela."}
        </p>
      </section>

      {fileError && !state?.ok ? <p className="text-sm text-destructive">{fileError}</p> : null}
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
      <Button disabled={pending}>{pending ? "Salvando…" : "Salvar empresa"}</Button>
    </form>
  );
}
