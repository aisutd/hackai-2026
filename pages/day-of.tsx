import React from "react";
import Head from "next/head";
import Navbar from "@/components/Navbar";

export default function DayOfPage() {
  return (
    <div className="min-h-screen relative">
      <Head>
        <title>HackAI Link</title>
      </Head>
      <Navbar />
      <div
        className="fixed inset-0 -z-10"
        style={{
          backgroundColor: "black",
          backgroundImage: "url(/mainbg.svg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />

      <main className="mx-auto w-[min(900px,calc(100%-2rem))] pt-40 pb-16">
        <section
          className="rounded-3xl p-8 md:p-10 text-center"
          style={{
            background: "linear-gradient(120deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.10) 100%)",
            boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.18)",
            backdropFilter: "blur(18px) saturate(180%)",
            WebkitBackdropFilter: "blur(18px) saturate(180%)",
            border: ".5px solid rgba(255,255,255,0.35)",
            outline: "1.5px solid rgba(255,255,255,0.18)",
          }}
        >
          <h1
            className="text-white text-3xl md:text-5xl tracking-widest"
            style={{ fontFamily: "Street Flow NYC", WebkitTextStroke: "2px black", paintOrder: "stroke" }}
          >
            CHECK DURING THE DAY OF
          </h1>
          <p className="mt-4 text-white/85 text-base md:text-lg">
            This link will be available during the day of the hackathon.
          </p>
        </section>
      </main>
    </div>
  );
}
