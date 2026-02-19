import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

type PreloaderProps = {
  onDone: () => void;
};

type HackAiWindow = Window & {
  __HACKAI_HOME_READY?: boolean;
};

const MIN_VISIBLE_MS = 4700;
const MAX_WAIT_MS = 14000;
const EXIT_DURATION_MS = 1100;

const PAINT_DOTS = [
  { left: "12%", top: "28%", size: 7, delay: 400, color: "#f97316" },
  { left: "18%", top: "34%", size: 10, delay: 500, color: "#f59e0b" },
  { left: "81%", top: "31%", size: 8, delay: 650, color: "#38bdf8" },
  { left: "74%", top: "40%", size: 12, delay: 760, color: "#22d3ee" },
  { left: "23%", top: "66%", size: 8, delay: 880, color: "#eab308" },
  { left: "70%", top: "68%", size: 11, delay: 950, color: "#fb7185" },
  { left: "49%", top: "22%", size: 7, delay: 1120, color: "#f97316" },
  { left: "52%", top: "75%", size: 10, delay: 1200, color: "#38bdf8" },
];

export default function Preloader({ onDone }: PreloaderProps) {
  const finishedRef = useRef(false);
  const exitingRef = useRef(false);
  const [isExiting, setIsExiting] = useState(false);

  const finishOnce = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    let loadReady = document.readyState === "complete";
    let homeReady = (window as HackAiWindow).__HACKAI_HOME_READY === true;
    let minReady = false;
    let exitScheduled = false;
    let exitTimer: number | null = null;

    const beginExit = () => {
      if (exitingRef.current || finishedRef.current) return;
      exitingRef.current = true;
      setIsExiting(true);
      exitTimer = window.setTimeout(() => finishOnce(), EXIT_DURATION_MS);
    };

    const scheduleExit = () => {
      if (exitScheduled || exitingRef.current || finishedRef.current) return;
      exitScheduled = true;

      // Ensure the page paints behind the preloader before we fade out.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => beginExit());
      });
    };

    const maybeExit = () => {
      if (loadReady && minReady && homeReady) {
        scheduleExit();
      }
    };

    const onWindowLoad = () => {
      loadReady = true;
      maybeExit();
    };

    const onHomeReady = () => {
      homeReady = true;
      maybeExit();
    };

    const minTimer = window.setTimeout(() => {
      minReady = true;
      maybeExit();
    }, MIN_VISIBLE_MS);

    const forceTimer = window.setTimeout(() => {
      beginExit();
    }, MAX_WAIT_MS);

    if (!loadReady) {
      window.addEventListener("load", onWindowLoad, { once: true });
    } else {
      maybeExit();
    }

    if (!homeReady) {
      window.addEventListener("hackai-home-ready", onHomeReady, { once: true });
    }

    return () => {
      window.clearTimeout(minTimer);
      window.clearTimeout(forceTimer);
      if (exitTimer) window.clearTimeout(exitTimer);
      window.removeEventListener("load", onWindowLoad);
      window.removeEventListener("hackai-home-ready", onHomeReady);
    };
  }, [finishOnce]);

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black ${isExiting ? "is-exiting" : ""}`}
    >
      <div className="wall-layer absolute inset-0" />
      <div className="handoff-layer absolute inset-0" />

      <div className="paint-field absolute inset-0 pointer-events-none">
        {PAINT_DOTS.map((dot, idx) => (
          <span
            key={`${dot.left}-${dot.top}-${idx}`}
            className="paint-dot"
            style={{
              left: dot.left,
              top: dot.top,
              width: `${dot.size}px`,
              height: `${dot.size}px`,
              animationDelay: `${dot.delay}ms`,
              background: dot.color,
            }}
          />
        ))}
      </div>

      <div className="preloader-scene relative z-10 flex h-full items-center justify-center px-6">
        <div className="w-full max-w-5xl">
          <div className="center-stage">
            <div className="scribble-wrap">
              <svg
                className="scribble-svg"
                viewBox="0 0 980 290"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <path
                  className="scribble s1"
                  d="M18 168 C102 38 222 254 342 142 C428 57 510 212 618 124 C742 18 862 228 962 110"
                />
                <path
                  className="scribble s2"
                  d="M30 206 C138 100 236 272 354 188 C472 108 590 282 708 176 C818 84 898 240 952 208"
                />
                <path
                  className="scribble s3"
                  d="M56 96 C180 24 272 176 400 106 C534 34 648 178 794 104 C872 66 934 124 972 90"
                />
                <path className="paint-drip d1" d="M318 186 v34" />
                <path className="paint-drip d2" d="M624 148 v42" />
                <path className="paint-drip d3" d="M806 118 v36" />
              </svg>
            </div>

            <div className="logo-wrap">
              <div className="logo-shield" aria-hidden />
              <Image
                src="/Home/ais_logo_white.png"
                alt="HackAI 2026"
                width={640}
                height={200}
                priority
                className="logo-image h-auto w-[min(90vw,620px)]"
              />
            </div>
          </div>

          <div className="hud">
            <p className="status-copy">Spraying the wall...</p>
            <div className="progress-track" aria-hidden>
              <span className="progress-fill" />
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .preloader-scene {
          transition: opacity ${EXIT_DURATION_MS}ms ease, transform ${EXIT_DURATION_MS}ms ease;
        }

        .is-exiting .preloader-scene {
          opacity: 0;
          transform: scale(1.01);
        }

        .wall-layer {
          background:
            radial-gradient(circle at 12% 16%, rgba(249, 115, 22, 0.22), transparent 28%),
            radial-gradient(circle at 84% 24%, rgba(56, 189, 248, 0.2), transparent 24%),
            radial-gradient(circle at 45% 90%, rgba(250, 204, 21, 0.16), transparent 25%),
            linear-gradient(145deg, #050505 0%, #0b0b0b 50%, #080808 100%);
          animation: wallDrift 9s ease-in-out infinite alternate;
          transition: filter ${EXIT_DURATION_MS}ms ease, opacity ${EXIT_DURATION_MS}ms ease;
        }

        .is-exiting .wall-layer {
          opacity: 0.3;
          filter: saturate(0.75) brightness(0.85);
        }

        .handoff-layer {
          opacity: 0;
          background:
            radial-gradient(circle at 12% 24%, rgba(249, 115, 22, 0.52), transparent 35%),
            radial-gradient(circle at 86% 18%, rgba(56, 189, 248, 0.44), transparent 34%),
            radial-gradient(circle at 48% 88%, rgba(250, 204, 21, 0.24), transparent 40%),
            linear-gradient(120deg, rgba(249, 115, 22, 0.42) 0%, rgba(250, 204, 21, 0.26) 38%, rgba(56, 189, 248, 0.42) 72%, rgba(3, 7, 18, 0.48) 100%),
            url("/mainbg.svg");
          background-size: 200% 200%, 180% 180%, 220% 220%, 240% 240%, cover;
          background-position: 0% 50%, 100% 10%, 50% 100%, 0% 50%, center;
          background-repeat: no-repeat;
          filter: saturate(1.1);
          transform: scale(1);
          transition: opacity ${EXIT_DURATION_MS}ms ease, transform ${EXIT_DURATION_MS}ms ease;
          animation: handoffFlow 7.5s ease-in-out infinite alternate;
        }

        .is-exiting .handoff-layer {
          opacity: 1;
          transform: scale(1.025);
        }

        .center-stage {
          position: relative;
          width: min(95vw, 1020px);
          height: min(43vw, 290px);
          min-height: 190px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          isolation: isolate;
        }

        .paint-field {
          z-index: 0;
          -webkit-mask-image: radial-gradient(ellipse 38% 24% at 50% 52%, transparent 0%, transparent 56%, black 68%);
          mask-image: radial-gradient(ellipse 38% 24% at 50% 52%, transparent 0%, transparent 56%, black 68%);
        }

        .scribble-wrap {
          position: absolute;
          inset: 0;
          margin-inline: auto;
          width: min(95vw, 980px);
          filter: drop-shadow(0 0 12px rgba(248, 113, 113, 0.18))
            drop-shadow(0 0 16px rgba(125, 211, 252, 0.12));
          display: flex;
          align-items: center;
          z-index: 1;
          -webkit-mask-image: radial-gradient(ellipse 38% 24% at 50% 52%, transparent 0%, transparent 56%, black 68%);
          mask-image: radial-gradient(ellipse 38% 24% at 50% 52%, transparent 0%, transparent 56%, black 68%);
        }

        .scribble-svg {
          width: 100%;
          height: auto;
        }

        .scribble {
          fill: none;
          stroke-linecap: round;
          stroke-width: 9;
          stroke-dasharray: 1600;
          stroke-dashoffset: 1600;
          animation: drawScribble 2.8s cubic-bezier(0.12, 0.66, 0.22, 1) forwards;
        }

        .s1 {
          stroke: #f97316;
          animation-delay: 200ms;
        }

        .s2 {
          stroke: #38bdf8;
          stroke-width: 8;
          animation-delay: 720ms;
        }

        .s3 {
          stroke: #facc15;
          stroke-width: 7;
          animation-delay: 1120ms;
        }

        .paint-drip {
          fill: none;
          stroke-linecap: round;
          stroke-width: 6;
          opacity: 0;
          animation: dripDown 1100ms ease-out forwards;
        }

        .d1 {
          stroke: #f97316;
          animation-delay: 1550ms;
        }

        .d2 {
          stroke: #38bdf8;
          animation-delay: 1720ms;
        }

        .d3 {
          stroke: #facc15;
          animation-delay: 1860ms;
        }

        .paint-dot {
          position: absolute;
          border-radius: 9999px;
          opacity: 0;
          filter: blur(0.35px);
          animation: paintPop 780ms ease-out forwards;
        }

        .logo-wrap {
          position: relative;
          z-index: 5;
          display: flex;
          justify-content: center;
          align-items: center;
          opacity: 0;
          transform: translateY(10px);
          animation: logoIn 1300ms ease-out 1700ms forwards;
        }

        .logo-shield {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: min(82vw, 560px);
          height: min(24vw, 170px);
          background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.86) 0%, rgba(0, 0, 0, 0.68) 54%, rgba(0, 0, 0, 0) 100%);
          filter: blur(6px);
          z-index: 0;
        }

        .logo-image {
          position: relative;
          z-index: 1;
        }

        .hud {
          margin-top: 1.2rem;
        }

        .status-copy {
          text-align: center;
          color: rgba(255, 249, 219, 0.95);
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-size: 0.76rem;
          opacity: 0;
          animation: fadeUp 900ms ease-out 2200ms forwards;
        }

        .progress-track {
          margin: 0.95rem auto 0;
          width: min(86vw, 360px);
          height: 8px;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.14);
          overflow: hidden;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
        }

        .progress-fill {
          display: block;
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #f97316 0%, #facc15 50%, #38bdf8 100%);
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.45);
          animation: fillTrack ${MIN_VISIBLE_MS}ms linear forwards;
        }

        @keyframes wallDrift {
          0% {
            transform: scale(1) translate3d(0, 0, 0);
          }
          100% {
            transform: scale(1.03) translate3d(-6px, 3px, 0);
          }
        }

        @keyframes handoffFlow {
          0% {
            background-position: 0% 50%, 100% 10%, 50% 100%, 0% 50%, center;
          }
          50% {
            background-position: 38% 58%, 62% 30%, 50% 85%, 58% 48%, center;
          }
          100% {
            background-position: 100% 46%, 0% 35%, 50% 70%, 100% 42%, center;
          }
        }

        @keyframes drawScribble {
          0% {
            stroke-dashoffset: 1600;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }

        @keyframes dripDown {
          0% {
            opacity: 0;
            stroke-dasharray: 0 100;
          }
          45% {
            opacity: 0.9;
          }
          100% {
            opacity: 0.65;
            stroke-dasharray: 50 100;
          }
        }

        @keyframes paintPop {
          0% {
            opacity: 0;
            transform: scale(0.25);
          }
          70% {
            opacity: 0.9;
            transform: scale(1.2);
          }
          100% {
            opacity: 0.7;
            transform: scale(1);
          }
        }

        @keyframes logoIn {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeUp {
          0% {
            opacity: 0;
            transform: translateY(6px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fillTrack {
          0% {
            width: 0%;
          }
          100% {
            width: 100%;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .wall-layer,
          .scribble,
          .paint-drip,
          .paint-dot,
          .logo-wrap,
          .status-copy,
          .progress-fill {
            animation-duration: 1ms !important;
            animation-delay: 0ms !important;
            animation-iteration-count: 1 !important;
          }
          .preloader-scene,
          .wall-layer,
          .handoff-layer {
            transition-duration: 1ms !important;
          }
          .progress-fill {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
