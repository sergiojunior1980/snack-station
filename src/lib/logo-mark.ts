import { readableInk } from "@/lib/brand";

const WIDTH = 1280;
const HEIGHT = 360;
const SMALL_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "em", "na", "no", "para"]);

export type LogoOption = {
  id: "monograma" | "letreiro" | "faixa";
  label: string;
  file: File;
  previewUrl: string;
};

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const strong = words.filter((word) => !SMALL_WORDS.has(word.toLocaleLowerCase("pt-BR")));
  return (strong.length ? strong : words)
    .slice(0, 3)
    .map((word) => word[0]?.toLocaleUpperCase("pt-BR") ?? "")
    .join("");
}

function rgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return { red: (value >> 16) & 255, green: (value >> 8) & 255, blue: value & 255 };
}

function mix(hex: string, target: string, amount: number) {
  const from = rgb(hex);
  const to = rgb(target);
  const channel = (start: number, end: number) => Math.round(start + (end - start) * amount);
  return `#${[channel(from.red, to.red), channel(from.green, to.green), channel(from.blue, to.blue)]
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("")}`;
}

function textColor(hex: string) {
  return readableInk(hex) === "#ffffff" ? hex : mix(hex, "#1b1b1f", 0.55);
}

function font(weight: number, size: number, family: string) {
  return `${weight} ${size}px ${family}`;
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, family: string, maxSize: number, minSize: number) {
  let size = maxSize;
  ctx.font = font(700, size, family);
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = font(700, size, family);
  }
  return size;
}

function nameLines(ctx: CanvasRenderingContext2D, name: string, maxWidth: number, family: string, maxSize: number, minSize: number) {
  const single = fit(ctx, name, maxWidth, family, maxSize, minSize);
  const words = name.split(/\s+/);
  if (words.length < 2 || single >= Math.min(maxSize, 72)) return { lines: [name], size: single };
  const mid = Math.ceil(words.length / 2);
  const lines = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  const size = Math.min(
    fit(ctx, lines[0], maxWidth, family, maxSize, minSize),
    fit(ctx, lines[1], maxWidth, family, maxSize, minSize),
  );
  ctx.font = font(700, size, family);
  return { lines, size };
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  size: number,
  x: number,
  y: number,
  align: CanvasTextAlign,
  color: string,
  family: string,
) {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.font = font(700, size, family);
  const gap = size * 0.22;
  const block = lines.length * size + (lines.length - 1) * gap;
  lines.forEach((line, index) => {
    const lineY = y - block / 2 + size / 2 + index * (size + gap);
    ctx.fillText(line, x, lineY);
  });
  return block;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawMonogram(ctx: CanvasRenderingContext2D, name: string, accent: string, family: string) {
  const mark = initials(name) || "L";
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(180, 180, 132, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = readableInk(accent);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font(700, mark.length > 2 ? 72 : mark.length > 1 ? 92 : 120, family);
  ctx.fillText(mark, 180, 186);
  const laid = nameLines(ctx, name, 860, family, 78, 32);
  drawLines(ctx, laid.lines, laid.size, 352, 180, "left", textColor(accent), family);
}

function drawWordmark(ctx: CanvasRenderingContext2D, name: string, accent: string, family: string) {
  const color = textColor(accent);
  const laid = nameLines(ctx, name, 1160, family, 104, 36);
  const block = drawLines(ctx, laid.lines, laid.size, WIDTH / 2, 168, "center", color, family);
  const widest = Math.max(...laid.lines.map((line) => ctx.measureText(line).width));
  const bar = Math.max(120, Math.min(360, widest * 0.42));
  ctx.fillStyle = accent;
  roundRect(ctx, (WIDTH - bar) / 2, 168 + block / 2 + 16, bar, 14, 7);
  ctx.fill();
}

function drawBanner(ctx: CanvasRenderingContext2D, name: string, accent: string, family: string) {
  ctx.fillStyle = accent;
  roundRect(ctx, 24, 28, WIDTH - 48, HEIGHT - 56, 64);
  ctx.fill();
  const ink = readableInk(accent);
  const mark = initials(name);
  const laid = nameLines(ctx, name, 1080, family, 92, 34);
  const center = mark.length > 1 && laid.lines.length === 1 ? 196 : 180;
  drawLines(ctx, laid.lines, laid.size, WIDTH / 2, center, "center", ink, family);
  if (mark.length > 1 && laid.lines.length === 1) {
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.72;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = font(700, 28, family);
    ctx.fillText(mark.split("").join("  "), WIDTH / 2, 108);
    ctx.globalAlpha = 1;
  }
}

async function headingFamily() {
  await document.fonts.ready;
  return getComputedStyle(document.body).fontFamily || "sans-serif";
}

function pngFile(canvas: HTMLCanvasElement, name: string) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("png"));
        return;
      }
      resolve(new File([blob], name, { type: "image/png" }));
    }, "image/png");
  });
}

const drawers = [
  { id: "monograma" as const, label: "Monograma", draw: drawMonogram },
  { id: "letreiro" as const, label: "Letreiro", draw: drawWordmark },
  { id: "faixa" as const, label: "Faixa", draw: drawBanner },
];

export async function createLogoOptions(name: string, accent: string): Promise<LogoOption[]> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return [];
  const family = await headingFamily();
  const options: LogoOption[] = [];
  for (const drawer of drawers) {
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    drawer.draw(ctx, clean, accent, family);
    const file = await pngFile(canvas, `logo-${drawer.id}.png`);
    options.push({ id: drawer.id, label: drawer.label, file, previewUrl: URL.createObjectURL(file) });
  }
  return options;
}
