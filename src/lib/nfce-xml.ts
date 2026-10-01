import { createHash } from "node:crypto";
import type { ShopFiscal } from "@/lib/company";

const UF_CODE: Record<string, string> = {
  AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23", DF: "53", ES: "32", GO: "52",
  MA: "21", MT: "51", MS: "50", MG: "31", PA: "15", PB: "25", PR: "41", PE: "26", PI: "22",
  RJ: "33", RN: "24", RS: "43", RO: "11", RR: "14", SC: "42", SP: "35", SE: "28", TO: "17",
};

const QR_URL: Record<string, { prod: string; hom: string; consulta: string }> = {
  SP: {
    prod: "https://www.nfce.fazenda.sp.gov.br/qrcode",
    hom: "https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode",
    consulta: "https://www.nfce.fazenda.sp.gov.br/consulta",
  },
};

const CARD_CODES = new Set(["03", "04", "10", "11", "12", "13"]);

export type NfceItem = {
  name: string;
  ncm: string;
  cfop: string;
  taxCode: string;
  origin: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
};

export type NfcePayment = { code: string; cents: number };

export type NfceDraft = {
  series: number;
  number: number;
  code: string;
  emittedAt: Date;
  items: NfceItem[];
  payments: NfcePayment[];
};

export function companyFiscalGaps(company: ShopFiscal) {
  const gaps: string[] = [];
  if (company.legalName.trim().length < 2) gaps.push("razão social");
  if (company.cnpj.replace(/\D/g, "").length !== 14) gaps.push("CNPJ");
  if (!company.stateRegistration.trim()) gaps.push("inscrição estadual");
  if (company.street.trim().length < 2 || !company.number.trim() || company.district.trim().length < 2) gaps.push("endereço");
  if (company.cityName.trim().length < 2 || !/^\d{7}$/.test(company.cityCode)) gaps.push("município");
  if (!UF_CODE[company.state]) gaps.push("UF");
  if (!/^\d{8}$/.test(company.zip)) gaps.push("CEP");
  if (![1, 2, 3].includes(company.crt)) gaps.push("regime");
  if (company.nfceSeries < 1) gaps.push("série da NFC-e");
  if (!company.cscId.trim() || !company.cscConfigured) gaps.push("CSC");
  return gaps;
}

export function accessKeyDigit(base: string) {
  let weight = 2;
  let sum = 0;
  for (let index = base.length - 1; index >= 0; index -= 1) {
    sum += Number(base[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const mod = sum % 11;
  return mod === 0 || mod === 1 ? 0 : 11 - mod;
}

export function nfceCode(seed: string, number: number) {
  let hash = 0;
  for (const char of seed) hash = (Math.imul(hash, 33) + char.charCodeAt(0)) >>> 0;
  let value = (hash % 99_999_999) + 1;
  if (value === number) value = (value % 99_999_998) + 1;
  return String(value).padStart(8, "0");
}

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

function saoPauloStamp(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}:${pick("second")}-03:00`;
}

function taxGroup(crt: number, item: NfceItem) {
  if (crt === 1 || crt === 2) {
    if (item.taxCode === "500") {
      return `<ICMSSN500><orig>${item.origin}</orig><CSOSN>500</CSOSN><vBCSTRet>0.00</vBCSTRet><pST>0.0000</pST><vICMSSubstituto>0.00</vICMSSubstituto><vICMSSTRet>0.00</vICMSSTRet></ICMSSN500>`;
    }
    return `<ICMSSN102><orig>${item.origin}</orig><CSOSN>${item.taxCode}</CSOSN></ICMSSN102>`;
  }
  return `<ICMS40><orig>${item.origin}</orig><CST>${item.taxCode}</CST></ICMS40>`;
}

export function buildNfceXml(company: ShopFiscal, cscToken: string, draft: NfceDraft) {
  const cnpj = company.cnpj.replace(/\D/g, "");
  const uf = UF_CODE[company.state];
  const emitted = saoPauloStamp(draft.emittedAt);
  const yearMonth = emitted.slice(2, 4) + emitted.slice(5, 7);
  const base = [
    uf,
    yearMonth,
    cnpj,
    "65",
    String(draft.series).padStart(3, "0"),
    String(draft.number).padStart(9, "0"),
    "1",
    draft.code,
  ].join("");
  const key = `${base}${accessKeyDigit(base)}`;
  const total = draft.items.reduce((sum, item) => sum + item.totalCents, 0);
  const tpAmb = company.environment === "producao" ? "1" : "2";
  const items = draft.items.map((item, index) => {
    return `<det nItem="${index + 1}"><prod><cProd>${xml(String(index + 1))}</cProd><cEAN>SEM GTIN</cEAN><xProd>${xml(item.name.slice(0, 120))}</xProd><NCM>${item.ncm}</NCM><CFOP>${item.cfop}</CFOP><uCom>UN</uCom><qCom>${item.quantity.toFixed(4)}</qCom><vUnCom>${money(item.unitCents)}</vUnCom><vProd>${money(item.totalCents)}</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>UN</uTrib><qTrib>${item.quantity.toFixed(4)}</qTrib><vUnTrib>${money(item.unitCents)}</vUnTrib><indTot>1</indTot></prod><imposto><ICMS>${taxGroup(company.crt, item)}</ICMS><PIS><PISOutr><CST>49</CST><vBC>0.00</vBC><pPIS>0.0000</pPIS><vPIS>0.00</vPIS></PISOutr></PIS><COFINS><COFINSOutr><CST>49</CST><vBC>0.00</vBC><pCOFINS>0.0000</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS></imposto></det>`;
  }).join("");
  const payments = draft.payments.map((payment) => {
    const card = CARD_CODES.has(payment.code) ? "<card><tpIntegra>2</tpIntegra></card>" : "";
    return `<detPag><indPag>0</indPag><tPag>${payment.code}</tPag><vPag>${money(payment.cents)}</vPag>${card}</detPag>`;
  }).join("");
  const qr = qrCode(company, cscToken, key, tpAmb);
  const extra = qr
    ? `<infNFeSupl><qrCode>${xml(qr.url)}</qrCode><urlChave>${xml(qr.consulta)}</urlChave></infNFeSupl>`
    : "";
  const body = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe versao="4.00" Id="NFe${key}">` +
    `<ide><cUF>${uf}</cUF><cNF>${draft.code}</cNF><natOp>VENDA AO CONSUMIDOR</natOp><mod>65</mod><serie>${draft.series}</serie><nNF>${draft.number}</nNF><dhEmi>${emitted}</dhEmi><tpNF>1</tpNF><idDest>1</idDest><cMunFG>${company.cityCode}</cMunFG><tpImp>4</tpImp><tpEmis>1</tpEmis><cDV>${key.slice(-1)}</cDV><tpAmb>${tpAmb}</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>SnackStation</verProc></ide>` +
    `<emit><CNPJ>${cnpj}</CNPJ><xNome>${xml(company.legalName.slice(0, 60))}</xNome><xFant>${xml(company.tradeName.slice(0, 60))}</xFant><enderEmit><xLgr>${xml(company.street.slice(0, 60))}</xLgr><nro>${xml(company.number.slice(0, 60))}</nro>${company.complement ? `<xCpl>${xml(company.complement.slice(0, 60))}</xCpl>` : ""}<xBairro>${xml(company.district.slice(0, 60))}</xBairro><cMun>${company.cityCode}</cMun><xMun>${xml(company.cityName.slice(0, 60))}</xMun><UF>${company.state}</UF><CEP>${company.zip}</CEP><cPais>1058</cPais><xPais>BRASIL</xPais></enderEmit><IE>${xml(company.stateRegistration)}</IE><CRT>${company.crt}</CRT></emit>` +
    items +
    `<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${money(total)}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${money(total)}</vNF></ICMSTot></total>` +
    `<transp><modFrete>9</modFrete></transp>` +
    `<pag>${payments}</pag>` +
    `</infNFe>${extra}</NFe>`;
  return { key, xml: body, qr: Boolean(qr) };
}

function qrCode(company: ShopFiscal, cscToken: string, key: string, tpAmb: string) {
  const urls = QR_URL[company.state];
  if (!urls || !cscToken) return null;
  const tokenId = company.cscId.replace(/\D/g, "").padStart(6, "0");
  const base = `${key}|2|${tpAmb}|${Number(tokenId)}`;
  const hash = createHash("sha1").update(`${base}${cscToken}`).digest("hex");
  return {
    url: `${company.environment === "producao" ? urls.prod : urls.hom}?p=${base}|${hash}`,
    consulta: urls.consulta,
  };
}
