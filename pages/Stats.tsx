import React from "react";
import Image from "next/image";
import StatsCarousel from "../components/StatsCarousel";



const Stats = () => {
  return (
    <div className="w-full py-24 px-6 m-8">
      <h1
        className="text-[#EBA274] text-4xl md:text-5xl ml-8 pb-12 drop-shadow-[0_4px_0_rgba(0,0,0,0.85)]"
        style={{ fontFamily: "Street Flow NYC", WebkitTextStroke: "6px black",paintOrder: "stroke" }}
      >
        HACKAI 2025 had...
      </h1>

      {/* ✅ Mobile swipe */}
      <div className="md:hidden">

        <div className="flex gap-6 overflow-x-auto px-2 pb-4 snap-x snap-mandatory scroll-px-6 [-webkit-overflow-scrolling:touch]">
          {/* <StatCard src="/Stats/hackCount.svg" alt="Hackers Count" text="250+ Hackers" />
          <StatCard src="/Stats/prizeM.svg" alt="Prize Money" text="$3000 in prizes" />
          <StatCard src="/Stats/dialoqueBubbleFlip.svg" alt="Projects Count" text="50+ Projects" /> */}
          <StatsCarousel />
        </div>

        {/* dots */}
        {/* <div className="mt-4 flex justify-center gap-2 opacity-70">
          <span className="h-2 w-2 rounded-full bg-white/40" />
          <span className="h-2 w-2 rounded-full bg-white/40" />
          <span className="h-2 w-2 rounded-full bg-white/40" />
        </div> */}

        {/* optional mascot */}
        <div className="flex justify-center -mt-12">
          <Image
            src="/Stats/bear.svg"
            alt="Bear Mascot"
            width={420}
            height={320}
            className="w-65"
            priority
          />
        </div>

        
      </div>

      {/* ✅ Desktop layout (your existing scene) */}
      <div className="hidden md:block">
        <div className="relative mx-auto mt-12 w-full max-w-6xl h-130 sm:h-145 md:h-160">
          <Image
            src="/Stats/bear.svg"
            alt="Bear Mascot"
            width={600}
            height={400}
            className="absolute left-1/2 top-1/2 w-75 sm:w-90 md:w-110 lg:w-130 -translate-x-1/2 -translate-y-1/2"
            priority
          />

          <div className="absolute left-[10%] top-[-12%] w-65 sm:w-[320px] md:w-95">
            <div className="relative w-full">
              <Image
                src="/Stats/hackerCount.svg"
                alt="Hackers Count"
                width={400}
                height={300}
                className="w-full h-auto"
                priority
              />
              <h2
                style={{ fontFamily: "Street Flow NYC", fontSize: "56px", left: "200px", WebkitTextStroke: "5px black",paintOrder: "stroke" }}
                className="absolute left-1/2 top-[30%] -translate-x-1/2 -translate-y-1/2 z-10 text-[#DDD059] text-2xl sm:text-3xl md:text-4xl text-center whitespace-nowrap"
              >
                250+ hackers
              </h2>
            </div>
          </div>

          <div className="absolute right-[4%] top-[-20%] w-65 sm:w-[320px] md:w-95">
            <div className="relative w-full">
              <Image
                src="/Stats/prize.svg"
                alt="Prize Money"
                width={400}
                height={300}
                className="w-full h-auto"
                priority
              />
              <h2
                style={{ fontFamily: "Street Flow NYC", fontSize: "56px", WebkitTextStroke: "5px black",paintOrder: "stroke"}}
                className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 z-10 text-[#DDD059] text-2xl sm:text-3xl md:text-4xl text-center whitespace-nowrap"
              >
                $3000 <br/> in prizes
              </h2>
            </div>
          </div>

          <div className="absolute left-[20%] bottom-[-15%] w-65 sm:w-[320px] md:w-95">
            <div className="relative w-full">
              <Image
                src="/Stats/projects.svg"
                alt="Projects Count"
                width={400}
                height={300}
                className="w-full h-auto"
                priority
              />
              <h2
                style={{ fontFamily: "Street Flow NYC", fontSize: "56px", left: "160px", WebkitTextStroke: "5px black",paintOrder: "stroke" }}
                className="absolute left-1/2 top-[60%] -translate-x-1/2 -translate-y-1/2 z-10 text-[#DDD059] text-2xl sm:text-3xl md:text-4xl text-center whitespace-nowrap"
              >
                50+ Projects
              </h2>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Stats;
