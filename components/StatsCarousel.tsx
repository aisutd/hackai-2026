import Image from "next/image";
import { useEffect, useMemo, useRef } from "react";

type StatItem = { src: string; alt: string; text: string | React.ReactNode };

const StatCard = ({ src, alt, text }: StatItem) => (
  <div className="snap-center shrink-0 w-[135%] max-w-md">
    <div className="relative w-full rounded-3xl bg-transparent border-0 p-6">
      <div className="relative w-fit mx-auto translate-x-6">
        <Image
            src={src}
            alt={alt}
            width={625}
            height={500}
            className="block w-full h-auto"
            priority
        />

        <h2
            style={{ fontFamily: "Street Flow NYC", fontSize: "40px", WebkitTextStroke: "3px black",paintOrder: "stroke" }}
            className="
            absolute left-1/2 top-[34%]
            -translate-x-1/2 -translate-y-1/2
            z-10 text-[#DDD059] text-2xl text-center
            max-w-[100%] whitespace-nowrap"
        >
            {text}
        </h2>
        </div>
    </div>
  </div>
);

export default function StatsCarousel() {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const items: StatItem[] = useMemo(
    () => [
      { src: "/Stats/hackercount.svg", alt: "Hackers Count", text: "250+ Hackers" },
      { src: "/Stats/prize.svg", alt: "Prize Money", text: <>$3000 <br/>in prizes</> },
      { src: "/Stats/projFlipped.svg", alt: "Projects Count", text: "50+ Projects" },
    ],
    []
  );

  useEffect(() => {
  const track = trackRef.current;
  if (!track) return;

  let i = 0;

  const id = setInterval(() => {
    i = (i + 1) % items.length;

    const child = track.children.item(i) as HTMLElement | null;
    if (!child) return;

    // scroll the track horizontally without affecting page scroll
    track.scrollTo({
      left: child.offsetLeft - (track.clientWidth - child.clientWidth) / 2,
      behavior: "smooth",
    });
  }, 3000);

  return () => clearInterval(id);
}, [items.length]);

  return (
    <div
      ref={trackRef}
      className="
        flex gap-6 overflow-x-auto px-6 pb-4
        snap-x snap-mandatory scroll-smooth
        overscroll-x-contain scroll-px-6
        [-webkit-overflow-scrolling:touch]
        [scrollbar-width:none] [-ms-overflow-style:none]
        [&::-webkit-scrollbar]:hidden
      "
    >
      {items.map((it) => (
        <StatCard key={it.alt} {...it} />
      ))}
    </div>
  );
}
