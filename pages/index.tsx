import React from "react";
import Head from "next/head";
import dynamic from "next/dynamic";
import Home from "./Home";
import About from "./About";
import Stats from "./Stats";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ScheduleSection from "./schedule";

const Countdown = dynamic(() => import("./countdown"), { ssr: false });
const KeynoteSpeaker = dynamic(() => import("@/components/KeynoteSpeaker"), { ssr: false });
const FAQSection = dynamic(() => import("@/components/FaqCards"), { ssr: false });
const Donors = dynamic(() => import("./Donors"), { ssr: false });

export default function HackAIPage() {
  return (
    <div className="relative">
      <Head>
        <title>HackAI</title>
        <link rel="icon" type="image/png" href="/hackai-logo.png" />
        <meta name="description" content="Welcome to HackAI: the biggest AI hackathon in North Texas!" />
      </Head>

 
      <Navbar />

      <div className="hidden md:block fixed top-0 right-6 z-40">
        <a
          href="https://mlh.io/na?utm_source=na-hackathon&utm_medium=TrustBadge&utm_campaign=2026-season&utm_content=black"
          target="_blank"
          rel="noreferrer"
        >
          <img
            src="https://s3.amazonaws.com/logged-assets/trust-badge/2026/mlh-trust-badge-2026-black.svg"
            alt="Major League Hacking 2026 Hackathon Season"
            className="w-[110px] h-auto"
          />
        </a>
      </div>
      <div className="md:hidden fixed top-16 right-4 z-40">
        <a
          href="https://mlh.io/na?utm_source=na-hackathon&utm_medium=TrustBadge&utm_campaign=2026-season&utm_content=black"
          target="_blank"
          rel="noreferrer"
        >
          <img
            src="https://s3.amazonaws.com/logged-assets/trust-badge/2026/mlh-trust-badge-2026-black.svg"
            alt="Major League Hacking 2026 Hackathon Season"
            className="w-16 h-auto"
          />
        </a>
      </div>

      <main className="relative">

        {/* mainbg wrapper: Home → Donors */}
        <div
          className="relative"
          style={{
            backgroundImage: "url('/mainbg.svg')",
            backgroundSize: "cover",
            backgroundPosition: "center top",
            backgroundColor: "black",
          }}
        >
          <section id="home" className="min-h-screen flex items-center justify-center">
            <Home />
          </section>

          <section id="about" className="min-h-screen flex items-center justify-center">
            <About />
          </section>

          <section id="countdown" className="min-h-screen flex items-center justify-center">
            <Countdown />
          </section>

          <section id="stats" className="min-h-screen flex items-center justify-center">
            <Stats />
          </section>

          <section
            id="donors"
            className="relative min-h-screen flex items-center justify-center -mt-50"
          >
            <Donors />
            <div
              className="pointer-events-none absolute bottom-0 left-0 right-0 h-40 z-10"
              style={{ background: "linear-gradient(to bottom, transparent, black)" }}
            />
          </section>
          
          <section
              id="schedule"
              className="min-h-[120vh] flex items-center justify-center py-12 m-6 relative"
            >
              <div className="relative z-10 w-full flex items-center justify-center py-8">
                <ScheduleSection />
              </div>
           </section>
          
        </div>


        {/* Sponsors: its own full-width block, visually separate from main content and footer */}
        {/* <section id="sponsors">
          <SponsorsSection />
        </section> */}
          
        {/* Brick section */}
        <section
          className="relative w-full overflow-hidden -mt-10"
          style={{
            backgroundImage: "url('/KeynoteSpeaker/bg-brick.png')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div
            className="pointer-events-none absolute top-0 left-0 right-0 z-[1] h-[300px]"
            style={{
              background: "linear-gradient(to bottom, rgba(0,0,0,1) 40%, rgba(0,0,0,0))",
            }}
          />
          <div
            className="absolute inset-0 z-0"
            style={{
              backgroundImage: "url('/KeynoteSpeaker/bg-graffiti.png')",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
          />
          <div
            className="absolute inset-0 z-0"
            style={{
              backgroundImage: "url('/KeynoteSpeaker/light.png')",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
          />
          <div className="absolute inset-0 z-0 bg-black/5" />

          <div className="relative z-10">
            <section id="keynote" className="relative w-full min-h-screen">
              <KeynoteSpeaker />
            </section>
            <section id="faqs" className="min-h-screen flex items-center justify-center mb-2">
              <FAQSection />
            </section>
          </div>
        </section>

      </main>

      <div style={{ backgroundColor: '#0a0a0f' }}>
        <Footer />
      </div>

    </div>
  );
}
