import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

const SCRIBBLE_FADE_DELAY_MS = 2000;
const SCRIBBLE_FADE_DURATION_MS = 700;

type Point = { x: number; y: number };

type LogoScribbleProps = {
  className?: string;
  onLogoLoad?: () => void;
};

export default function LogoScribble({ className = "", onLogoLoad }: LogoScribbleProps) {
  const [scribbleEnabled, setScribbleEnabled] = useState(true);
  const [brushColor, setBrushColor] = useState("#ff7a00");

  const logoAreaRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const inkOpacityRef = useRef(1);
  const fadeTimerRef = useRef<number | null>(null);
  const fadeFrameRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  const cancelFade = useCallback(() => {
    if (fadeTimerRef.current) {
      window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (fadeFrameRef.current) {
      window.cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = null;
    }
  }, []);

  const renderMaskedInk = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const inkCanvas = inkCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!canvas || !ctx || !inkCanvas || !maskCanvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.globalAlpha = inkOpacityRef.current;
    ctx.drawImage(inkCanvas, 0, 0);
    ctx.restore();

    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }, []);

  const startFadeOut = useCallback(() => {
    cancelFade();
    const inkCanvas = inkCanvasRef.current;
    if (!inkCanvas) return;
    const inkCtx = inkCanvas.getContext("2d");
    if (!inkCtx) return;

    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / SCRIBBLE_FADE_DURATION_MS);
      inkOpacityRef.current = 1 - progress;
      renderMaskedInk();

      if (progress < 1) {
        fadeFrameRef.current = window.requestAnimationFrame(step);
        return;
      }

      inkCtx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
      inkOpacityRef.current = 1;
      renderMaskedInk();
      fadeFrameRef.current = null;
    };

    fadeFrameRef.current = window.requestAnimationFrame(step);
  }, [cancelFade, renderMaskedInk]);

  const scheduleFadeOut = useCallback(() => {
    cancelFade();
    fadeTimerRef.current = window.setTimeout(() => {
      startFadeOut();
    }, SCRIBBLE_FADE_DELAY_MS);
  }, [cancelFade, startFadeOut]);

  const setupScribbleCanvas = useCallback(() => {
    const host = logoAreaRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.floor(rect.width * dpr));
    const pixelHeight = Math.max(1, Math.floor(rect.height * dpr));

    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const inkCanvas = document.createElement("canvas");
    inkCanvas.width = pixelWidth;
    inkCanvas.height = pixelHeight;
    inkCanvasRef.current = inkCanvas;

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = pixelWidth;
    maskCanvas.height = pixelHeight;
    maskCanvasRef.current = maskCanvas;

    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) {
      renderMaskedInk();
      return;
    }

    const maskImage = new window.Image();
    maskImage.src = "/Home/hackAiLogoWhite.png";
    maskImage.onload = () => {
      const currentMask = maskCanvasRef.current;
      if (!currentMask) return;
      if (currentMask.width !== pixelWidth || currentMask.height !== pixelHeight) return;

      maskCtx.clearRect(0, 0, pixelWidth, pixelHeight);
      maskCtx.drawImage(maskImage, 0, 0, pixelWidth, pixelHeight);
      renderMaskedInk();
    };
  }, [renderMaskedInk]);

  const toCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  }, []);

  const drawSegment = useCallback(
    (from: Point, to: Point) => {
      const inkCanvas = inkCanvasRef.current;
      if (!inkCanvas) return;
      const inkCtx = inkCanvas.getContext("2d");
      if (!inkCtx) return;

      const dpr = window.devicePixelRatio || 1;
      inkCtx.strokeStyle = brushColor;
      inkCtx.lineCap = "round";
      inkCtx.lineJoin = "round";
      inkCtx.lineWidth = 10 * dpr;
      inkCtx.beginPath();
      inkCtx.moveTo(from.x, from.y);
      inkCtx.lineTo(to.x, to.y);
      inkCtx.stroke();

      inkOpacityRef.current = 1;
      renderMaskedInk();
    },
    [brushColor, renderMaskedInk]
  );

  const finishStroke = useCallback(() => {
    drawingRef.current = false;
    lastPointRef.current = null;
    scheduleFadeOut();
  }, [scheduleFadeOut]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!scribbleEnabled) return;
      const point = toCanvasPoint(event);
      if (!point) return;

      cancelFade();
      inkOpacityRef.current = 1;
      drawingRef.current = true;
      lastPointRef.current = point;
      pointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      drawSegment(point, point);
    },
    [cancelFade, drawSegment, scribbleEnabled, toCanvasPoint]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      if (pointerIdRef.current !== event.pointerId) return;
      const point = toCanvasPoint(event);
      if (!point || !lastPointRef.current) return;

      drawSegment(lastPointRef.current, point);
      lastPointRef.current = point;
    },
    [drawSegment, toCanvasPoint]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      finishStroke();
      pointerIdRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [finishStroke]
  );

  const handlePointerLeave = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      finishStroke();
      pointerIdRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [finishStroke]
  );

  useEffect(() => {
    const host = logoAreaRef.current;
    if (!host) return;

    setupScribbleCanvas();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => setupScribbleCanvas());
    observer.observe(host);
    return () => observer.disconnect();
  }, [setupScribbleCanvas]);

  useEffect(() => {
    if (scribbleEnabled) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    pointerIdRef.current = null;
  }, [scribbleEnabled]);

  useEffect(() => {
    return () => {
      cancelFade();
    };
  }, [cancelFade]);

  return (
    <div ref={logoAreaRef} className={`relative w-[min(96vw,1080px)] ${className}`}>
      <Image
        src="/Home/hackAiLogoWhite.png"
        alt="hackAi Logo"
        width={1120}
        height={1120}
        priority
        className="h-auto w-full pointer-events-none select-none"
        onLoad={onLogoLoad}
      />

      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full ${
          scribbleEnabled ? "cursor-crosshair pointer-events-auto" : "pointer-events-none"
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerLeave}
        onPointerLeave={handlePointerLeave}
      />

      <div className="absolute left-1/2 -translate-x-1/2 -top-14 z-30 flex items-center gap-3 rounded-full border border-white/25 bg-black/45 px-3 py-2 backdrop-blur-sm">
        <label
          className="flex items-center gap-2 text-white text-xs sm:text-sm tracking-wide"
          style={{ fontFamily: "Street Flow NYC" }}
        >
          Color
          <input
            aria-label="Scribble color"
            type="color"
            value={brushColor}
            onChange={(event) => setBrushColor(event.target.value)}
            className="h-6 w-8 rounded border-0 bg-transparent p-0"
          />
        </label>

        <button
          type="button"
          onClick={() => setScribbleEnabled((prev) => !prev)}
          className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs sm:text-sm text-white"
          style={{ fontFamily: "Street Flow NYC" }}
        >
          {scribbleEnabled ? "Scribble: On" : "Scribble: Off"}
        </button>
      </div>
    </div>
  );
}
