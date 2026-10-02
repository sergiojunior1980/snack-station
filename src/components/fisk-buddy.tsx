"use client";

import { useEffect, useRef, useState } from "react";

const HEIGHT = 331;
const WIDTH = 196;
const CHEER_MS = 2400;
const FRAMES = 4;
const ORDER = [0, 1, 2, 3];

export function celebrateSale() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("snack-sale"));
}

export function FiskBuddy() {
  const root = useRef<HTMLDivElement>(null);
  const figure = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const motion = useRef({
    x: 24,
    y: 0,
    dir: 1,
    placed: false,
    celebrateUntil: 0,
    mouseX: 0,
    mouseY: 0,
    seen: false,
    phase: 0,
  });
  const [cheering, setCheering] = useState(false);

  useEffect(() => {
    const node = root.current;
    const body = figure.current;
    const shade = shadow.current;
    const surface = canvas.current;
    if (!node || !body || !shade || !surface) return;
    const ctx = surface.getContext("2d");
    if (!ctx) return;

    const picture = new Image();
    picture.src = "/buddy-frames.png";
    let sized = false;
    const state = motion.current;
    let cheerTimer = 0;
    const onSale = () => {
      state.celebrateUntil = performance.now() + CHEER_MS;
      setCheering(true);
      window.clearTimeout(cheerTimer);
      cheerTimer = window.setTimeout(() => setCheering(false), CHEER_MS);
    };
    const onPointer = (event: PointerEvent) => {
      state.mouseX = event.clientX;
      state.mouseY = event.clientY;
      state.seen = true;
    };
    const onPointerOut = (event: PointerEvent) => {
      if (!event.relatedTarget) state.seen = false;
    };
    window.addEventListener("snack-sale", onSale);
    window.addEventListener("pointermove", onPointer);
    window.addEventListener("pointerout", onPointerOut);

    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame += 1;
      const maxX = Math.max(8, window.innerWidth - WIDTH - 8);
      const maxY = Math.max(8, window.innerHeight - HEIGHT - 8);
      if (!state.placed) {
        state.x = 24;
        state.y = Math.max(8, window.innerHeight - HEIGHT - (window.innerWidth < 768 ? 78 : 18));
        state.placed = true;
      }

      const cheeringNow = performance.now() < state.celebrateUntil;
      const rect = node.getBoundingClientRect();
      const over = state.seen && pointerOnBuddy(rect, state.mouseX, state.mouseY);
      const dx = state.mouseX - (state.x + WIDTH / 2);
      const dy = state.mouseY - (state.y + HEIGHT / 2);
      const dist = Math.hypot(dx, dy);
      const moving = over && !cheeringNow && dist > 16;

      if (cheeringNow) {
        state.phase += 0.22;
      } else if (moving) {
        const speed = 3.2;
        state.x += (dx / dist) * speed;
        state.y += (dy / dist) * speed;
        if (Math.abs(dx) > 8) state.dir = dx > 0 ? 1 : -1;
        state.phase += 0.11;
      } else {
        state.phase += 0.04;
      }
      state.x = Math.min(maxX, Math.max(8, state.x));
      state.y = Math.min(maxY, Math.max(8, state.y));

      let lift = 0;
      let tilt = 0;
      if (cheeringNow) {
        const elapsed = CHEER_MS - (state.celebrateUntil - performance.now());
        const hop = Math.sin(((elapsed % 420) / 420) * Math.PI);
        lift = 8 + hop * 48;
        tilt = Math.sin(elapsed / 120) * 10;
      } else if (moving) {
        const step = state.phase % FRAMES;
        lift = Math.abs(Math.sin(step * Math.PI)) * 8;
        tilt = state.dir * 2;
      } else {
        lift = Math.sin(frame / 24) * 3;
        tilt = Math.sin(frame / 30) * 2;
      }

      if (picture.naturalWidth) {
        const cellW = picture.naturalWidth / FRAMES;
        const cellH = picture.naturalHeight;
        if (!sized) {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          surface.width = cellW * dpr;
          surface.height = cellH * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          sized = true;
        }
        const index = ORDER[Math.floor(state.phase) % ORDER.length];
        ctx.clearRect(0, 0, cellW, cellH);
        ctx.drawImage(picture, index * cellW, 0, cellW, cellH, 0, 0, cellW, cellH);
      }

      node.style.opacity = "1";
      node.style.transform = `translate3d(${state.x}px, ${state.y - lift}px, 0)`;
      body.style.transform = `scaleX(${state.dir}) rotate(${tilt}deg)`;
      const shadowScale = Math.max(0.55, 1 - lift / 70);
      shade.style.transform = `translateX(-50%) scaleX(${shadowScale})`;
      shade.style.opacity = String(0.28 * shadowScale);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("snack-sale", onSale);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerout", onPointerOut);
      window.clearTimeout(cheerTimer);
    };
  }, []);

  return (
    <div ref={root} className="pointer-events-none fixed top-0 left-0 z-30 opacity-0" style={{ width: WIDTH, height: HEIGHT }} aria-hidden="true">
      {cheering ? (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold whitespace-nowrap text-primary-foreground">
          Boa venda!
        </span>
      ) : null}
      <span ref={shadow} className="absolute bottom-1 left-1/2 h-3 w-16 rounded-full bg-black/70" />
      <div ref={figure} className="relative h-full w-full origin-bottom">
        <canvas ref={canvas} className="h-full w-full" />
      </div>
    </div>
  );
}

function pointerOnBuddy(rect: DOMRect, x: number, y: number) {
  const insetX = rect.width * 0.04;
  const insetY = rect.height * 0.04;
  return x >= rect.left + insetX && x <= rect.right - insetX && y >= rect.top + insetY && y <= rect.bottom - insetY;
}
