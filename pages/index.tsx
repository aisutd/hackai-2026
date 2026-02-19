import React from "react";
import Head from "next/head";
import Home from "./Home";
import About from "./About";
import Stats from "./Stats";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FAQSection from "@/components/FaqCards";
import Countdown from "./countdown";
import Donors from "./Donors";

export default function HackAIPage() {
  return (
    <div className="relative">
      <Head> 
        <title>HackAI</title> 
        <link rel="icon" type="image/png" href="/hackai-logo.png" /> 
        <meta name="description" content="Welcome to HackAI: the biggest AI hackathon in North Texas!" /> 
      </Head>

      {/* Background always visible so the lighting has something to reveal */}
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
      
      {/* Desktop MLH (not fixed) */}
        <div className="hidden md:block relative">
          <a
            id="mlh-trust-badge-desktop"
            className="absolute right-6 -top-2 z-20 block w-[110px]"
            href="https://mlh.io/na?utm_source=na-hackathon&utm_medium=TrustBadge&utm_campaign=2026-season&utm_content=black"
            target="_blank"
            rel="noreferrer"
          >
            <img
              src="https://s3.amazonaws.com/logged-assets/trust-badge/2026/mlh-trust-badge-2026-black.svg"
              alt="Major League Hacking 2026 Hackathon Season"
              className="w-full h-auto"
            />
          </a>
        </div>


      {/* Rest of the content */}
      <div className="relative">
        <Navbar />
        

        {/* Mobile MLH spacer (reserves vertical space below fixed navbar) */}
        <div className="md:hidden h-[88px]" />

        {/* Mobile MLH badge (not fixed) */}
        <div className="md:hidden w-full flex justify-end pr-4 -mt-[88px] pt-4 pb-2">
          <a
            id="mlh-trust-badge-mobile"
            className="block w-[64px] sm:w-[72px]"
            href="https://mlh.io/na?utm_source=na-hackathon&utm_medium=TrustBadge&utm_campaign=2026-season&utm_content=black"
            target="_blank"
            rel="noreferrer"
          >
            <img
              src="https://s3.amazonaws.com/logged-assets/trust-badge/2026/mlh-trust-badge-2026-black.svg"
              alt="Major League Hacking 2026 Hackathon Season"
              className="w-full h-auto"
            />
          </a>
        </div>



        <main className="relative pt-24">
          <section id="home" className="min-h-screen flex items-center justify-center -mt-20">
            <Home />
          </section>
          
          <section id="about" className="min-h-screen flex items-center justify-center m-4">
            <About />
          </section>

          <section
              id="countdown"
              className="min-h-screen flex items-center justify-center m-2"
          >
            <Countdown
              leftGraffitiSrc="/Countdown/bunny.svg"
              rightGraffitiSrc="/Countdown/target.svg"
              frameSrc="/Countdown/countdownBg.svg"
            />

          </section>
           
          <section
            id="stats"
            className="min-h-screen flex items-center justify-center m-2"
          >
            <Stats />
          </section>

            

            {/* <section
              id="tracks"
              className="min-h-screen flex items-center justify-center m-6"
            >
              <TracksPage />
            </section> */}

            <section
              id="donors"
              className="min-h-screen flex items-center justify-center m-2"
            >
              <Donors />
            </section>

            <section
              id="faqs"
              className="min-h-screen flex items-center justify-center m-2"
            >
              <FAQSection />
            </section>

            

        </main>

        <Footer />
      </div>
    </div>
  );
}
