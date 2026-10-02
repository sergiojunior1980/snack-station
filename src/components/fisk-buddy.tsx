"use client";

import { useEffect, useRef, useState } from "react";

const HEIGHT = 270;
const WIDTH = 160;
const CHEER_MS = 2800;
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
    stride: 0,
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
    surface.width = WIDTH * dpr;
    surface.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sky.width = fireW * dpr;
    sky.height = fireH * dpr;
    fireCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const state = motion.current;
    let cheerTimer = 0;
    let clock = 0;
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
      clock += 1;
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
        const speed = 2.6;
        state.x += (dx / dist) * speed;
        state.y += (dy / dist) * speed;
        if (Math.abs(dx) > 8) state.dir = dx > 0 ? 1 : -1;
        state.phase += 0.16;
      }
      state.stride += ((moving ? 1 : 0) - state.stride) * 0.14;
      state.x = Math.min(maxX, Math.max(8, state.x));
      state.y = Math.min(maxY, Math.max(8, state.y));

      let lift = Math.sin(clock / 26) * 2;
      if (cheeringNow) {
        const elapsed = CHEER_MS - (state.celebrateUntil - performance.now());
        const hop = Math.sin(((elapsed % 420) / 420) * Math.PI);
        lift = 6 + hop * 26;
        const want = elapsed < 180 ? 1 : elapsed < 700 ? 2 : 3;
        while (state.bursts < want) {
          burst(state.sparks, fireW / 2 + (state.bursts - 1) * 28, fireH - 36);
          state.bursts += 1;
        }
      } else if (state.stride > 0.05) {
        lift += Math.abs(Math.sin(state.phase)) * 7 * state.stride;
      }

      const blinkWindow = clock % 260;
      const blink = blinkWindow < 12 ? Math.sin((blinkWindow / 12) * Math.PI) : 0;
      const step = Math.sin(state.phase);
      const cheerArm = cheeringNow ? Math.sin(clock / 6) * 0.35 : 0;
      drawBuddy(ctx, {
        stride: state.stride,
        step,
        idle: clock,
        blink,
        cheerArm,
      });

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

      node.style.opacity = "1";
      node.style.transform = `translate3d(${state.x}px, ${state.y - lift}px, 0)`;
      body.style.transform = `scaleX(${state.dir})`;
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

type Pose = { stride: number; step: number; idle: number; blink: number; cheerArm: number };

function drawBuddy(ctx: CanvasRenderingContext2D, pose: Pose) {
  const cx = WIDTH / 2;
  const breathe = Math.sin(pose.idle / 22);
  const headTilt = breathe * 0.06 + pose.step * -0.12 * pose.stride;
  const armSwing = pose.step * 0.55 * pose.stride;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.save();
  ctx.translate(cx, 118 + breathe * 1.4);
  drawLeg(ctx, 14, 62, pose.step * 0.62 * pose.stride);
  drawLeg(ctx, -14, 62, pose.step * -0.62 * pose.stride);
  drawTorso(ctx, breathe);
  drawArm(ctx, -34, 8, -0.85 - armSwing + Math.sin(pose.idle / 30) * 0.08 + pose.cheerArm, "can");
  drawArm(ctx, 34, 8, 0.7 + armSwing + Math.sin(pose.idle / 27) * -0.08 - pose.cheerArm, "cookie");
  drawHead(ctx, -46, headTilt, pose.blink);
  ctx.restore();
}

function drawTorso(ctx: CanvasRenderingContext2D, breathe: number) {
  ctx.fillStyle = "#d0122d";
  rounded(ctx, -32, -8, 64, 78, 18);
  ctx.fill();
  ctx.fillStyle = "#f6e2cf";
  ctx.beginPath();
  ctx.ellipse(0, 28, 16, 22 + breathe, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f4f4f4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(0, 62);
  ctx.stroke();
}

function drawHead(ctx: CanvasRenderingContext2D, y: number, tilt: number, blink: number) {
  ctx.save();
  ctx.translate(0, y);
  ctx.rotate(tilt);
  ctx.fillStyle = "#c6864a";
  ctx.beginPath();
  ctx.ellipse(-18, -28, 10, 12, -0.4, 0, Math.PI * 2);
  ctx.ellipse(18, -28, 10, 12, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f3c9a4";
  ctx.beginPath();
  ctx.ellipse(-18, -28, 5, 7, -0.4, 0, Math.PI * 2);
  ctx.ellipse(18, -28, 5, 7, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c6864a";
  ctx.beginPath();
  ctx.arc(0, 0, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#a86b38";
  ctx.beginPath();
  ctx.ellipse(2, -30, 8, 6, 0.4, 0, Math.PI * 2);
  ctx.fill();
  const eye = Math.max(0.12, 1 - blink);
  ctx.fillStyle = "#2f6fe0";
  ctx.beginPath();
  ctx.ellipse(-10, -2, 5, 5.5 * eye, 0, 0, Math.PI * 2);
  ctx.ellipse(10, -2, 5, 5.5 * eye, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1b1b1b";
  ctx.beginPath();
  ctx.arc(-10, -1, 2.1, 0, Math.PI * 2);
  ctx.arc(10, -1, 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a1612";
  ctx.beginPath();
  ctx.ellipse(0, 10, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#6b3a28";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 12, 7, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.restore();
}

function drawLeg(ctx: CanvasRenderingContext2D, x: number, y: number, swing: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(swing);
  ctx.fillStyle = "#c6864a";
  rounded(ctx, -7, 0, 14, 34, 7);
  ctx.fill();
  ctx.translate(0, 30);
  ctx.rotate(Math.max(0, -swing) * 0.9);
  ctx.fillStyle = "#b57840";
  rounded(ctx, -6, 0, 12, 28, 6);
  ctx.fill();
  ctx.fillStyle = "#9fd8ea";
  ctx.beginPath();
  ctx.ellipse(2, 28, 12, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawArm(ctx: CanvasRenderingContext2D, x: number, y: number, swing: number, item: "can" | "cookie") {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(swing);
  ctx.fillStyle = "#f7f7f7";
  rounded(ctx, -6, 0, 12, 26, 6);
  ctx.fill();
  ctx.fillStyle = "#8d2438";
  rounded(ctx, -7, 20, 14, 8, 4);
  ctx.fill();
  ctx.translate(0, 30);
  ctx.fillStyle = "#c6864a";
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  if (item === "can") drawCan(ctx);
  else drawCookie(ctx);
  ctx.restore();
}

function drawCan(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(-4, -18);
  ctx.fillStyle = "#d0122d";
  rounded(ctx, 0, 0, 16, 28, 4);
  ctx.fill();
  ctx.fillStyle = "#d7dde3";
  rounded(ctx, 0, 0, 16, 5, 2);
  ctx.fill();
  ctx.fillStyle = "#fff7f7";
  rounded(ctx, 3, 10, 10, 8, 2);
  ctx.fill();
  ctx.restore();
}

function drawCookie(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(6, -4);
  ctx.fillStyle = "#e2a15a";
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6b3a22";
  for (const [x, y] of [
    [-3, -2],
    [3, -3],
    [0, 3],
    [3, 2],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

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
