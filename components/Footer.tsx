import React from "react";
import { FaInstagram, FaDiscord, FaLinkedin } from "react-icons/fa";

type FooterProps = {
  hackAiLogoSrc?: string;
  aisLogoSrc?: string;
  emailHref?: string;
  instagramHref?: string;
  youtubeHref?: string;
  linkedinHref?: string;
  discordHref?: string;
};

const Footer = ({
  hackAiLogoSrc = "/footer/hackAiLogoColor.webp",
  aisLogoSrc = "/footer/AISLogo.svg",
  instagramHref = "https://www.instagram.com/utdais/",
  linkedinHref = "https://www.linkedin.com/company/ais-utd/",
  discordHref = "https://discord.gg/3VSEQv7ncR",
}: FooterProps) => {
  return (
    <footer className="w-full text-white border-t border-white/20"
  style={{ 
    backgroundColor: '#0a0a0f',
    backdropFilter: 'blur(18px)',
  }}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Left: HackAI logo, Contact, Social */}
          <div className="pl-2 md:pl-6">
            <div className="relative h-16 w-36 mb-4 md:-ml-6 -ml-3">
              <img src={hackAiLogoSrc} alt="HackAI" className="object-contain h-16 w-36" />
            </div>
            <div className="font-bold text-lg mb-2 tracking-widest uppercase md:-ml-2 -ml-1" style={{ fontFamily: 'Octin Spraypaint', color: '#fff' }}>Contact Us</div>
            <div className="flex items-center gap-4 mb-2 md:-ml-2 -ml-1">
              <a href={instagramHref} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-white hover:text-[#E1306C] transition-colors duration-300">
                <FaInstagram size={24} />
              </a>
              <a href={discordHref} target="_blank" rel="noopener noreferrer" aria-label="Discord" className="text-white hover:text-[#5865F2] transition-colors duration-300">
                <FaDiscord size={24} />
              </a>
              <a href={linkedinHref} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="text-white hover:text-[#0A66C2] transition-colors duration-300">
                <FaLinkedin size={24} />
              </a>
            </div>
          </div>
          
          <div className="flex flex-col items-start justify-start">
            <h3 className="text-3xl" style={{ fontFamily: 'Octin Spraypaint', color: '#fff' }}>An initiative by</h3>
            <a
              href="https://aisutd.org"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Artificial Intelligence Society (AIS) website"
              className="inline-block md:-ml-2 -ml-1"
            >
              <img src={aisLogoSrc} alt="AIS UTD" className="object-contain w-60 h-20" />
            </a> 
          </div>
          


          {/* Center-right: Learn more */}
          <div className="col-span-2 md:col-span-1">
            <div className="font-bold text-lg mb-2">Learn more</div>
            <ul className="space-y-1" style={{ fontFamily: 'Octin Spraypaint' }}>
              <li className="tracking-widest uppercase">Check out HackAI's <a href="https://aisutd.org/hackAI" target="_blank" rel="noopener noreferrer" className="underline">organizer website</a></li>
              <li className="tracking-widest uppercase">Designed by <span className="font-bold">AIS UTD</span></li>
              <li className="tracking-widest uppercase"><a href="https://github.com/aisutd/hackai-2026" target="_blank" rel="noopener noreferrer" className="underline">Source Code</a></li>
            </ul>
          </div>

          {/* Right: Newsletter */}
          <div className="col-span-2 md:col-span-1">
            <div className="font-bold text-lg mb-2 md:ml-8 ml-4">Follow our Newsletter</div>
              <form className="flex flex-col gap-2 md:ml-8 ml-4" style={{ fontFamily: 'Octin Spraypaint' }}>
                <input type="email" placeholder="Email" className="rounded px-3 py-2 border border-white/30 bg-transparent text-white/90 tracking-widest uppercase focus:outline-none focus:border-[#A32A2A] transition-colors" style={{ fontFamily: 'Octin Spraypaint' }} />
                <button type="submit" className="bg-[#A32A2A] rounded px-3 py-2 font-semibold text-white/90 tracking-widest uppercase" style={{ fontFamily: 'Octin Spraypaint' }}>Subscribe</button>
              </form>
          </div>
          
          
          
        </div>
      </div>
      <div className="w-full border-t border-white/20 text-center py-3 text-white/90 text-sm"
        style={{ backgroundColor: '#111118' }}>
              <span className="tracking-widest uppercase" style={{ fontFamily: 'Octin Spraypaint' }}>All Copyrights are reserved by HackAI &lt;3</span>
      </div>
    </footer>
  );
};

export default Footer;
