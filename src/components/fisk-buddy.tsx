"use client";

import { useEffect, useRef, useState } from "react";

const WIDTH = 76;
const HEIGHT = 108;

export function FiskBuddy() {
  const button = useRef<HTMLButtonElement>(null);
  const motion = useRef({ x: 20, y: 0, vx: 1.8, vy: -1.2, walking: false, placed: false });
  const [walking, setWalking] = useState(false);

  useEffect(() => {
    const node = button.current;
    if (!node) return;
    const state = motion.current;
    if (!state.placed) {
      state.y = Math.max(16, window.innerHeight - HEIGHT - 96);
      state.placed = true;
    }
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame += 1;
      const maxX = Math.max(8, window.innerWidth - WIDTH - 8);
      const maxY = Math.max(8, window.innerHeight - HEIGHT - 8);
      if (state.walking) {
        state.x += state.vx;
        state.y += state.vy;
        if (state.x <= 8 || state.x >= maxX) state.vx *= -1;
        if (state.y <= 8 || state.y >= maxY) state.vy *= -1;
        state.x = Math.min(maxX, Math.max(8, state.x));
        state.y = Math.min(maxY, Math.max(8, state.y));
      }
      const bob = state.walking ? Math.abs(Math.sin(frame / 3)) * -5 : Math.sin(frame / 16) * 2;
      const face = state.vx < 0 ? -1 : 1;
      node.style.opacity = "1";
      node.style.transform = `translate3d(${state.x}px, ${state.y + bob}px, 0) scaleX(${face})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <button
      ref={button}
      type="button"
      aria-label={walking ? "Parar o Buddy" : "Fazer o Buddy andar"}
      onClick={() => {
        const state = motion.current;
        state.walking = !state.walking;
        if (state.walking) {
          const angle = Math.random() * Math.PI * 2;
          state.vx = Math.cos(angle) * 2.4;
          state.vy = Math.sin(angle) * 2.1;
          if (Math.abs(state.vx) < 1.3) state.vx = state.vx < 0 ? -1.8 : 1.8;
        }
        setWalking(state.walking);
      }}
      className="fixed top-0 left-0 z-30 h-[108px] w-[76px] cursor-pointer border-0 bg-transparent p-0 opacity-0"
    >
      <style>{`
        @keyframes buddy-leg { 50% { transform: rotate(24deg); } }
        @keyframes buddy-arm { 50% { transform: rotate(-18deg); } }
        .buddy-walk .leg-l { transform-origin: 30px 78px; animation: buddy-leg 0.28s ease-in-out infinite; }
        .buddy-walk .leg-r { transform-origin: 46px 78px; animation: buddy-leg 0.28s ease-in-out infinite reverse; }
        .buddy-walk .arm-l { transform-origin: 18px 58px; animation: buddy-arm 0.28s ease-in-out infinite; }
        .buddy-walk .arm-r { transform-origin: 58px 58px; animation: buddy-arm 0.28s ease-in-out infinite reverse; }
        .buddy-idle .arm-l, .buddy-idle .arm-r { transform-origin: 38px 58px; animation: buddy-arm 1.6s ease-in-out infinite; }
      `}</style>
      <svg viewBox="0 0 76 108" className={walking ? "buddy-walk h-full w-full overflow-visible" : "buddy-idle h-full w-full overflow-visible"} aria-hidden="true">
        <ellipse cx="38" cy="104" rx="18" ry="3.5" fill="rgba(7,7,30,0.18)" />
        <g className="leg-l">
          <rect x="24" y="78" width="12" height="18" rx="6" fill="#8a5a32" />
          <ellipse cx="30" cy="96" rx="8" ry="5" fill="#6b4424" />
        </g>
        <g className="leg-r">
          <rect x="40" y="78" width="12" height="18" rx="6" fill="#8a5a32" />
          <ellipse cx="46" cy="96" rx="8" ry="5" fill="#6b4424" />
        </g>
        <g className="arm-l">
          <rect x="4" y="56" width="16" height="10" rx="5" fill="#8a5a32" />
          <circle cx="8" cy="61" r="6" fill="#a56b3c" />
        </g>
        <g className="arm-r">
          <rect x="56" y="56" width="16" height="10" rx="5" fill="#8a5a32" />
          <circle cx="68" cy="61" r="6" fill="#a56b3c" />
        </g>
        <rect x="16" y="48" width="44" height="34" rx="16" fill="#b8002e" />
        <rect x="16" y="66" width="44" height="8" fill="#fff7f7" />
        <circle cx="38" cy="34" r="20" fill="#a56b3c" />
        <circle cx="22" cy="16" r="7" fill="#a56b3c" />
        <circle cx="54" cy="16" r="7" fill="#a56b3c" />
        <circle cx="22" cy="16" r="4" fill="#f2d2b0" />
        <circle cx="54" cy="16" r="4" fill="#f2d2b0" />
        <ellipse cx="38" cy="40" rx="10" ry="8" fill="#f2d2b0" />
        <ellipse cx="38" cy="38" rx="4" ry="3" fill="#6b4424" />
        <circle cx="31" cy="32" r="2" fill="#2a1614" />
        <circle cx="45" cy="32" r="2" fill="#2a1614" />
        <path d="M33 43c2 2 8 2 10 0" stroke="#6b4424" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    </button>
  );
}
