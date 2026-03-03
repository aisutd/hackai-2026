"use client";

import React, { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase/clientApp";

export type SponsorTier = "title" | "gold" | "silver" | "platinum" | "bronze";

export type Sponsor = {
  id: string;
  tier: SponsorTier;
  logo: string;
  link: string;
  name?: string;
  order?: number;
};

const TIER_REFERENCE: {
  id: string;
  label: string;
  slots: number;
  plaqueImage: string;
}[] = [
  { id: "platinum", label: "PLATINUM SPONSORS", slots: 2, plaqueImage: "/sponsors/plaque-platinum.png" },
  { id: "bronze", label: "BRONZE SPONSORS", slots: 1, plaqueImage: "/sponsors/plaque-bronze.png" },
];

export default function SponsorsSection() {
  const [_sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "sponsors"),
      (snap) => {
        setError(null);
        const validTiers: SponsorTier[] = ["title", "gold", "silver", "platinum", "bronze"];
        const rows = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const rawTier = String(data.tier ?? "").toLowerCase();
          const tier: SponsorTier = validTiers.includes(rawTier as SponsorTier) ? (rawTier as SponsorTier) : "gold";
          return {
            id: d.id,
            tier,
            logo: String(data.logo ?? data.image ?? ""),
            link: String(data.link ?? data.url ?? "#"),
            name: data.name != null ? String(data.name) : undefined,
            order: Number(data.order ?? 0),
          };
        });
        setSponsors(rows);
        setLoading(false);
      },
      (err) => {
        console.error("Sponsors snapshot error ❌", err);
        setError(err?.message ?? "Failed to load sponsors");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-24 bg-black">
        <div className="text-white tracking-widest uppercase" style={{ fontFamily: "Octin Spraypaint" }}>
          LOADING...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full flex items-center justify-center py-24 bg-black">
        <div className="text-red-300 tracking-widest uppercase" style={{ fontFamily: "Octin Spraypaint" }}>
          SPONSORS ERROR: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-screen bg-black">
      {/* Brick wall background */}
      <img
        src="/sponsors/brick-wall-bg.png"
        alt=""
        className="absolute inset-0 w-full h-full object-cover opacity-90"
        draggable={false}
      />
      
      <div className="relative z-10 pt-6 md:pt-8 pb-8 md:pb-12 px-4 md:px-6">
        {/* Title — moved up slightly */}
        <div className="flex justify-center mb-0 -mt-2 md:-mt-3">
          <img
            src="/sponsors/sponsors-title.png"
            alt="Sponsors"
            className="w-[560px] md:w-[640px] lg:w-[800px] max-w-full h-auto object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.7)]"
          />
        </div>

        <div className="max-w-5xl mx-auto flex flex-col items-center -mt-6 md:-mt-10 lg:-mt-14">
          {TIER_REFERENCE.map((tier, index) => (
            <div 
              key={tier.id} 
              className={`flex flex-col items-center w-full relative ${
                index !== 0 ? "-mt-2 md:-mt-4 lg:-mt-8" : "" 
              }`} 
            >
              {/* Plaque */}
              <img
                src={tier.plaqueImage}
                alt={tier.label}
                className={`relative z-10 w-full h-auto object-contain mx-auto block pointer-events-none ${
                  tier.id === "bronze"
                    ? "max-w-sm md:max-w-md lg:max-w-lg"
                    : "max-w-md md:max-w-lg lg:max-w-xl"
                }`}
              />
              
              {/* Logo row */}
              <div
                className={`relative z-0 grid w-full max-w-5xl mx-auto mt-0 ${
                  tier.slots === 1
                    ? "grid-cols-1 justify-items-center max-w-sm"
                    : "grid-cols-2"
                }`}
              >
                {Array.from({ length: tier.slots }).map((_, i) => (
                  <div 
                    key={i} 
                    className={`w-full flex ${
                      tier.slots === 1 
                        ? "justify-center" 
                        : i % 2 === 0 
                          ? "justify-end -mr-4 md:-mr-8 lg:-mr-12" 
                          : "justify-start -ml-4 md:-ml-8 lg:-ml-12" 
                    }`}
                  >
                    <img
                      src="/sponsors/logo-box-empty.png"
                      alt=""
                      className="w-full max-w-sm h-auto object-contain block"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}