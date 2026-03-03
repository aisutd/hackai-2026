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
      <div className="relative z-10 flex flex-col items-center text-center px-4 py-24 w-full">

        {/* Title row: crown + text + exclamation all inline */}
        <div className="flex flex-row items-center justify-center gap-4 mb-10">
          {/* Crown */}
          <img
            src="/KeynoteSpeaker/crown.png"
            className="w-16 sm:w-20 md:w-24 object-contain"
            alt="crown"
          />

          {/* Title */}
          <h2
            style={{
              color: "#000000",
              fontFamily: "Street Flow NYC",
              WebkitTextStrokeWidth: "5px",
              WebkitTextStrokeColor: "white",
              fontWeight: "400",
              fontSize: "64px",
              letterSpacing: "3.2px",
              textAlign: "center",
              paintOrder: "stroke",
            }}
          >
            Keynote Speaker
          </h2>

          {/* Exclamation */}
          <img
            src="/KeynoteSpeaker/exclamation.png"
            className="w-10 sm:w-12 md:w-16 object-contain"
            alt="exclamation"
          />
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
          style={{
            color: "white",
            textAlign: "center",
            WebkitTextStrokeWidth: "6px",
            WebkitTextStrokeColor: "#010D48",
            paintOrder: "stroke",
            fontSize: "48px",
            fontFamily: "Octin Spraypaint",
            fontWeight: "400",
            letterSpacing: "2.4px",
            lineHeight: "normal",
          }}
        >
          {speaker.name}
        </h3>

        {/* Description */}
        <p
          style={{
            color: "white",
            textAlign: "center",
            WebkitTextStrokeWidth: "6px",
            WebkitTextStrokeColor: "#010D48",
            paintOrder: "stroke",
            fontSize: "36px",
            fontFamily: "Octin Spraypaint",
            fontWeight: "400",
            letterSpacing: "1.8px",
            lineHeight: "normal",
            marginTop: "10px",
            maxWidth: "900px",
          }}
        >
          {speaker.description}
        </p>
      </div>
    </section>
  );
}