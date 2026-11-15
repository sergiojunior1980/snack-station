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

function liftContrast(data: Uint8ClampedArray) {
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 16) continue;
    data[index] = Math.max(0, Math.min(255, (data[index] - 128) * 1.08 + 128));
    data[index + 1] = Math.max(0, Math.min(255, (data[index + 1] - 128) * 1.08 + 128));
    data[index + 2] = Math.max(0, Math.min(255, (data[index + 2] - 128) * 1.08 + 128));
  }
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
  let cleared = 0;
  if (background) {
    cleared = clearFlatBackground(image.data, width, height, background);
    for (let index = 0; index < image.data.length; index += 4) {
      if (image.data[index + 3] < 16) continue;
      const distance = (image.data[index] - background.red) ** 2
        + (image.data[index + 1] - background.green) ** 2
        + (image.data[index + 2] - background.blue) ** 2;
      if (distance > 28 * 28) continue;
      image.data[index + 3] = 0;
      cleared += 1;
    }
    const left = contentBounds(image.data, width, height);
    if (!left || left.count < before * 0.08) {
      image.data.set(original);
      cleared = 0;
    }
  }
  const bounds = contentBounds(image.data, width, height);
  if (!bounds) return { file: null, note: "Não foi possível ler a logo." };
  const contentWidth = bounds.right - bounds.left;
  const contentHeight = bounds.bottom - bounds.top;
  const slackX = Math.max(6, Math.round(contentWidth * 0.03));
  const slackY = Math.max(6, Math.round(contentHeight * 0.06));
  const alreadyTight = bounds.left <= slackX && bounds.top <= slackY && width - bounds.right <= slackX && height - bounds.bottom <= slackY;
  if (cleared < width * height * 0.02 && alreadyTight) {
    return { file: null, note: "A logo já está limpa. Nada para melhorar." };
  }
  if (cleared > 0) liftContrast(image.data);
  context.putImageData(image, 0, 0);
  const padX = Math.max(8, Math.round(contentWidth * 0.04));
  const padY = Math.max(8, Math.round(contentHeight * 0.08));
  const output = document.createElement("canvas");
  output.width = contentWidth + padX * 2;
  output.height = contentHeight + padY * 2;
  const outputContext = output.getContext("2d");
  if (!outputContext) return { file: null, note: "Não foi possível ler a logo." };
  outputContext.drawImage(canvas, bounds.left, bounds.top, contentWidth, contentHeight, padX, padY, contentWidth, contentHeight);
  const file = await pngFile(output);
  return {
    file,
    note: cleared > 0
      ? "O fundo chapado foi retirado e a logo foi recortada. Salve para substituir a atual."
      : "As sobras em volta da logo foram cortadas. Salve para substituir a atual.",
  };
}
