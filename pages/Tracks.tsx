"use client";

import React, { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase/clientApp";
import Image from "next/image";

type GeneralTrack = {
  title: string;
  description: string;
  sponsor?: string;
  frameSrc: string; // chalk square frame (transparent center)
  paintSrc: string; // paint/splatter header (transparent bg)
  paintColor: string; // NEW: Tailwind background color class
};

type Track = {
  description: string;
  name: string;
  sponsor: string;
}

type MiniTrack = {
  label: string;
  frameSrc: string; // chalk pill/rounded rectangle frame (transparent center)
};

const generalTrack: GeneralTrack[] = [
  {
    title: "Education Programs",
    description:
      "INFORMATION ON EDUCATIONAL OPPORTUNITIES, GI BILL BENEFITS, VOCATIONAL TRAINING, AND CAREER TRANSITION ASSISTANCE.",
    sponsor: "Microsoft",
    frameSrc: "/Tracks/generalborder.svg",
    paintSrc: "/Tracks/trackscribble.svg",
    paintColor: "#8A38F5", // Example color
  },
  {
    title: "Financial Wellness",
    description:
      "EXPERT FINANCIAL GUIDANCE INCLUDING DEBT MANAGEMENT, RETIREMENT PLANNING, VA BENEFITS OPTIMIZATION, AND HOME LOAN ASSISTANCE.",
    sponsor: "JPMorgan Chase",
    frameSrc: "/Tracks/generalborder.svg",
    paintSrc: "/Tracks/trackscribble.svg",
    paintColor: "#C24D76", // Example color
  },
  {
    title: "Legal Services",
    description:
      "FREE AND REDUCED-COST LEGAL ASSISTANCE FOR VETERANS FACING CHALLENGES WITH BENEFITS CLAIMS, HOUSING ISSUES, EMPLOYMENT MATTERS, AND FAMILY LAW…",
    frameSrc: "/Tracks/generalborder.svg",
    paintSrc: "/Tracks/trackscribble.svg",
    paintColor: "#22989E", // Example color
  },
  {
    title: "Stable Condition (Healthcare)",
    description:
      "ACCESS TO HEALTHCARE RESOURCES AND SERVICES FOR VETERANS AND THEIR FAMILIES. SERVICES INCLUDE MEDICAL CONSULTATIONS, MENTAL HEALTH SUPPORT, PRESCRIPTION ASSISTANCE, AND REHABILITATION PROGRAMS.",
    sponsor: "UnitedHealth Group",
    frameSrc: "/Tracks/generalborder.svg",
    paintSrc: "/Tracks/trackscribble.svg",
    paintColor: "#5FACFE", // Example color
  }
];

const miniTracks: MiniTrack[] = [
  { label: "Howdy World", frameSrc: "/Tracks/minioutline.svg" },
  { label: "Ridin' Solo", frameSrc: "/Tracks/minioutline.svg" },
  { label: "Bold & Bootiful", frameSrc: "/Tracks/minioutline.svg" },
];

export default function TracksPage() {
  const [tracks, setTracks] = useState<GeneralTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "tracks"),
      (snapshot) => {
        const colors = ["#8A38F5", "#C24D76", "#22989E", "#5FACFE", "#FF6B35", "#4ECDC4"];
        
        const fetchedTracks: GeneralTrack[] = snapshot.docs.map((doc, index) => {
          const data = doc.data() as Track;
          
          return {
            title: data.name || "Track Name",
            description: data.description || "This is a track.",
            sponsor: data.sponsor || "",
            frameSrc: "/Tracks/generalborder.svg",
            paintSrc: "/Tracks/trackscribble.svg",
            paintColor: colors[index % colors.length],
          };
        });

        setTracks(fetchedTracks);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching tracks:", error);
        // Fallback to hardcoded tracks on error
        setTracks(generalTrack);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <main className="relative min-h-screen overflow-hidden text-white flex items-center justify-center">
        <div className="absolute inset-0 z-0 pointer-events-none">
          <Image
            src="/Tracks/tracksbg.svg"
            alt=""
            fill
            priority
            className="object-cover" 
          />
        </div>
        <div className="relative z-10 text-xl" style={{ fontFamily: "Street Flow NYC" }}>
          Loading tracks...
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden text-white">

      {/* Background image */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Image
          src="/Tracks/tracksbg.svg"
          alt=""
          fill
          priority
          className="object-cover" 
        />
      </div>

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-6 pb-24 pt-32">
        {/* Title */}
        <h1
          className="text-center text-4xl sm:text-5xl md:text-6xl tracking-wide"
          style={{ fontFamily: "Street Flow NYC" }} 
        >
          TRACKS
        </h1>

        {/* GENERAL TRACKS */}
        <SectionTitle className="mt-10" style={{ fontFamily: "Octin Spraypaint" }}>GENERAL TRACKS</SectionTitle>

        <div className="mt-8 w-full">
          <div className="mx-auto grid w-full max-w-[1060px] grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {tracks.map((t, index) => (
              <GeneralTrackCard key={`${t.title}-${index}`} track={t} />
            ))}
          </div>
        </div>

        {/* MINI TRACKS */}
        {/* <SectionTitle className="mt-16" style={{ fontFamily: "Octin Spraypaint" }}>MINI TRACKS</SectionTitle>

        <div className="mt-8 flex w-full flex-wrap items-center justify-center gap-6">
          {miniTracks.map((t) => (
            <MiniTrackPill key={t.label} track={t} />
          ))}
        </div> 
        */}
      </div>
    </main>
  );
}

function SectionTitle({
  children,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <h2
      className={`text-center text-lg sm:text-xl tracking-[0.35em] text-white/90 ${className}`}
      style={{ fontFamily: "var(--font-chalk)", ...style }} 
    >
      {children}
    </h2>
  );
}

function GeneralTrackCard({ track }: { track: GeneralTrack }) {
  return (
    // FIX: Removed overflow-hidden and added a min-h-[320px] failsafe
    <div className="relative aspect-[4/3] w-full min-h-[320px]">
      {/* Chalk frame asset */}
      <Image
        src={track.frameSrc}
        alt=""
        fill
        className="pointer-events-none select-none object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
        priority
      />

      {/* Inner content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 sm:px-10 py-10">
        
        {/* Header Container */}
        <div className="relative shrink-0 mb-4 mt-2 h-24 w-[100%] max-w-[420px]">
          
          {/* CSS Mask Div */}
          <div 
            className={`absolute inset-0 z-0 pointer-events-none select-none scale-[1.6] translate-y-1`}
            style={{
              backgroundColor: track.paintColor,
              WebkitMaskImage: `url(${track.paintSrc})`,
              WebkitMaskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskImage: `url(${track.paintSrc})`,
              maskSize: 'contain',
              maskRepeat: 'no-repeat',
              maskPosition: 'center',
            }}
          />

          {/* Title Text */}
          <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
            <div
              className="text-center text-3xl sm:text-4xl lg:text-5xl drop-shadow-md"
              style={{ fontFamily: "Street Flow NYC" }}
            >
              {track.title}
            </div>
          </div>
        </div>

        {/* Description */}
        <p
          className="max-w-[420px] text-center text-[11px] sm:text-[13px] md:text-[15px] leading-relaxed tracking-[0.18em] text-white/80"
          style={{ fontFamily: "Octin Spraypaint" }}
        >
          {track.description}
        </p>

        {/* Sponsor (if available) */}
        {track.sponsor && (
          <div className="mt-4 text-center">
            <p className="text-xs text-white/60 mb-1" style={{ fontFamily: "Octin Spraypaint", letterSpacing: "0.1em" }}>
              SPONSORED BY
            </p>
            <p className="text-sm font-medium text-white/90" style={{ fontFamily: "Octin Spraypaint" }}>
              {track.sponsor}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Function kept intact in case you uncomment the Mini Tracks later!
function MiniTrackPill({ track }: { track: MiniTrack }) {
  return (
    <div className="relative h-[78px] w-[260px] sm:w-[280px]">
      <Image
        src={track.frameSrc}
        alt=""
        fill
        className="pointer-events-none select-none object-contain drop-shadow-[0_14px_30px_rgba(0,0,0,0.45)]"
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="text-xl sm:text-2xl tracking-wide text-white/95"
          style={{ fontFamily: "Street Flow NYC" }}
        >
          {track.label}
        </span>
      </div>
    </div>
  );
}
