"use client";

import { useEffect, useRef, useState } from "react";

const HEIGHT = 210;
const WIDTH = 186;
const CHEER_MS = 2400;

export function celebrateSale() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("snack-sale"));
}

export function FiskBuddy() {
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLButtonElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const motion = useRef({ x: 24, y: 0, dir: 1, walking: false, placed: false, celebrateUntil: 0, mouseX: 0, mouseY: 0 });
  const [walking, setWalking] = useState(false);
  const [cheering, setCheering] = useState(false);

  useEffect(() => {
    const node = root.current;
    const figure = body.current;
    const shade = shadow.current;
    if (!node || !figure || !shade) return;
    const state = motion.current;
    let cheerTimer = 0;
    const onSale = () => {
      state.celebrateUntil = performance.now() + CHEER_MS;
      setCheering(true);
      window.clearTimeout(cheerTimer);
      cheerTimer = window.setTimeout(() => setCheering(false), CHEER_MS);
    };
    window.addEventListener("snack-sale", onSale);
    const onMouse = (event: MouseEvent) => {
      state.mouseX = event.clientX;
      state.mouseY = event.clientY;
    };
    window.addEventListener("mousemove", onMouse);
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
      let lift = 0;
      let sx = 1;
      let sy = 1;
      let tilt = 0;
      const cheeringNow = performance.now() < state.celebrateUntil;
      if (cheeringNow) {
        const left = state.celebrateUntil - performance.now();
        const elapsed = CHEER_MS - left;
        const t = (elapsed % 420) / 420;
        const hop = Math.sin(t * Math.PI);
        lift = 8 + hop * 52;
        sy = hop > 0.2 ? 1.08 + hop * 0.08 : 0.82;
        sx = hop > 0.2 ? 0.94 : 1.16;
        tilt = Math.sin(elapsed / 120) * 14;
      } else if (state.walking) {
        const targetX = Math.min(maxX, Math.max(8, state.mouseX - WIDTH / 2));
        const targetY = Math.min(maxY, Math.max(8, state.mouseY - HEIGHT / 2));
        const dx = targetX - state.x;
        const dy = targetY - state.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 8) {
          const speed = Math.min(8, Math.max(2.4, dist * 0.14));
          state.x += (dx / dist) * speed;
          state.y += (dy / dist) * speed;
          if (Math.abs(dx) > 6) state.dir = dx > 0 ? 1 : -1;
          const t = (frame % 28) / 28;
          const hop = Math.sin(t * Math.PI);
          const landing = t < 0.14 || t > 0.9;
          lift = hop * 22;
          sy = landing ? 0.86 : 1 + hop * 0.08;
          sx = landing ? 1.12 : 1 - hop * 0.04;
          tilt = state.dir * (4 + hop * 5);
        }
        state.x = Math.min(maxX, Math.max(8, state.x));
        state.y = Math.min(maxY, Math.max(8, state.y));
      } else {
        lift = Math.sin(frame / 17) * 4;
        tilt = Math.sin(frame / 23) * 4;
        sy = 1 + Math.sin(frame / 19) * 0.025;
        sx = 1 + Math.sin(frame / 19) * -0.02;
      }
      node.style.opacity = "1";
      node.style.transform = `translate3d(${state.x}px, ${state.y - lift}px, 0)`;
      figure.style.transform = `scaleX(${state.dir}) scale(${sx}, ${sy}) rotate(${tilt}deg)`;
      const shadowScale = Math.max(0.55, 1 - lift / 46);
      shade.style.transform = `translateX(-50%) scaleX(${shadowScale})`;
      shade.style.opacity = String(0.28 * shadowScale);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("snack-sale", onSale);
      window.removeEventListener("mousemove", onMouse);
      window.clearTimeout(cheerTimer);
    };
  }, []);

  return (
    <div ref={root} className="pointer-events-none fixed top-0 left-0 z-30 opacity-0" style={{ width: WIDTH, height: HEIGHT }}>
      {cheering ? (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold whitespace-nowrap text-primary-foreground">
          Boa venda!
        </span>
      ) : null}
      <span ref={shadow} className="absolute bottom-1 left-1/2 h-3 w-16 rounded-full bg-black/70" />
      <button
        ref={body}
        type="button"
        aria-label={walking ? "Parar o Buddy" : "Fazer o Buddy seguir o mouse"}
        onClick={(event) => {
          const state = motion.current;
          state.walking = !state.walking;
          state.mouseX = event.clientX;
          state.mouseY = event.clientY;
          setWalking(state.walking);
        }}
        className={`${cheering ? "buddy-cheer" : walking ? "buddy-walk" : "buddy-idle"} pointer-events-auto relative h-full w-full cursor-pointer border-0 bg-transparent p-0`}
      >
        <style>{`
          @keyframes buddy-can { 50% { transform: rotate(-14deg) translateY(-3px); } }
          @keyframes buddy-cookie { 50% { transform: rotate(16deg) translateY(-2px); } }
          .buddy-can, .buddy-cookie { transform-origin: 50% 80%; }
          .buddy-walk .buddy-can { animation: buddy-can 0.34s ease-in-out infinite; }
          .buddy-walk .buddy-cookie { animation: buddy-cookie 0.34s ease-in-out infinite; }
          .buddy-idle .buddy-can { animation: buddy-can 1.5s ease-in-out infinite; }
          .buddy-idle .buddy-cookie { animation: buddy-cookie 1.5s ease-in-out infinite; }
          .buddy-cheer .buddy-can { animation: buddy-can 0.2s ease-in-out infinite; }
          .buddy-cheer .buddy-cookie { animation: buddy-cookie 0.2s ease-in-out infinite; }
        `}</style>
        <img src="/buddy.png" alt="" className="h-full w-full object-contain" />
        <span className="buddy-can absolute top-[17%] left-[1%] w-[30%]">
          <svg viewBox="0 0 48 72" className="h-auto w-full drop-shadow-md" aria-hidden="true">
            <rect x="8" y="8" width="32" height="56" rx="8" fill="#c8102e" />
            <rect x="8" y="8" width="32" height="8" rx="4" fill="#d7dde3" />
            <rect x="8" y="54" width="32" height="10" rx="4" fill="#9aa3ab" />
            <rect x="12" y="24" width="24" height="16" rx="3" fill="#fff7f7" />
            <path d="M16 32c4 3 8-3 16 0" stroke="#c8102e" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        </span>
        <span className="buddy-cookie absolute top-[36%] right-[2%] w-[24%]">
          <svg viewBox="0 0 64 64" className="h-auto w-full drop-shadow-md" aria-hidden="true">
            <circle cx="32" cy="32" r="26" fill="#e2a15a" />
            <circle cx="32" cy="32" r="26" fill="none" stroke="#c4843a" strokeWidth="3" />
            <circle cx="22" cy="24" r="3.2" fill="#6b3a22" />
            <circle cx="38" cy="22" r="2.6" fill="#6b3a22" />
            <circle cx="30" cy="36" r="3" fill="#6b3a22" />
            <circle cx="44" cy="36" r="2.4" fill="#6b3a22" />
            <circle cx="20" cy="40" r="2.2" fill="#6b3a22" />
          </svg>
        </span>
      </button>
    </div>
  );
}
