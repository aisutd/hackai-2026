"use client";

import React, { useEffect, useMemo, useState } from "react";

type Props = {
  target?: Date | string | number;
  leftGraffitiSrc?: string;
  rightGraffitiSrc?: string;
  frameSrc?: string;
  heightClassName?: string;
  title?: string;
  footerText?: string;
};

function toMs(t: NonNullable<Props["target"]>) {
  return t instanceof Date ? t.getTime() : typeof t === "string" ? new Date(t).getTime() : t;
}

function nextMarch7Local(hour = 9, minute = 0, second = 0) {
  const now = new Date();
  const year = now.getFullYear();
  const candidate = new Date(year, 2, 7, hour, minute, second, 0);
  return candidate.getTime() <= now.getTime()
    ? new Date(year + 1, 2, 7, hour, minute, second, 0)
    : candidate;
}

function pad2(n: number) {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

export default function CountdownHero({
  target,
  leftGraffitiSrc = "/Countdown/bunny.svg",
  rightGraffitiSrc = "/Countdown/target.svg" ,
  frameSrc = "/Countdown/countdownBg.svg",
  heightClassName = "h-[740px] md:h-[460px]",
  title = "Countdown",
  footerText = "till hacking begins",
}: Props) {
  const targetMs = useMemo(() => {
    if (target != null) return toMs(target);
    return nextMarch7Local(9, 0, 0).getTime();
  }, [target]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const diff = Math.max(0, targetMs - now);
  const totalSec = Math.floor(diff / 1000);

  const days = Math.floor(totalSec / (60 * 60 * 24));
  const hours = Math.floor((totalSec % (60 * 60 * 24)) / (60 * 60));
  const mins = Math.floor((totalSec % (60 * 60)) / 60);
  const secs = totalSec % 60;

  const safeDays = String(days).padStart(2, "0");
  const safeHours = pad2(hours);
  const safeMins = pad2(mins);
  const safeSecs = pad2(secs);

  return (
    <section className={`relative w-full overflow-hidden ${heightClassName}`}
    style={{
      backgroundImage: "url('/Countdown/bg-graffiti.svg')",
      backgroundSize: "contain",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat"
    }}>
      {/* graffiti overlays */}
      {leftGraffitiSrc && (
        <img
          src={leftGraffitiSrc}
          alt=""
          className={[
            "pointer-events-none absolute z-5 opacity-90",
            "left-1 top-3 w-16", // phones
            "sm:left-3 sm:top-8 sm:w-30",
            "md:left-8 md:top-16 md:w-55",
          ].join(" ")}
          draggable={false}
        />
      )}

      {rightGraffitiSrc && (
        <img
          src={rightGraffitiSrc}
          alt=""
          className={[
            "pointer-events-none absolute z-5 opacity-90",
            "right-1 top-1 w-18", // phones
            "sm:right-3 sm:top-4 sm:w-35",
            "md:right-8 md:top-8 md:w-65",
          ].join(" ")}
          draggable={false}
        />
      )}

      <div className="relative z-10 flex h-full w-full flex-col items-center justify-start sm:justify-center px-3 sm:px-4 pt-6 sm:pt-0">
        <h2
          className="mb-4 sm:mb-6 md:mb-8 text-white text-4xl sm:text-5xl md:text-6xl drop-shadow-[0_4px_0_rgba(0,0,0,0.85)] tracking-wide"
          style={{ fontFamily: "Street Flow NYC", WebkitTextStroke: "6px black", paintOrder: "stroke" }}
        >
          {title}
        </h2>

        {/* ✅ MOBILE: no frame, stacked */}
        <div className="flex flex-col items-center gap-5 sm:hidden">
          <Block value={safeDays} label="days" />
          <Block value={safeHours} label="hours" />
          <Block value={safeMins} label="mins" />
          <Block value={safeSecs} label="sec" />
        </div>

        {/* ✅ SM+ (tablet/desktop): keep the frame */}
        <div className="relative hidden sm:block w-[min(980px,94vw)]">
          <img
            src={frameSrc}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />

          <div className="relative w-full px-8.5 py-7 md:px-15.5 md:py-11">
            <div className="flex items-end justify-center gap-8 md:gap-10">
              <Block value={safeDays} label="days" />
              <DotColon />
              <Block value={safeHours} label="hours" />
              <DotColon />
              <Block value={safeMins} label="mins" />
              <DotColon />
              <Block value={safeSecs} label="sec" />
            </div>
          </div>
        </div>

        <div className="relative mt-5 sm:mt-7 w-[min(980px,94vw)]">
          <div className="absolute right-0 top-0 flex items-center gap-2">
            <p
              className="text-emerald-200 text-lg sm:text-xl md:text-3xl drop-shadow-[0_3px_0_rgba(0,0,0,0.85)]"
              style={{ fontFamily: "Street Flow NYC", WebkitTextStroke: "3px black", paintOrder: "stroke" }}
            >
              {footerText}
            </p>
            <span className="mt-2 flex gap-2">
              <i className="h-2 w-2 rounded-full bg-emerald-200/90 shadow-[0_0_12px_rgba(110,231,183,0.55)]" />
              <i className="h-2 w-2 rounded-full bg-emerald-200/70 shadow-[0_0_12px_rgba(110,231,183,0.45)]" />
              <i className="h-2 w-2 rounded-full bg-emerald-200/55 shadow-[0_0_12px_rgba(110,231,183,0.35)]" />
            </span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .glitch {
          position: relative;
        }
        .glitch::before,
        .glitch::after {
          content: attr(data-text);
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          opacity: 0.22;
          pointer-events: none;
        }
        .glitch::before {
          transform: translate(1px, 0);
          clip-path: inset(0 0 55% 0);
        }
        .glitch::after {
          transform: translate(-1px, 0);
          clip-path: inset(55% 0 0 0);
        }
      `}</style>
    </section>
  );
}

function DotColon() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 pb-7">
      <span className="h-3 w-3 md:h-4 md:w-4 rounded-full bg-pink-200/95 shadow-[0_0_14px_rgba(255,112,190,0.22)]" />
      <span className="h-3 w-3 md:h-4 md:w-4 rounded-full bg-pink-200/95 shadow-[0_0_14px_rgba(255,112,190,0.22)]" />
    </div>
  );
}

function Block({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center w-35 sm:w-37.5 md:w-47.5">
      <div className="relative">
        <div
          className="glitch leading-none text-[72px] sm:text-[88px] md:text-[112px] text-white"
          style={{
            fontFamily: "Octin Spraypaint",
            WebkitTextStroke: "1px #ff2fb2",
          }}
          data-text={value}
          suppressHydrationWarning
        >
          {value}
        </div>
      </div>

      <div
        className="mt-2 sm:mt-4 text-[16px] sm:text-[22px] md:text-[26px] font-semibold text-emerald-200 tracking-wide drop-shadow-[0_2px_0_rgba(0,0,0,0.9)]"
        style={{ WebkitTextStroke: "0.8px black" }}
      >
        {label}
      </div>
    </div>
  );
}
