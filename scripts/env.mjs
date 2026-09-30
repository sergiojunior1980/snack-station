import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const activePath = resolve(root, ".env.local");
const localPath = resolve(root, ".env.development");
const productionPath = resolve(root, ".env.production");

const targets = {
  local: { label: "locais", path: localPath, file: ".env.development" },
  producao: { label: "de produção", path: productionPath, file: ".env.production" },
};

const aliases = {
  local: "local",
  producao: "producao",
  produção: "producao",
  production: "producao",
  prod: "producao",
};

const arg = (process.argv[2] ?? "").trim().toLowerCase();

if (arg === "help" || arg === "--help" || arg === "-h") {
  console.log(`Uso:
  pnpm env:status       mostra qual conjunto está ativo
  pnpm env:local        carrega .env.development em .env.local
  pnpm env:producao     carrega .env.production em .env.local

O Next só lê o arquivo na hora em que o servidor sobe. Depois da troca, pare e rode pnpm dev de novo.`);
  process.exit(0);
}

if (arg && !aliases[arg]) {
  console.error(`Não conheço "${process.argv[2]}". Use local ou producao.`);
  process.exit(1);
}

const chosen = arg ? aliases[arg] : null;

if (chosen && !existsSync(localPath)) keepLocalCopy();
if (chosen) activate(chosen);
printStatus();

function activate(name) {
  const target = targets[name];
  if (!existsSync(target.path)) {
    console.error(`Falta ${target.file}. Crie esse arquivo com NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY e rode de novo.`);
    process.exit(1);
  }
  const url = requireUrl(target.path, target.file);
  copyFileSync(target.path, activePath);
  console.log(`Credenciais ${target.label} copiadas para .env.local (${url}).`);
  console.log("Pare o servidor e rode pnpm dev de novo para ele passar a usar esse arquivo.");
}

function printStatus() {
  const activeUrl = existsSync(activePath) ? urlOf(readFileSync(activePath, "utf8")) : "";
  const local = existsSync(localPath);
  const production = existsSync(productionPath);
  const matchesLocal = local && sameFile(activePath, localPath);
  const matchesProduction = production && sameFile(activePath, productionPath);

  if (!existsSync(activePath)) {
    console.log("Nenhum .env.local. Rode pnpm env:local ou pnpm env:producao.");
    return;
  }
  if (matchesLocal && matchesProduction) {
    console.log(`Ativo: os dois arquivos são iguais (${activeUrl}).`);
    return;
  }
  if (matchesLocal) {
    console.log(`Ativo: local (${activeUrl}).`);
    return;
  }
  if (matchesProduction) {
    console.log(`Ativo: produção (${activeUrl}).`);
    return;
  }
  console.log(`Ativo: .env.local (${activeUrl || "sem URL"}), diferente de .env.development e de .env.production.`);
  if (!local) console.log("Ainda não existe .env.development. Rode pnpm env:producao uma vez para guardar a cópia local antes de trocar.");
  if (!production) console.log("Ainda não existe .env.production.");
}

function keepLocalCopy() {
  if (!existsSync(activePath)) {
    console.error("Não achei .env.local para guardar as credenciais locais. Crie .env.development antes de trocar.");
    process.exit(1);
  }
  requireUrl(activePath, ".env.local");
  const temporary = `${localPath}.tmp`;
  copyFileSync(activePath, temporary);
  try {
    copyFileSync(temporary, localPath);
  } finally {
    rmSync(temporary, { force: true });
  }
  console.log("Guardei as credenciais atuais em .env.development.");
}

function requireUrl(path, file) {
  const text = readFileSync(path, "utf8");
  const url = urlOf(text);
  const key = valueOf(text, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !key) {
    console.error(`${file} precisa ter NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.`);
    process.exit(1);
  }
  return url;
}

function urlOf(text) {
  return valueOf(text, "NEXT_PUBLIC_SUPABASE_URL");
}

function valueOf(text, name) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1 || trimmed.slice(0, eq) !== name) continue;
    return trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return "";
}

function sameFile(left, right) {
  return createHash("sha256").update(readFileSync(left)).digest("hex") === createHash("sha256").update(readFileSync(right)).digest("hex");
}
