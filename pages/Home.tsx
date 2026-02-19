import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import LogoScribble from "@/components/LogoScribble";

const CRITICAL_HOME_ASSETS = 4;
const SPRAY_REVEAL_MS = 1050;

type HackAiWindow = Window & {
  __HACKAI_HOME_READY?: boolean;
  __HACKAI_PRELOADER_DONE?: boolean;
};

type RevealPhase = "hidden" | "spray" | "visible";

export default function Home() {
  const [revealPhase, setRevealPhase] = useState<RevealPhase>(() => {
    if (typeof window === "undefined") return "hidden";
    return (window as HackAiWindow).__HACKAI_PRELOADER_DONE === true
      ? "visible"
      : "hidden";
  });

  const loadedAssetsRef = useRef(0);
  const readySentRef = useRef(false);

  const notifyHomeReady = useCallback(() => {
    if (readySentRef.current || typeof window === "undefined") return;
    readySentRef.current = true;
    const w = window as HackAiWindow;
    w.__HACKAI_HOME_READY = true;
    window.dispatchEvent(new Event("hackai-home-ready"));
  }, []);

  const handleCriticalAssetLoad = useCallback(() => {
    loadedAssetsRef.current += 1;
    if (loadedAssetsRef.current >= CRITICAL_HOME_ASSETS) {
      notifyHomeReady();
    }
  }, [notifyHomeReady]);

  useEffect(() => {
    let revealTimer: number | null = null;

    const startSprayReveal = () => {
      setRevealPhase("spray");
      revealTimer = window.setTimeout(() => {
        setRevealPhase("visible");
      }, SPRAY_REVEAL_MS);
    };

    if (!(window as HackAiWindow).__HACKAI_PRELOADER_DONE) {
      window.addEventListener("hackai-preloader-done", startSprayReveal, {
        once: true,
      });
    }

    const safetyTimer = window.setTimeout(() => notifyHomeReady(), 5000);
    return () => {
      window.clearTimeout(safetyTimer);
      if (revealTimer) window.clearTimeout(revealTimer);
      window.removeEventListener("hackai-preloader-done", startSprayReveal);
    };
  }, [notifyHomeReady]);

  return (
    <div className="flex items-center w-full justify-center h-full">
      <div className="relative w-full max-w-400 h-[90vh] max-h-225">
        <div className={`home-content ${revealPhase === "visible" ? "is-visible" : ""}`}>
          <div
            className="absolute left-1/2 top-[21%] -translate-x-1/2 z-30 text-center text-white text-lg md:text-2xl leading-tight drop-shadow-[0_3px_0_rgba(0,0,0,0.9)] uppercase tracking-widest"
            style={{ fontFamily: "Street Flow NYC", WebkitTextStroke: "1px black" }}
          >
            Artificial Intelligence Society Presents
          </div>

          <Image
            src="/Home/graffitti.svg"
            alt="Graffitti outer"
            fill
            className="object-contain"
            priority
            onLoad={handleCriticalAssetLoad}
          />

          <Image
            src="/Home/splatters.svg"
            alt="Graffitti inner"
            fill
            className="object-contain pointer-events-none"
            style={{
              transform:
                "translateX(clamp(-160px, -8vw, -20px)) translateY(clamp(6px, 1vw, 18px))",
              transformOrigin: "center",
            }}
            priority
            onLoad={handleCriticalAssetLoad}
          />

          <LogoScribble
            className="absolute left-[50%] top-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
            onLogoLoad={handleCriticalAssetLoad}
          />

          <div
            className="absolute left-1/2 top-[66%] -translate-x-1/2 z-30 text-center text-white text-2xl md:text-4xl drop-shadow-[0_4px_0_rgba(0,0,0,0.9)] uppercase tracking-widest mt-12"
            style={{ fontFamily: "Street Flow NYC", WebkitTextStroke: "2px black" }}
          >
            March 7-8, 2026
          </div>

          <div className="absolute left-1/2 bottom-[8%] -translate-x-1/2 z-30 flex gap-6">
            <button
              type="button"
              onClick={() =>
                window.open("https://coda.io/form/Hack-AI-2026_dlNfpT9nhkE", "_blank")
              }
              className="apply-now-animated"
              style={{ fontFamily: "Octin Spraypaint" }}
            >
              APPLY NOW!
            </button>
          </div>

          <div className="absolute z-30 right-3 bottom-4 w-37.5 sm:right-6 sm:bottom-6 sm:w-47.5 md:right-10 md:bottom-10 md:w-65 lg:w-75 pointer-events-none">
            <div className="relative w-full aspect-square rotate-20 origin-center">
              <Image
                src="/Home/heart.svg"
                alt="Heart"
                fill
                className="object-contain"
                priority
                onLoad={handleCriticalAssetLoad}
              />
              <div className="absolute inset-0 flex items-center justify-center px-5 sm:px-7 md:px-8 text-center">
                <p
                  className="text-white text-sm sm:text-base md:text-xl lg:text-2xl leading-tight drop-shadow-[0_3px_0_rgba(0,0,0,0.85)]"
                  style={{
                    fontFamily: "Octin Spraypaint",
                    WebkitTextStroke: "0.5px black",
                  }}
                >
                  Apps close on <span className="text-pink-300">Feb 24th</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {revealPhase === "spray" ? (
          <div className="spray-reveal" aria-hidden>
            <span className="spray-wash" />
            <span className="spray-burst b1" />
            <span className="spray-burst b2" />
            <span className="spray-burst b3" />
          </div>
        ) : null}
      </div>

      <style jsx>{`
        .home-content {
          position: relative;
          width: 100%;
          height: 100%;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: opacity 420ms ease;
        }

        .home-content.is-visible {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
        }

        .spray-reveal {
          position: absolute;
          inset: -8%;
          z-index: 70;
          pointer-events: none;
          overflow: hidden;
        }

        .spray-wash {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 20% 58%, rgba(249, 115, 22, 0.95), transparent 26%),
            radial-gradient(circle at 80% 42%, rgba(56, 189, 248, 0.9), transparent 24%),
            radial-gradient(circle at 52% 52%, rgba(250, 204, 21, 0.7), transparent 35%);
          mix-blend-mode: screen;
          animation: spraySweep ${SPRAY_REVEAL_MS}ms cubic-bezier(0.18, 0.88, 0.22, 1) forwards;
        }

        .spray-burst {
          position: absolute;
          border-radius: 9999px;
          filter: blur(1px);
          opacity: 0;
          animation: sprayBurst 720ms ease-out forwards;
        }

        .b1 {
          left: 18%;
          top: 52%;
          width: 130px;
          height: 95px;
          background: rgba(249, 115, 22, 0.88);
        }

        .b2 {
          left: 70%;
          top: 38%;
          width: 110px;
          height: 84px;
          background: rgba(56, 189, 248, 0.86);
          animation-delay: 120ms;
        }

        .b3 {
          left: 44%;
          top: 56%;
          width: 150px;
          height: 112px;
          background: rgba(250, 204, 21, 0.8);
          animation-delay: 170ms;
        }

        @keyframes spraySweep {
          0% {
            opacity: 0;
            clip-path: circle(3% at 18% 58%);
            transform: scale(1.06);
          }
          40% {
            opacity: 0.95;
          }
          100% {
            opacity: 0;
            clip-path: circle(140% at 50% 50%);
            transform: scale(1);
          }
        }

        @keyframes sprayBurst {
          0% {
            opacity: 0;
            transform: scale(0.2);
          }
          35% {
            opacity: 0.95;
          }
          100% {
            opacity: 0;
            transform: scale(2.2);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .home-content {
            transition-duration: 1ms;
          }
          .spray-wash,
          .spray-burst {
            animation-duration: 1ms !important;
          }
        }
      `}</style>
    </div>
  );
}
