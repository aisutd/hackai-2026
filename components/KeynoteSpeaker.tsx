import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase/clientApp";

type SpeakerDoc = {
  name?: string;
  description?: string;
  image?: string;
};

type Speaker = {
  id: string;
  name: string;
  description: string;
  image: string;
};

function normalizeImage(value: unknown): string {
  const raw = String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return raw;

  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(raw)) {
    const [prefix, b64] = raw.split(",", 2);
    return b64 ? `${prefix},${b64.replace(/\s+/g, "")}` : raw;
  }

  return `data:image/jpeg;base64,${raw.replace(/\s+/g, "")}`;
}

export default function KeynoteSpeaker() {
  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">(
    "loading"
  );
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "keynote"),
      (snap) => {
        if (snap.empty) {
          setSpeaker(null);
          setStatus("empty");
          return;
        }

        const chosen =
          snap.docs.find((d) => {
            const data = d.data() as SpeakerDoc;
            return typeof data.image === "string" && data.image.trim().length > 0;
          }) ?? snap.docs[0];

        const data = chosen.data() as SpeakerDoc;

        setSpeaker({
          id: chosen.id,
          name: (data.name ?? "").toString(),
          description: (data.description ?? "").toString(),
          image: (data.image ?? "").toString(),
        });

        setStatus("ready");
      },
      (err) => {
        console.error("Keynote Firestore error:", err);
        setSpeaker(null);
        setErrorMsg(err?.message ?? "Unknown Firestore error");
        setStatus("error");
      }
    );

    return () => unsub();
  }, []);

  const imgSrc = useMemo(() => normalizeImage(speaker?.image), [speaker?.image]);

  if (status === "loading") {
    return <div className="text-white text-xl">Loading keynote speaker…</div>;
  }
  if (status === "empty") {
    return (
      <div className="text-yellow-300 text-xl">
        No documents found in <code className="text-yellow-200">keynote</code>.
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="text-red-400 text-xl">
        Failed to load keynote speaker: {errorMsg}
      </div>
    );
  }
  if (!speaker) return null;

  return (
    <section className="relative w-full min-h-screen flex items-center justify-center overflow-hidden">
      <div className="relative z-10 flex flex-col items-center text-center px-4 py-20 md:py-24 w-full max-w-5xl mx-auto">

        {/* Title row */}
        <div className="mb-8 md:mb-10 w-full flex justify-center">
          <div className="relative inline-flex items-center justify-center">
            {/* Crown */}
            <img
              src="/KeynoteSpeaker/crown.png"
              className="absolute -left-14 sm:-left-18 md:-left-22 top-1/2 -translate-y-1/2 w-12 sm:w-16 md:w-20 object-contain"
              alt="crown"
            />

            {/* Title */}
            <h2
              className="text-white text-4xl sm:text-5xl md:text-6xl tracking-wide uppercase drop-shadow-[0_4px_0_rgba(0,0,0,0.85)] leading-[0.95]"
              style={{
                fontFamily: "Street Flow NYC",
                WebkitTextStroke: "6px black",
                fontWeight: "400",
                paintOrder: "stroke",
              }}
            >
              Keynote <br className="sm:hidden" /> Speaker
            </h2>

            {/* Exclamation */}
            <img
              src="/KeynoteSpeaker/exclamation.png"
              className="absolute -right-10 sm:-right-12 md:-right-16 top-1/2 -translate-y-1/2 w-8 sm:w-10 md:w-14 object-contain"
              alt="exclamation"
            />
          </div>
        </div>

        {/* Speaker Image */}
        <div className="relative mb-8">
          <div className="w-[260px] h-[332px] md:w-[320px] md:h-[410px] rounded-full overflow-hidden border-4 border-blue-900 bg-white/10">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={speaker.name || "Keynote speaker"}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/80">
                No image
              </div>
            )}
          </div>
        </div>

        {/* Name */}
        <h3
          className="max-w-[95vw] text-center text-[40px] sm:text-[48px] leading-none"
          style={{
            color: "white",
            textAlign: "center",
            WebkitTextStrokeWidth: "8px",
            WebkitTextStrokeColor: "#010D48",
            paintOrder: "stroke",
            fontFamily: "Octin Spraypaint",
            fontWeight: "400",
            letterSpacing: "2.4px",
          }}
        >
          {speaker.name}
        </h3>

        {/* Description */}
        <p
          className="max-w-[95vw] md:max-w-[900px] text-center text-[30px] sm:text-[36px] leading-none mt-2"
          style={{
            color: "white",
            textAlign: "center",
            WebkitTextStrokeWidth: "7px",
            WebkitTextStrokeColor: "#010D48",
            paintOrder: "stroke",
            fontFamily: "Octin Spraypaint",
            fontWeight: "400",
            letterSpacing: "1.8px",
          }}
        >
          {speaker.description}
        </p>
      </div>
    </section>
  );
}
