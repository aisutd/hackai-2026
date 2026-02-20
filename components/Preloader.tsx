import React, { useCallback, useEffect, useRef, useState } from "react";

type PreloaderProps = {
  onDone: () => void;
};

type HackAiWindow = Window & {
  __HACKAI_HOME_READY?: boolean;
};

const MIN_VISIBLE_MS = 4700;
const MAX_WAIT_MS = 14000;
const EXIT_DURATION_MS = 850;

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
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => beginExit());
      });
    };

    const maybeExit = () => {
      if (loadReady && homeReady && minReady) scheduleExit();
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
    <div className={`preloader-shell ${isExiting ? "is-exiting" : ""}`}>
      <div className="bg-layer" />

      <main className="scene" aria-label="Loading">
        <section className="copy-wrap">
          <h1 className="line l1">STEP INTO</h1>
          <h2 className="line l2">THE WORLD OF</h2>
          <h3 className="line gradient-line">
            <span>ARTIFICIAL</span>
            <span className="star">✦</span>
            <span>INTELLIGENCE</span>
          </h3>
        </section>

        <div className="progress-squiggle" aria-hidden>
          <svg viewBox="0 0 1260 140" className="squiggle-svg" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="squiggleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ff2f8f" />
                <stop offset="35%" stopColor="#ffd938" />
                <stop offset="68%" stopColor="#9cfb2d" />
                <stop offset="100%" stopColor="#3a67ff" />
              </linearGradient>
            </defs>
            <path
              className="squiggle-track"
              d="M10 90 C 90 15, 170 130, 250 62 C 320 6, 390 122, 470 68 C 560 8, 640 124, 720 56 C 805 5, 885 118, 965 62 C 1048 12, 1132 116, 1250 70"
            />
            <path
              pathLength={1000}
              className="squiggle-fill"
              d="M10 90 C 90 15, 170 130, 250 62 C 320 6, 390 122, 470 68 C 560 8, 640 124, 720 56 C 805 5, 885 118, 965 62 C 1048 12, 1132 116, 1250 70"
            />
          </svg>
        </div>
      </main>

      <style jsx>{`
        .preloader-shell {
          position: fixed;
          inset: 0;
          z-index: 9999;
          overflow: hidden;
        }

        .bg-layer {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 14% 22%, rgba(255, 47, 143, 0.22), transparent 42%),
            radial-gradient(circle at 85% 20%, rgba(58, 103, 255, 0.2), transparent 40%),
            radial-gradient(circle at 78% 80%, rgba(255, 217, 56, 0.18), transparent 45%),
            radial-gradient(circle at 20% 82%, rgba(156, 251, 45, 0.16), transparent 44%),
            #0c0f19;
          transition: opacity ${EXIT_DURATION_MS}ms ease;
        }

        .scene {
          position: relative;
          height: 100%;
          width: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          transition: opacity ${EXIT_DURATION_MS}ms ease, transform ${EXIT_DURATION_MS}ms ease;
        }

        .is-exiting .scene,
        .is-exiting .bg-layer {
          opacity: 0;
        }

        .is-exiting .scene {
          transform: scale(1.012);
        }

        .copy-wrap {
          position: relative;
          z-index: 2;
          text-align: center;
          width: min(96vw, 1400px);
          padding-inline: 1.2rem;
        }

        .line {
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          font-family: "Octin Spraypaint", "Arial Black", sans-serif;
          color: #3a67ff;
          line-height: 0.98;
          opacity: 0;
          transform: translateY(10px);
          animation: lineIn 500ms ease-out forwards;
        }

        .l1 {
          font-size: clamp(3.2rem, 7.8vw, 9.6rem);
          animation-delay: 320ms;
        }

        .l2 {
          margin-top: clamp(0.35rem, 1.1vw, 1rem);
          font-size: clamp(3.2rem, 7.8vw, 9.6rem);
          animation-delay: 540ms;
        }

        .gradient-line {
          margin-top: clamp(0.55rem, 1.6vw, 1.35rem);
          display: inline-flex;
          align-items: center;
          gap: clamp(0.4rem, 1.1vw, 1rem);
          font-size: clamp(2.9rem, 6.6vw, 8.4rem);
          background: linear-gradient(90deg, #ff2f8f 0%, #ffd938 35%, #9cfb2d 66%, #3a67ff 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation-delay: 760ms;
        }

        .star {
          font-size: 0.42em;
          line-height: 1;
          transform: translateY(-0.04em);
          color: #ffd938;
          -webkit-text-fill-color: #ffd938;
        }

        .progress-squiggle {
          position: absolute;
          left: 50%;
          bottom: max(12px, env(safe-area-inset-bottom));
          transform: translateX(-50%);
          width: min(80vw, 720px);
          height: auto;
          z-index: 2;
          opacity: 0.95;
        }

        .squiggle-svg {
          width: 100%;
          height: auto;
          overflow: visible;
        }

        .squiggle-track {
          fill: none;
          stroke: rgba(255, 255, 255, 0.16);
          stroke-width: 8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .squiggle-fill {
          fill: none;
          stroke: url(#squiggleGrad);
          stroke-width: 9;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 1000;
          stroke-dashoffset: 1000;
          filter: drop-shadow(0 0 7px rgba(255, 47, 143, 0.6))
            drop-shadow(0 0 7px rgba(156, 251, 45, 0.45));
          animation: drawLoad ${MIN_VISIBLE_MS}ms linear forwards;
        }

        @keyframes lineIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes drawLoad {
          from {
            stroke-dashoffset: 1000;
          }
          to {
            stroke-dashoffset: 0;
          }
        }

        @media (max-width: 900px) {
          .copy-wrap {
            padding-inline: 0.8rem;
          }

          .gradient-line {
            flex-wrap: wrap;
            justify-content: center;
            row-gap: 0.12em;
          }

          .progress-squiggle {
            width: min(88vw, 620px);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .line,
          .squiggle-fill {
            animation-duration: 1ms !important;
            animation-delay: 0ms !important;
            animation-iteration-count: 1 !important;
          }
          .scene,
          .bg-layer {
            transition-duration: 1ms !important;
          }
          .squiggle-fill {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
}
