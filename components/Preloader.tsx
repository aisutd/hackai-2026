import React, { useEffect, useRef } from "react";
import Image from "next/image";

type PreloaderProps = {
  onDone: () => void;
  minDuration?: number;
};

export default function Preloader({ onDone, minDuration = 800 }: PreloaderProps) {
  const finishedRef = useRef(false);
  const startTimeRef = useRef(Date.now());

  const finishOnce = () => {
    if (finishedRef.current) return;
    const elapsed = Date.now() - startTimeRef.current;
    if (elapsed < minDuration) {
      setTimeout(() => finishOnce(), minDuration - elapsed);
      return;
    }
    finishedRef.current = true;
    onDone();
  };

  // Fallback in case nothing triggers finish
  useEffect(() => {
    const id = window.setTimeout(() => finishOnce(), 2000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="fixed inset-0 z-9999 pointer-events-none bg-black">
      {/* Content */}
      <div className="pt-20 absolute inset-0 z-1 flex h-full items-center justify-center flex-col pointer-events-auto">
        

        <Image
          src="/Home/ais_logo_white.png"
          alt="HackAI 2026"
          width={600}
          height={200}
          priority
          className="fade-in relative z-10"
          onLoadingComplete={finishOnce}
        />

        <div className="flex flex-col items-center text-[#fff9f5] font-allerta gap-2 fade-in">
          <span className="text-3xl font-allerta mt-4 fade-in"
          style={{ fontFamily: "Street Flow NYC" }}>PRESENTS</span>
        </div>
      </div>

      {/* Graffiti elements overlaying the entire page */}
      <div className="absolute inset-0 pointer-events-none z-20">
        {/* Spray paint dots - scattered around */}
        <div className="spray-dot spray-1" style={{ left: '15%', top: '25%' }} />
        <div className="spray-dot spray-2" style={{ left: '18%', top: '22%' }} />
        <div className="spray-dot spray-3" style={{ left: '12%', top: '30%' }} />
        <div className="spray-dot spray-4" style={{ left: '20%', top: '28%' }} />
        <div className="spray-dot spray-5" style={{ left: '10%', top: '35%' }} />
        
        <div className="spray-dot spray-6" style={{ right: '15%', top: '27%' }} />
        <div className="spray-dot spray-7" style={{ right: '18%', top: '25%' }} />
        <div className="spray-dot spray-8" style={{ right: '12%', top: '32%' }} />
        <div className="spray-dot spray-9" style={{ right: '20%', top: '29%' }} />
        
        {/* More scattered dots */}
        <div className="spray-dot spray-1" style={{ left: '25%', top: '60%' }} />
        <div className="spray-dot spray-3" style={{ left: '30%', top: '15%' }} />
        <div className="spray-dot spray-5" style={{ right: '25%', top: '65%' }} />
        <div className="spray-dot spray-7" style={{ right: '30%', top: '18%' }} />
        
        {/* Underline strokes */}
        {/* <div className="graffiti-line line-1" style={{ top: '52%', left: '10%', width: '80%' }} /> */}
        <div className="graffiti-line line-2" style={{ top: '50%', left: '15%', width: '25%' }} />
        <div className="graffiti-line line-3" style={{ top: '50%', right: '15%', width: '25%' }} />
        
        {/* Accent slashes - corners */}
        <div className="graffiti-slash slash-1" style={{ left: '8%', top: '20%' }} />
        <div className="graffiti-slash slash-2" style={{ left: '5%', top: '25%' }} />
        
        <div className="graffiti-slash slash-3" style={{ right: '8%', top: '20%' }} />
        <div className="graffiti-slash slash-4" style={{ right: '5%', top: '25%' }} />
        
        {/* Bottom corners */}
        <div className="graffiti-slash slash-1" style={{ left: '10%', bottom: '15%' }} />
        <div className="graffiti-slash slash-3" style={{ right: '10%', bottom: '15%' }} />
        
        {/* Geometric shapes */}
        <div className="graffiti-shape shape-triangle-1" style={{ left: '5%', top: '55%' }} />
        <div className="graffiti-shape shape-triangle-2" style={{ right: '5%', top: '55%' }} />
        <div className="graffiti-shape shape-star" style={{ left: '50%', top: '30%', transform: 'translateX(-50%)' }} />
        
        {/* Additional shapes */}
        <div className="graffiti-shape shape-triangle-1" style={{ left: '8%', bottom: '20%' }} />
        <div className="graffiti-shape shape-triangle-2" style={{ right: '8%', bottom: '20%' }} />
        
        {/* Drips */}
        <div className="drip drip-1" style={{ left: '20%', top: '52%' }} />
        <div className="drip drip-2" style={{ left: '80%', top: '52%' }} />
        <div className="drip drip-3" style={{ left: '50%', top: '52%' }} />
        <div className="drip drip-1" style={{ left: '35%', top: '52%' }} />
        <div className="drip drip-2" style={{ left: '65%', top: '52%' }} />
      </div>

      <style jsx>{`
        .fade-in {
          opacity: 0;
          animation: fadeIn 0.8s ease-out 0.3s forwards;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Spray paint dots */
        .spray-dot {
          position: absolute;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ff6b9d;
          opacity: 0;
          animation: sprayAppear 0.4s ease-out forwards;
          filter: blur(0.5px);
        }

        .spray-dot:nth-child(2n) {
          background: #4facfe;
        }

        .spray-dot:nth-child(3n) {
          background: #ffd93d;
          width: 6px;
          height: 6px;
        }

        .spray-1 { animation-delay: 1.2s; }
        .spray-2 { animation-delay: 1.25s; width: 5px; height: 5px; }
        .spray-3 { animation-delay: 1.3s; width: 7px; height: 7px; }
        .spray-4 { animation-delay: 1.35s; width: 6px; height: 6px; }
        .spray-5 { animation-delay: 1.4s; }
        .spray-6 { animation-delay: 1.45s; }
        .spray-7 { animation-delay: 1.5s; width: 6px; height: 6px; }
        .spray-8 { animation-delay: 1.55s; }
        .spray-9 { animation-delay: 1.6s; width: 5px; height: 5px; }

        @keyframes sprayAppear {
          0% {
            opacity: 0;
            transform: scale(0);
          }
          60% {
            opacity: 0.9;
            transform: scale(1.4);
          }
          100% {
            opacity: 0.7;
            transform: scale(1);
          }
        }

        /* Graffiti lines */
        .graffiti-line {
          position: absolute;
          height: 4px;
          background: linear-gradient(90deg, 
            transparent 0%, 
            #837028 10%, 
            #ffd93d 90%, 
            transparent 100%);
          border-radius: 2px;
          opacity: 0;
          transform: scaleX(0);
          transform-origin: left;
          animation: drawLine 0.8s ease-out forwards;
          box-shadow: 0 0 8px rgba(255, 217, 61, 0.4);
        }

        .line-1 { animation-delay: 1.7s; }
        .line-2 { 
          animation-delay: 1.85s; 
          background: linear-gradient(90deg, transparent 0%, #ff6b9d 20%, #ff6b9d 80%, transparent 100%);
          height: 3px;
          box-shadow: 0 0 6px rgba(255, 107, 157, 0.4);
        }
        .line-3 { 
          animation-delay: 1.9s;
          background: linear-gradient(90deg, transparent 0%, #4facfe 20%, #4facfe 80%, transparent 100%);
          height: 3px;
          box-shadow: 0 0 6px rgba(79, 172, 254, 0.4);
          transform-origin: right;
        }

        @keyframes drawLine {
          0% {
            opacity: 0;
            transform: scaleX(0);
          }
          100% {
            opacity: 0.8;
            transform: scaleX(1);
          }
        }

        /* Graffiti slashes */
        .graffiti-slash {
          position: absolute;
          width: 60px;
          height: 3px;
          background: #ff6b9d;
          transform: rotate(-25deg);
          opacity: 0;
          animation: slashAppear 0.3s ease-out forwards;
          box-shadow: 0 0 6px rgba(255, 107, 157, 0.5);
          border-radius: 2px;
        }

        .slash-1 { animation-delay: 2s; }
        .slash-2 { 
          animation-delay: 2.1s; 
          width: 50px;
          background: #c44569;
        }
        .slash-3 { 
          animation-delay: 2.15s;
          background: #4facfe;
          box-shadow: 0 0 6px rgba(79, 172, 254, 0.5);
        }
        .slash-4 { 
          animation-delay: 2.25s;
          width: 50px;
          background: #00f2fe;
          box-shadow: 0 0 6px rgba(0, 242, 254, 0.5);
        }

        @keyframes slashAppear {
          0% {
            opacity: 0;
            transform: rotate(-25deg) scaleX(0);
          }
          100% {
            opacity: 0.7;
            transform: rotate(-25deg) scaleX(1);
          }
        }

        /* Geometric shapes */
        .graffiti-shape {
          position: absolute;
          opacity: 0;
          animation: shapePop 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
        }

        .shape-triangle-1,
        .shape-triangle-2 {
          width: 0;
          height: 0;
          border-left: 15px solid transparent;
          border-right: 15px solid transparent;
          border-bottom: 25px solid #ffd93d;
          filter: drop-shadow(0 0 6px rgba(255, 217, 61, 0.5));
        }

        .shape-triangle-1 { animation-delay: 2.3s; }
        .shape-triangle-2 { 
          animation-delay: 2.4s;
          border-bottom-color: #4facfe;
          filter: drop-shadow(0 0 6px rgba(79, 172, 254, 0.5));
        }

        .shape-star {
          width: 20px;
          height: 20px;
          background: #ff6b9d;
          clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
          animation-delay: 2.5s;
          filter: drop-shadow(0 0 8px rgba(255, 107, 157, 0.6));
        }

        @keyframes shapePop {
          0% {
            opacity: 0;
            transform: scale(0) rotate(0deg);
          }
          100% {
            opacity: 0.7;
            transform: scale(1) rotate(15deg);
          }
        }

        /* Drips */
        .drip {
          position: absolute;
          width: 4px;
          height: 0;
          background: linear-gradient(180deg, #ffd93d 0%, transparent 100%);
          border-radius: 0 0 2px 2px;
          opacity: 0;
          animation: dripDown 0.8s ease-in forwards;
        }

        .drip-1 { animation-delay: 2.6s; }
        .drip-2 { 
          animation-delay: 2.7s;
          background: linear-gradient(180deg, #4facfe 0%, transparent 100%);
        }
        .drip-3 { 
          animation-delay: 2.75s;
          background: linear-gradient(180deg, #ff6b9d 0%, transparent 100%);
        }

        @keyframes dripDown {
          0% {
            opacity: 0;
            height: 0;
          }
          50% {
            opacity: 0.6;
          }
          100% {
            opacity: 0.5;
            height: 30px;
          }
        }
      `}</style>
    </div>
  );
}