import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import LogoScribble from "@/components/LogoScribble";

const CRITICAL_HOME_ASSETS = 4;

type HackAiWindow = Window & {
  __HACKAI_HOME_READY?: boolean;
  __HACKAI_PRELOADER_DONE?: boolean;
};

export default function Home() {
  const [showHome, setShowHome] = useState(() => {
    if (typeof window === "undefined") return false;
    return (window as HackAiWindow).__HACKAI_PRELOADER_DONE === true;
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
    const onPreloaderDone = () => setShowHome(true);
    window.addEventListener("hackai-preloader-done", onPreloaderDone, { once: true });

    const safetyTimer = window.setTimeout(() => notifyHomeReady(), 5000);
    return () => {
      window.clearTimeout(safetyTimer);
      window.removeEventListener("hackai-preloader-done", onPreloaderDone);
    };
  }, [notifyHomeReady]);

  return (
    <div className="flex items-center w-full justify-center h-full">
      <div className="relative w-full max-w-400 h-[90vh] max-h-225">
        <div className={`home-content ${showHome ? "is-visible" : ""}`}>
          {/* <div
            className="scribble-hint absolute left-1/2 top-1/2 z-40 pointer-events-none -translate-x-[132%] -translate-y-[103%] -rotate-12"
          >
            <span
              className="rounded-full border border-white/35 bg-black/45 px-3 py-1 text-[10px] sm:text-xs uppercase tracking-wider text-white/95"
              style={{ fontFamily: "Street Flow NYC" }}
            >
              Try scribbling
            </span>
          </div> */}

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
      </div>

      <style jsx>{`
        .home-content {
          position: relative;
          width: 100%;
          height: 100%;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: opacity 180ms ease-out;
        }

        .home-content.is-visible {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
        }

        @media (max-width: 900px) {
          .scribble-hint {
            transform: translateX(-118%) translateY(-95%) rotate(-10deg);
          }
        }
      `}</style>
    </div>
  );
}
