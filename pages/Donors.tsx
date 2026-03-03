"use client";

import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/firebase/clientApp"; // adjust import to your path
import Image from "next/image";

type Donor = {
  id: string;
  image: string; 
  link: string;  
};

const Donors = () => {
  const [donors, setDonors] = useState<Donor[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const q = useMemo(() => query(collection(db, "donors")), []);

  useEffect(() => {
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as any),
        })) as Donor[];

        // only keep valid docs
        const filtered = rows.filter((d) => typeof d.image === "string" && typeof d.link === "string");

        setDonors(filtered);
        setErr(null);
      },
      (e) => {
        console.error("Donors snapshot error:", e);
        setErr(e.message ?? "Failed to load donors.");
      }
    );

    return () => unsub();
  }, [q]);

  return (
    <section id="donors" className="w-full text-center px-6 py-20 items-center justify-center">
      <div className="mx-auto max-w-6xl">
        <h2
          className="text-white text-4xl md:text-5xl text-center tracking-widest uppercase drop-shadow-[0_4px_0_rgba(0,0,0,0.9)]"
          style={{ fontFamily: "Street Flow NYC", WebkitTextStroke: "2px black", paintOrder: "stroke" }}
        >
          DONORS
        </h2>

        {err && (
          <p className="mt-6 text-red-300" style={{ fontFamily: "Octin Spraypaint" }}>
            {err}
          </p>
        )}

        <div className="mt-10 flex flex-wrap justify-center gap-6">
            {donors.map((d) => (
                <a
                key={d.id}
                href={d.link}
                target="_blank"
                rel="noreferrer"
                className="
                    group
                    h-20 w-44 md:h-24 md:w-56
                    rounded-2xl
                    bg-white text-black
                    border border-white
                    flex items-center justify-center
                    transition-all duration-150
                    hover:bg-white/90
                    hover:shadow-[0_0_22px_rgba(91,227,255,0.25)]
                "
                >
                {d.image?.startsWith("http") ? (
                  <img
                    src={d.image}
                    alt="Donor"
                    className="max-h-12 md:max-h-14 max-w-[70%] object-contain"
                    loading="lazy"
                  />
                ) : (
                  <Image
                    src={d.image}
                    alt="Donor"
                    width={160}
                    height={56}
                    className="max-h-12 md:max-h-14 max-w-[70%] object-contain"
                    loading="lazy"
                  />
                )}
                </a>
            ))}
            </div>


        {!err && donors.length === 0 && (
          <p className="mt-6 text-white/70" style={{ fontFamily: "Octin Spraypaint" }}>
            No donors yet.
          </p>
        )}
      </div>
    </section>
  );
};

export default Donors;

