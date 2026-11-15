function channel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((part) => channel(part).toString(16).padStart(2, "0")).join("")}`;
}

function mixWhite(red: number, green: number, blue: number, white: number) {
  return {
    red: red + (255 - red) * white,
    green: green + (255 - green) * white,
    blue: blue + (255 - blue) * white,
  };
}

export async function backgroundFromPhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const size = 40;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();
  const pixels = context.getImageData(0, 0, size, size).data;
  const buckets = new Map<string, { count: number; red: number; green: number; blue: number; score: number }>();
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 128) continue;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const light = (red + green + blue) / 3;
    if (light < 18 || light > 245) continue;
    const key = `${red >> 4}-${green >> 4}-${blue >> 4}`;
    const current = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0, score: 0 };
    current.count += 1;
    current.red += red;
    current.green += green;
    current.blue += blue;
    current.score += saturation;
    buckets.set(key, current);
  }
  const ranked = [...buckets.values()].sort((a, b) => b.score - a.score || b.count - a.count);
  const chosen = ranked[0];
  if (!chosen || chosen.count === 0) return null;
  const red = chosen.red / chosen.count;
  const green = chosen.green / chosen.count;
  const blue = chosen.blue / chosen.count;
  const tint = mixWhite(red, green, blue, 0.84);
  return hex(tint.red, tint.green, tint.blue);
}
