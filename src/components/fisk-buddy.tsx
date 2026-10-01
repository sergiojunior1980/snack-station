"use client";

import { useEffect, useRef, useState } from "react";

const HEIGHT = 270;
const WIDTH = 240;
const IMG_W = 568;
const IMG_H = 640;
const CHEER_MS = 2400;
const SLICE = 2;

export function celebrateSale() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("snack-sale"));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawCan(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number) {
  ctx.save();
  ctx.translate(x + 54, y + 78);
  ctx.rotate(rot);
  ctx.translate(-54, -78);
  ctx.fillStyle = "#c8102e";
  roundRect(ctx, 0, 20, 116, 136, 20);
  ctx.fill();
  ctx.fillStyle = "#d7dde3";
  roundRect(ctx, 0, 20, 116, 22, 11);
  ctx.fill();
  ctx.fillStyle = "#9aa3ab";
  roundRect(ctx, 0, 134, 116, 22, 10);
  ctx.fill();
  ctx.fillStyle = "#fff7f7";
  roundRect(ctx, 16, 62, 84, 42, 8);
  ctx.fill();
  ctx.strokeStyle = "#c8102e";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(28, 84);
  ctx.bezierCurveTo(48, 98, 68, 70, 90, 86);
  ctx.stroke();
  ctx.restore();
}

function drawCookie(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.arc(0, 0, 36, 0, Math.PI * 2);
  ctx.fillStyle = "#e2a15a";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#c4843a";
  ctx.stroke();
  ctx.fillStyle = "#6b3a22";
  for (const [cx, cy, r] of [
    [-12, -8, 4.2],
    [10, -10, 3.4],
    [-2, 8, 4],
    [14, 8, 3],
    [-14, 12, 2.8],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    surface.width = IMG_W * dpr;
    surface.height = IMG_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const picture = new Image();
    picture.src = "/buddy.png";
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
    };
    window.addEventListener("snack-sale", onSale);
    window.addEventListener("pointermove", onPointer);

    const blit = (sx: number, sw: number, dx: number, dy: number, sy: number, sh: number) => {
      if (sw <= 0 || sh <= 0 || !picture.naturalWidth) return;
      ctx.drawImage(picture, sx, sy, sw, sh, sx + dx, sy + dy, sw, sh);
    };

    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame += 1;
      const maxX = Math.max(8, window.innerWidth - WIDTH - 8);
      const maxY = Math.max(8, window.innerHeight - HEIGHT - 8);
      if (!state.placed) {
        state.x = 24;
        state.y = Math.max(8, window.innerHeight - HEIGHT - (window.innerWidth < 768 ? 78 : 18));
        state.mouseX = state.x + WIDTH / 2;
        state.mouseY = state.y + HEIGHT / 2;
        state.placed = true;
      }

      const cheeringNow = performance.now() < state.celebrateUntil;
      const targetX = Math.min(maxX, Math.max(8, state.mouseX - WIDTH / 2));
      const targetY = Math.min(maxY, Math.max(8, state.mouseY - HEIGHT / 2));
      const dx = targetX - state.x;
      const dy = targetY - state.y;
      const dist = Math.hypot(dx, dy);
      const moving = !cheeringNow && dist > 14;

      if (moving) {
        const speed = Math.min(7.2, Math.max(2.2, dist * 0.13));
        state.x += (dx / dist) * speed;
        state.y += (dy / dist) * speed;
        if (Math.abs(dx) > 10) state.dir = dx > 0 ? 1 : -1;
        state.phase += 0.34;
      } else {
        state.phase += cheeringNow ? 0.55 : 0.045;
      }
      state.x = Math.min(maxX, Math.max(8, state.x));
      state.y = Math.min(maxY, Math.max(8, state.y));

      const amp = cheeringNow ? 1.15 : moving ? 1 : 0.32;
      const look = Math.max(-1, Math.min(1, dx / 160));
      const lean = moving ? state.dir : look * 0.35;
      let lift = 0;
      let sx = 1;
      let sy = 1;
      let tilt = 0;
      if (cheeringNow) {
        const elapsed = CHEER_MS - (state.celebrateUntil - performance.now());
        const hop = Math.sin(((elapsed % 420) / 420) * Math.PI);
        lift = 8 + hop * 52;
        sy = hop > 0.2 ? 1.08 + hop * 0.08 : 0.82;
        sx = hop > 0.2 ? 0.94 : 1.16;
        tilt = Math.sin(elapsed / 120) * 14;
      } else if (moving) {
        const hop = Math.abs(Math.sin(state.phase));
        lift = hop * 20;
        sy = hop > 0.55 ? 1.05 : 0.94;
        sx = hop > 0.55 ? 0.97 : 1.06;
        tilt = state.dir * (3 + hop * 4);
      } else {
        lift = Math.sin(frame / 17) * 5;
        tilt = Math.sin(frame / 23) * 3 + look * 4;
        sy = 1 + Math.sin(frame / 19) * 0.03;
        sx = 1 - Math.sin(frame / 19) * 0.02;
      }

      if (picture.naturalWidth) {
        ctx.clearRect(0, 0, IMG_W, IMG_H);
        const hand = offsets(112, state.phase, amp, look, lean);
        const thumb = offsets(178, state.phase, amp, look, lean);
        drawCan(ctx, 70 + hand.body + hand.ldx, 18 + hand.ldy, -state.phase * 0.35 * amp);
        for (let sy0 = 0; sy0 < IMG_H; sy0 += SLICE) {
          const sh = Math.min(SLICE + 1, IMG_H - sy0);
          const y = sy0 + SLICE / 2;
          const pose = offsets(y, state.phase, amp, look, lean);
          if (y < 468) {
            if (y < 190) {
              blit(0, 172, pose.body + pose.ldx, pose.ldy, sy0, sh);
              blit(172, 268, pose.body, 0, sy0, sh);
            } else {
              blit(0, 440, pose.body, 0, sy0, sh);
            }
            if (y < 252) blit(440, IMG_W - 440, pose.body + pose.rdx, pose.rdy, sy0, sh);
            else blit(440, IMG_W - 440, pose.body, 0, sy0, sh);
          } else {
            const k = Math.min(1, (y - 455) / 175);
            const swing = Math.sin(state.phase) * 62 * amp * k;
            const liftL = Math.max(0, Math.sin(state.phase)) * 40 * amp * k;
            const liftR = Math.max(0, -Math.sin(state.phase)) * 40 * amp * k;
            blit(0, 266, pose.body - swing, -liftL, sy0, sh);
            blit(256, IMG_W - 256, pose.body + swing, -liftR, sy0, sh);
          }
        }
        drawCookie(ctx, 518 + thumb.body + thumb.rdx, 188 + thumb.rdy, state.phase * 0.4 * amp);
      }

      node.style.opacity = "1";
      node.style.transform = `translate3d(${state.x}px, ${state.y - lift}px, 0)`;
      body.style.transform = `scaleX(${state.dir}) scale(${sx}, ${sy}) rotate(${tilt}deg)`;
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

function offsets(y: number, phase: number, amp: number, look: number, lean: number) {
  const body = lean * (0.5 - y / IMG_H) * 30 + look * Math.max(0, (236 - y) / 236) * 18;
  const lAmp = y < 190 ? Math.max(0, (190 - y) / 130) : 0;
  const rAmp = y < 252 ? Math.max(0, (252 - y) / 150) : 0;
  return {
    body,
    ldx: -Math.sin(phase) * 46 * amp * lAmp,
    ldy: Math.cos(phase) * 14 * amp * lAmp,
    rdx: Math.sin(phase) * 40 * amp * rAmp,
    rdy: -Math.cos(phase) * 12 * amp * rAmp,
  };
}
