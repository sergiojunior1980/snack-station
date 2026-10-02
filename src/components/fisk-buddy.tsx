"use client";

import { useEffect, useRef, useState } from "react";

const HEIGHT = 270;
const WIDTH = 160;
const CHEER_MS = 2800;
const FRAMES = 4;
const ORDER = [0, 1, 2, 3];
const STAND = 3;
const FIRE_COLORS = ["#ffe14a", "#ff4b4b", "#fff7f7", "#7ec8ff", "#ff8ad4"];

export function celebrateSale() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("snack-sale"));
}

export function FiskBuddy() {
  const root = useRef<HTMLDivElement>(null);
  const figure = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fire = useRef<HTMLCanvasElement>(null);
  const motion = useRef({
    x: 24,
    y: 0,
    dir: 1,
    placed: false,
    celebrateUntil: 0,
    bursts: 0,
    mouseX: 0,
    mouseY: 0,
    seen: false,
    phase: 0,
    sparks: [] as Spark[],
  });
  const [cheering, setCheering] = useState(false);

  useEffect(() => {
    const node = root.current;
    const body = figure.current;
    const shade = shadow.current;
    const surface = canvas.current;
    const sky = fire.current;
    if (!node || !body || !shade || !surface || !sky) return;
    const ctx = surface.getContext("2d");
    const fireCtx = sky.getContext("2d");
    if (!ctx || !fireCtx) return;
    const fireW = 280;
    const fireH = 200;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    sky.width = fireW * dpr;
    sky.height = fireH * dpr;
    fireCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const picture = new Image();
    picture.src = "/buddy-frames.png";
    let sized = false;
    const state = motion.current;
    let cheerTimer = 0;
    const onSale = () => {
      state.celebrateUntil = performance.now() + CHEER_MS;
      state.bursts = 0;
      state.sparks = [];
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

    let raf = 0;
    const tick = () => {
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

      if (moving) {
        const speed = 3.2;
        state.x += (dx / dist) * speed;
        state.y += (dy / dist) * speed;
        if (Math.abs(dx) > 8) state.dir = dx > 0 ? 1 : -1;
        state.phase += 0.11;
      }
      state.x = Math.min(maxX, Math.max(8, state.x));
      state.y = Math.min(maxY, Math.max(8, state.y));

      let lift = 0;
      let tilt = 0;
      if (cheeringNow) {
        const elapsed = CHEER_MS - (state.celebrateUntil - performance.now());
        const hop = Math.sin(((elapsed % 420) / 420) * Math.PI);
        lift = 6 + hop * 28;
        const want = elapsed < 180 ? 1 : elapsed < 700 ? 2 : 3;
        while (state.bursts < want) {
          burst(state.sparks, fireW / 2 + (state.bursts - 1) * 28, fireH - 36);
          state.bursts += 1;
        }
      } else if (moving) {
        const step = state.phase % FRAMES;
        lift = Math.abs(Math.sin(step * Math.PI)) * 8;
        tilt = state.dir * 2;
      }
      for (const spark of state.sparks) {
        spark.x += spark.vx;
        spark.y += spark.vy;
        spark.vy += 0.07;
        spark.life -= spark.decay;
      }
      state.sparks = state.sparks.filter((spark) => spark.life > 0);
      fireCtx.clearRect(0, 0, fireW, fireH);
      for (const spark of state.sparks) {
        fireCtx.globalAlpha = Math.max(0, spark.life);
        fireCtx.fillStyle = spark.color;
        fireCtx.beginPath();
        fireCtx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
        fireCtx.fill();
      }
      fireCtx.globalAlpha = 1;

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
        const index = moving ? ORDER[Math.floor(state.phase) % ORDER.length] : STAND;
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
      <canvas ref={fire} className="pointer-events-none absolute top-0 left-1/2 h-48 w-72 -translate-x-1/2 -translate-y-24" />
      <div ref={figure} className="relative h-full w-full origin-bottom">
        <canvas ref={canvas} className="h-full w-full" />
      </div>
    </div>
  );
}

type Spark = { x: number; y: number; vx: number; vy: number; life: number; decay: number; color: string; size: number };

function burst(sparks: Spark[], x: number, y: number) {
  for (let i = 0; i < 26; i += 1) {
    const angle = (Math.PI * 2 * i) / 26 + Math.random() * 0.2;
    const speed = 1.4 + Math.random() * 2.8;
    sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2.2,
      life: 1,
      decay: 0.012 + Math.random() * 0.012,
      color: FIRE_COLORS[i % FIRE_COLORS.length],
      size: 1.6 + Math.random() * 2.2,
    });
  }
}

function pointerOnBuddy(rect: DOMRect, x: number, y: number) {
  const insetX = rect.width * 0.04;
  const insetY = rect.height * 0.04;
  return x >= rect.left + insetX && x <= rect.right - insetX && y >= rect.top + insetY && y <= rect.bottom - insetY;
}
