"use client";

import React, { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase/clientApp";

export type Sponsor = {
  id: string;
  logo: string;
  link: string;
  name?: string;
  order?: number;
};

export default function SponsorsSection() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "sponsors"),
      (snap) => {
        setError(null);
        const rows = snap.docs
          .map((d) => {
            const data = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              logo: String(data.logo ?? data.image ?? ""),
              link: String(data.link ?? data.url ?? "#"),
              name: data.name != null ? String(data.name) : undefined,
              order: Number(data.order ?? 0),
            };
          })
          .filter((s) => s.logo?.trim());
        setSponsors(rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
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
      <div className="w-full flex items-center justify-center py-24">
        <div className="text-white tracking-widest uppercase" style={{ fontFamily: "Octin Spraypaint" }}>
          LOADING...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full flex items-center justify-center py-24">
        <div className="text-red-300 tracking-widest uppercase" style={{ fontFamily: "Octin Spraypaint" }}>
          SPONSORS ERROR: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full pt-6 md:pt-8 pb-8 md:pb-12 px-4 md:px-8">
        {/* Title */}
        <div className="flex justify-center mb-6 md:mb-10">
          <img
            src="/sponsors/sponsors-title.png"
            alt="Sponsors"
            className="w-[560px] md:w-[640px] lg:w-[800px] max-w-full h-auto object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.7)]"
          />
        </div>

        {/* Sponsor grid — 1 column mobile, 2 columns desktop */}
        {sponsors.length > 0 && (
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {sponsors.map((sponsor) => (
              <a
                key={sponsor.id}
                href={sponsor.link || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative w-full aspect-[4/3] flex items-center justify-center transition-transform duration-200 hover:-translate-y-1"
              >
                {/* Frame */}
                <img
                  src="/sponsors/logo-box-empty.png"
                  alt=""
                  className="absolute inset-0 w-full h-full object-fill block transition-transform duration-200 group-hover:scale-[1.01]"
                  aria-hidden
                />
                {/* White backing panel for logo visibility */}
                <div
                  className="absolute inset-x-[11%] top-[13%] bottom-[16%] bg-white rounded-[24px] transition-shadow duration-200 group-hover:shadow-[0_0_20px_rgba(255,255,255,0.35)]"
                  aria-hidden
                />
                {/* Sponsor logo */}
                <img
                  src={sponsor.logo}
                  alt={sponsor.name || "Sponsor logo"}
                  className="relative z-10 object-contain transition-transform duration-200 group-hover:scale-105"
                  style={{ width: "32%", height: "32%" }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              </a>
            ))}
          </div>
        )}
    </div>
  );
} 
