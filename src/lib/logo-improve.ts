const MAX_SIDE = 1400;

export type ImprovedLogo = {
  file: File | null;
  note: string;
};

function sampleEdge(data: Uint8ClampedArray, width: number, height: number) {
  const indexes: number[] = [];
  const stepX = Math.max(1, Math.floor(width / 48));
  const stepY = Math.max(1, Math.floor(height / 48));
  const take = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    if (data[index + 3] < 220) return;
    indexes.push(index);
  };
  for (let x = 0; x < width; x += stepX) {
    take(x, 0);
    take(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    take(0, y);
    take(width - 1, y);
  }
  if (indexes.length < 8) return null;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const index of indexes) {
    red += data[index];
    green += data[index + 1];
    blue += data[index + 2];
  }
  red /= indexes.length;
  green /= indexes.length;
  blue /= indexes.length;
  let variance = 0;
  for (const index of indexes) {
    variance += (data[index] - red) ** 2 + (data[index + 1] - green) ** 2 + (data[index + 2] - blue) ** 2;
  }
  if (variance / indexes.length > 35 * 35) return null;
  return { red, green, blue };
}

function closeTo(data: Uint8ClampedArray, index: number, color: { red: number; green: number; blue: number }) {
  if (data[index + 3] < 16) return true;
  const distance = (data[index] - color.red) ** 2 + (data[index + 1] - color.green) ** 2 + (data[index + 2] - color.blue) ** 2;
  return distance <= 40 * 40;
}

function clearFlatBackground(data: Uint8ClampedArray, width: number, height: number, color: { red: number; green: number; blue: number }) {
  const seen = new Uint8Array(width * height);
  const queue: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (seen[pixel]) return;
    if (!closeTo(data, pixel * 4, color)) return;
    seen[pixel] = 1;
    queue.push(pixel);
  };
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const pixel = queue[cursor];
    const x = pixel % width;
    const y = (pixel - x) / width;
    data[pixel * 4 + 3] = 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return queue.length;
}

function contentBounds(data: Uint8ClampedArray, width: number, height: number) {
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 16) continue;
      count += 1;
      if (x < left) left = x;
      if (y < top) top = y;
      if (x + 1 > right) right = x + 1;
      if (y + 1 > bottom) bottom = y + 1;
    }
  }
  if (!count || right <= left || bottom <= top) return null;
  return { left, top, right, bottom, count };
}

function opaqueCount(data: Uint8ClampedArray) {
  let count = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] >= 16) count += 1;
  }
  return count;
}

function paint(color: { red: number; green: number; blue: number }) {
  return `rgb(${Math.round(color.red)} ${Math.round(color.green)} ${Math.round(color.blue)})`;
}

function palette(data: Uint8ClampedArray) {
  const buckets = new Map<string, { count: number; red: number; green: number; blue: number; score: number; light: number }>();
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 140) continue;
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const light = (red + green + blue) / 3;
    if (light < 14 || light > 246) continue;
    const saturation = max === 0 ? 0 : (max - min) / max;
    const key = `${red >> 4}-${green >> 4}-${blue >> 4}`;
    const current = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0, score: 0, light: 0 };
    current.count += 1;
    current.red += red;
    current.green += green;
    current.blue += blue;
    current.score += saturation;
    current.light += light;
    buckets.set(key, current);
  }
  const ranked = [...buckets.values()].filter((bucket) => bucket.count > 8);
  const accentBucket = [...ranked].sort((a, b) => b.score - a.score)[0];
  const inkBucket = [...ranked].sort((a, b) => a.light / a.count - b.light / b.count)[0];
  const fallback = { red: 184, green: 0, blue: 46 };
  const from = (bucket: typeof accentBucket | undefined) => bucket
    ? { red: bucket.red / bucket.count, green: bucket.green / bucket.count, blue: bucket.blue / bucket.count }
    : fallback;
  return { accent: from(accentBucket), ink: from(inkBucket ?? accentBucket) };
}

function projection(data: Uint8ClampedArray, width: number, bounds: { left: number; top: number; right: number; bottom: number }, axis: "x" | "y") {
  const length = axis === "x" ? bounds.right - bounds.left : bounds.bottom - bounds.top;
  const counts = new Array<number>(length).fill(0);
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 20) continue;
      counts[axis === "x" ? x - bounds.left : y - bounds.top] += 1;
    }
  }
  return counts;
}

function splitGap(counts: number[]) {
  const peak = Math.max(...counts, 1);
  const quiet = peak * 0.06;
  const startMin = Math.floor(counts.length * 0.16);
  const endMax = Math.ceil(counts.length * 0.84);
  let best: { at: number; length: number } | null = null;
  let run = 0;
  let runStart = 0;
  const consider = (from: number, length: number) => {
    if (length < counts.length * 0.045 || from < startMin || from + length > endMax) return;
    if (!best || length > best.length) best = { at: from, length };
  };
  for (let index = 0; index <= counts.length; index += 1) {
    if (index < counts.length && counts[index] <= quiet) {
      if (run === 0) runStart = index;
      run += 1;
      continue;
    }
    if (run > 0) consider(runStart, run);
    run = 0;
  }
  if (!best) return null;
  const gap: { at: number; length: number } = best;
  const before = counts.slice(0, gap.at).reduce((sum, value) => sum + value, 0);
  const after = counts.slice(gap.at + gap.length).reduce((sum, value) => sum + value, 0);
  if (before < peak * 3 || after < peak * 3) return null;
  return gap;
}

function scan(data: Uint8ClampedArray, width: number, box: { left: number; top: number; right: number; bottom: number }) {
  let left = box.right;
  let top = box.bottom;
  let right = box.left;
  let bottom = box.top;
  for (let y = box.top; y < box.bottom; y += 1) {
    for (let x = box.left; x < box.right; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 20) continue;
      if (x < left) left = x;
      if (y < top) top = y;
      if (x + 1 > right) right = x + 1;
      if (y + 1 > bottom) bottom = y + 1;
    }
  }
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawPiece(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  piece: { left: number; top: number; right: number; bottom: number },
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
) {
  const width = piece.right - piece.left;
  const height = piece.bottom - piece.top;
  const scale = Math.min(maxWidth / width, maxHeight / height);
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  const drawnX = x;
  const drawnY = y + (maxHeight - drawnHeight) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, piece.left, piece.top, width, height, drawnX, drawnY, drawnWidth, drawnHeight);
  return { x: drawnX, y: drawnY, width: drawnWidth, height: drawnHeight };
}

function extractMark(data: Uint8ClampedArray) {
  let kept = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 140) continue;
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const light = (red + green + blue) / 3;
    const saturation = max === 0 ? 0 : (max - min) / max;
    const graphic = saturation > 0.38 && light > 45 && light < 235;
    const lettering = light > 236 && saturation < 0.12;
    if (graphic || lettering) {
      kept += 1;
      continue;
    }
    data[index + 3] = 0;
  }
  return kept > data.length / 4 * 0.012;
}

function markIsLight(data: Uint8ClampedArray) {
  let kept = 0;
  let light = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 140) continue;
    kept += 1;
    light += (data[index] + data[index + 1] + data[index + 2]) / 3;
  }
  return kept > 0 && light / kept > 165;
}

function modernCanvas(
  source: HTMLCanvasElement,
  data: Uint8ClampedArray,
  bounds: { left: number; top: number; right: number; bottom: number },
  accent: { red: number; green: number; blue: number },
  lightMark: boolean,
) {
  const width = source.width;
  const columns = projection(data, width, bounds, "x");
  const rows = projection(data, width, bounds, "y");
  const columnGap = splitGap(columns);
  const rowGap = splitGap(rows);
  const aspect = (bounds.right - bounds.left) / (bounds.bottom - bounds.top);
  const output = document.createElement("canvas");
  const ctx = output.getContext("2d");
  if (!ctx) return null;
  const color = paint(accent);
  const plate = () => {
    if (!lightMark) return;
    ctx.fillStyle = paint({
      red: accent.red * 0.2 + 28,
      green: accent.green * 0.16 + 18,
      blue: accent.blue * 0.12 + 14,
    });
    roundRect(ctx, 16, 16, output.width - 32, output.height - 32, 46);
    ctx.fill();
  };

  if (columnGap && aspect > 1.05) {
    output.width = 1400;
    output.height = 560;
    const left = scan(data, width, { left: bounds.left, top: bounds.top, right: bounds.left + columnGap.at, bottom: bounds.bottom });
    const right = scan(data, width, { left: bounds.left + columnGap.at + columnGap.length, top: bounds.top, right: bounds.right, bottom: bounds.bottom });
    if (left && right) {
      plate();
      ctx.fillStyle = color;
      roundRect(ctx, 28, 48, 18, 464, 9);
      ctx.fill();
      const symbol = drawPiece(ctx, source, left, 70, 36, 420, 488);
      const text = drawPiece(ctx, source, right, symbol.x + symbol.width + 36, 48, 820, 420);
      ctx.fillStyle = color;
      roundRect(ctx, text.x, text.y + text.height + 18, Math.max(96, text.width * 0.38), 12, 6);
      ctx.fill();
      return output;
    }
  }

  if (rowGap && aspect < 1.8) {
    output.width = 860;
    output.height = 860;
    const upper = scan(data, width, { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.top + rowGap.at });
    const lower = scan(data, width, { left: bounds.left, top: bounds.top + rowGap.at + rowGap.length, right: bounds.right, bottom: bounds.bottom });
    if (upper && lower) {
      plate();
      const topPiece = drawPiece(ctx, source, upper, 110, 70, 640, 380);
      ctx.fillStyle = color;
      roundRect(ctx, output.width / 2 - 70, topPiece.y + topPiece.height + 28, 140, 12, 6);
      ctx.fill();
      drawPiece(ctx, source, lower, 80, topPiece.y + topPiece.height + 64, 700, 250);
      return output;
    }
  }

  if (aspect < 1.25) {
    output.width = 760;
    output.height = 760;
    plate();
    ctx.strokeStyle = color;
    ctx.lineWidth = 14;
    roundRect(ctx, 46, 46, 668, 668, 88);
    ctx.stroke();
    drawPiece(ctx, source, bounds, 110, 110, 540, 500);
    ctx.fillStyle = color;
    roundRect(ctx, 300, 674, 160, 14, 7);
    ctx.fill();
    return output;
  }

  output.width = 1400;
  output.height = 560;
  plate();
  ctx.fillStyle = color;
  roundRect(ctx, 28, 48, 18, 464, 9);
  ctx.fill();
  const word = drawPiece(ctx, source, bounds, 72, 40, 1260, 440);
  ctx.fillStyle = color;
  roundRect(ctx, word.x, word.y + word.height + 16, Math.max(120, word.width * 0.34), 12, 6);
  ctx.fill();
  return output;
}

function pngFile(canvas: HTMLCanvasElement) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("png"));
        return;
      }
      resolve(new File([blob], "logo.png", { type: "image/png" }));
    }, "image/png");
  });
}

export async function improveUploadedLogo(source: Blob | string): Promise<ImprovedLogo> {
  const blob = typeof source === "string" ? await (await fetch(source)).blob() : source;
  if (!blob.size) return { file: null, note: "Não foi possível ler a logo." };
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { file: null, note: "Não foi possível ler a logo." };
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const image = context.getImageData(0, 0, width, height);
  const original = new Uint8ClampedArray(image.data);
  const before = opaqueCount(original);
  const background = sampleEdge(image.data, width, height);
  if (background) {
    clearFlatBackground(image.data, width, height, background);
    const left = contentBounds(image.data, width, height);
    if (!left || left.count < before * 0.08) image.data.set(original);
  } else if (!extractMark(image.data)) {
    image.data.set(original);
  }
  const bounds = contentBounds(image.data, width, height);
  if (!bounds) return { file: null, note: "Não foi possível ler a logo." };
  context.putImageData(image, 0, 0);
  const colors = palette(image.data);
  const output = modernCanvas(canvas, image.data, bounds, colors.accent, markIsLight(image.data));
  if (!output) return { file: null, note: "Não foi possível ler a logo." };
  const file = await pngFile(output);
  return {
    file,
    note: "A nova logo segue o layout da que você enviou, com um desenho mais moderno. Salve para substituir.",
  };
}
