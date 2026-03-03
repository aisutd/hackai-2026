import React, { useEffect, useRef, useState } from "react";

const About = () => {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [shouldRender, setShouldRender] = useState(false); // lazy mount
  const [inView, setInView] = useState(false); // trigger animation

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldRender(true);
          // next frame ensures transition actually runs (not instantly applied)
          requestAnimationFrame(() => setInView(true));
          io.disconnect();
        }
      },
      {
        threshold: 0.15,
        rootMargin: "0px 0px -10% 0px", // start a bit before it's fully in view
      }
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  const fadeBase =
    "transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none";
  const hidden = "opacity-0 translate-y-6";
  const shown = "opacity-100 translate-y-0";

  return (
   <section ref={sectionRef} className="w-full py-24 px-6"
              style={{
                backgroundImage: "url('/About/bg.svg')",
                backgroundSize: "contain",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat"
              }}>
      {!shouldRender ? (
        <div className="mx-auto max-w-6xl h-130 md:h-105" />
      ) : (
        <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-16">
          <div className={`${fadeBase} ${inView ? shown : hidden}`}>
            <h2
              className="text-white text-4xl md:text-5xl tracking-widest uppercase drop-shadow-[0_4px_0_rgba(0,0,0,0.9)]"
              style={{ fontFamily: "Street Flow NYC", WebkitTextStroke: "2px black", paintOrder: "stroke" }}
            >
              WHAT IS HACKAI?
            </h2>

            <p
              className="mt-6 text-white/90 text-lg md:text-xl leading-relaxed drop-shadow-[0_3px_0_rgba(0,0,0,0.9)]"
              style={{ fontFamily: "Octin Spraypaint" }}
            >
              HackAI is a student-run hackathon hosted by the Artificial Intelligence
              Society at UTD. We bring together curious builders, designers, and
              engineers to learn, collaborate, and ship real projects with AI. In
              just 24 hours, teams go from idea to demo through workshops, mentorship,
              and hands-on building.
            </p>

            <p
              className="mt-4 text-[#ff2fb2] text-2xl md:text-3xl tracking-wide uppercase drop-shadow-[0_4px_0_rgba(0,0,0,0.9)]"
              style={{ fontFamily: "Octin Spraypaint" }}
            >
              BUILD ARTIFICIAL INTELLIGENCE PROJECTS IN 24 HOURS.
            </p>
          </div>
          <div
            className={`${fadeBase} ${inView ? shown : hidden} delay-150 md:pt-24`}
          >
            <h2
              className="text-white text-4xl md:text-5xl tracking-widest uppercase drop-shadow-[0_4px_0_rgba(0,0,0,0.9)]"
              style={{ fontFamily: "Street Flow NYC", WebkitTextStroke: "2px black", paintOrder: "stroke" }}
            >
              WHY SPONSOR HACKAI?
            </h2>

            <p
              className="mt-6 text-white/90 text-lg md:text-xl leading-relaxed drop-shadow-[0_3px_0_rgba(0,0,0,0.9)]"
              style={{ fontFamily: "Octin Spraypaint" }}
            >
              Sponsoring HackAI is a win-win opportunity. Your support helps students
              learn and build, while giving your company direct access to high-signal
              talent and meaningful brand visibility. Sponsors can engage with
              participants through tech talks, workshops, mentorship, and challenge
              prompts and walk away with strong recruiting leads and fresh ideas.
            </p>

            <p
              className="mt-4 text-[#5aa9ff] text-2xl md:text-3xl tracking-wide uppercase drop-shadow-[0_4px_0_rgba(0,0,0,0.9)]"
              style={{ fontFamily: "Octin Spraypaint" }}
            >
              TOP TECH TALENT, BRANDING, PRODUCT SHOWCASE, AND REAL CHALLENGE
              SOLUTIONS.
            </p>
          </div>
        </div>
      )}
    </section>
  );
};

export default About;
