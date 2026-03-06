import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { auth } from "@/firebase/clientApp";
import { FaInstagram, FaDiscord, FaLinkedin } from "react-icons/fa";
import { isAdminEmail } from "@/utils/adminAccess";

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const NAV: { label: string; id?: string; href?: string; external?: boolean }[] = [
    { label: "ABOUT", id: "about" },
    { label: "SPEAKER", id: "keynote" },
    { label: "SPONSORS", id: "sponsors" },
    { label: "TRAILER", href: "https://www.youtube.com/watch?v=7_SRKyABAmo", external: true },
    // { label: "LIVESTREAM", href: "https://www.youtube.com/live", external: true },
    { label: "MENU", href: "/menu" },
  ];

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setIsLoggedIn(!!user);
      setIsAdmin(isAdminEmail(user?.email));
    });
    return () => unsubscribe();
  }, []);

  const scrollToId = (id: string) => {
    if (router.pathname === "/") {
      const el = document.getElementById(id);
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY - 110; // navbar offset
      window.scrollTo({ top: y, behavior: "smooth" });
    } else {
      router.push(`/#${id}`).then(() => {
        // Wait for navigation, then scroll
        setTimeout(() => {
          const el = document.getElementById(id);
          if (el) {
            const y = el.getBoundingClientRect().top + window.scrollY - 110;
            window.scrollTo({ top: y, behavior: "smooth" });
          }
        }, 400);
      });
    }
  };

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const closeOnOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (adminMenuRef.current && !adminMenuRef.current.contains(target)) {
        setAdminMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <nav
        className="mx-auto mt-8 w-[calc(100%-10.5rem)] md:w-[calc(100%-12.5rem)] lg:w-[min(1100px,calc(100%-2rem))] px-6 py-2"
        style={{
          borderRadius: "2rem",
          background:
            "linear-gradient(120deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.10) 100%)",
          boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.18)",
          backdropFilter: "blur(18px) saturate(180%)",
          WebkitBackdropFilter: "blur(18px) saturate(180%)",
          border: ".5px solid rgba(255,255,255,0.35)",
          outline: "1.5px solid rgba(255,255,255,0.18)",
        }}
      >
        <div className="flex items-center justify-between w-full">
          {/* Logo */}
          <div className="flex items-center gap-2">
            {/* Use scrollToId so it respects your offset */}
            <button
              type="button"
              onClick={() => {
                scrollToId("home");
                setOpen(false);
              }}
              className="relative h-10 w-24 cursor-pointer"
              aria-label="Go to home"
            >
              <img
                src="/Home/hackAiLogoColor.webp"
                alt="HackAI"
                className="object-contain w-full h-full"
              />
            </button>
          </div>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-6">
            {NAV.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  if (item.external && item.href) {
                    window.open(item.href, "_blank");
                  } else if (item.href) {
                    router.push(item.href);
                  } else if (item.id) {
                    scrollToId(item.id);
                  }
                  setOpen(false);
                }}
                className="py-2 text-white cursor-pointer flex justify-center rounded-[20px] bg-transparent transition-colors duration-500 ease-in-out hover:text-[#783edc] tracking-widest"
                style={{ fontFamily: "Street Flow NYC", WebkitTextStroke: "3px black", paintOrder: "stroke" }}
              >
                {item.label}
              </button>
            ))}

            {isAdmin && (
              <div className="relative" ref={adminMenuRef}>
                <button
                  type="button"
                  onClick={() => setAdminMenuOpen((v) => !v)}
                  className="py-2 text-[#DDD059] cursor-pointer flex justify-center rounded-[20px] bg-transparent transition-colors duration-500 ease-in-out hover:text-white tracking-widest"
                  style={{ fontFamily: "Street Flow NYC", WebkitTextStroke: "2px black", paintOrder: "stroke" }}
                >
                  ADMIN
                </button>
                {adminMenuOpen && (
                  <div className="absolute right-0 mt-2 min-w-44 rounded-xl border border-white/20 bg-black/85 backdrop-blur-md p-2 shadow-2xl z-50">
                    <button
                      type="button"
                      className="w-full text-left rounded-lg px-3 py-2 text-sm text-white hover:bg-white/10"
                      onClick={() => {
                        router.push("/scanner");
                        setAdminMenuOpen(false);
                        setOpen(false);
                      }}
                    >
                      Scanner
                    </button>
                    <button
                      type="button"
                      className="w-full text-left rounded-lg px-3 py-2 text-sm text-white hover:bg-white/10"
                      onClick={() => {
                        router.push("/admin/hackers");
                        setAdminMenuOpen(false);
                        setOpen(false);
                      }}
                    >
                      Hackers
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Sign In/Out button for desktop */}
            {isLoggedIn || isAdmin ? (
              <>
                {isLoggedIn && (
                  <button
                    className="rounded-full px-4 py-3 ml-2 bg-[#2d0a4b] text-white font-semibold transition hover:bg-[#4b1c7a] tracking-widest"
                    style={{ fontFamily: "Street Flow NYC" }}
                    onClick={() => router.push("/userProfile")}
                  >
                    Profile
                  </button>
                )}
                <button
                  className="rounded-full px-4 py-3 ml-2 bg-[#2d0a4b] text-white font-semibold transition hover:bg-[#4b1c7a] tracking-widest"
                  style={{ fontFamily: "Street Flow NYC" }}
                  onClick={async () => {
                    if (isLoggedIn) {
                      await auth.signOut();
                    }
                    router.push("/");
                  }}
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                className="rounded-full px-4 py-3 ml-4 bg-[#2d0a4b] text-white font-semibold transition hover:bg-[#4b1c7a] tracking-widest"
                style={{ fontFamily: "Street Flow NYC" }}
                onClick={() => router.push("/signin")}
              >
                Sign In
              </button>
            )}
          </div>

          <div className="flex items-center gap-6">
            {/* Desktop socials */}
            <div className="hidden sm:flex items-center gap-4 px-4">
              <button
                type="button"
                onClick={() =>
                  window.open("https://www.instagram.com/utdais/", "_blank")
                }
                aria-label="Instagram"
                className="text-white hover:text-[#E1306C] transition-colors duration-300"
              >
                <FaInstagram size={24} />
              </button>
              <button
                type="button"
                onClick={() =>
                  window.open("https://discord.gg/Q7hsRpDkRM", "_blank")
                }
                aria-label="Discord"
                className="text-white hover:text-[#5865F2] transition-colors duration-300"
              >
                <FaDiscord size={24} />
              </button>
              <button
                type="button"
                onClick={() =>
                  window.open(
                    "https://www.linkedin.com/company/ais-utd",
                    "_blank"
                  )
                }
                aria-label="LinkedIn"
                className="text-white hover:text-[#0A66C2] transition-colors duration-300"
              >
                <FaLinkedin size={24} />
              </button>
            </div>

            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label="Open menu"
              aria-expanded={open}
              className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 border border-white/15 text-white/90 hover:text-white relative z-[60]"
            >
              <span className="relative block h-5 w-5">
                <span
                  className={`absolute left-0 top-1 block h-0.5 w-5 bg-current transition-transform duration-200 ${
                    open ? "translate-y-2 rotate-45" : ""
                  }`}
                />
                <span
                  className={`absolute left-0 top-2.5 block h-0.5 w-5 bg-current transition-opacity duration-200 ${
                    open ? "opacity-0" : "opacity-100"
                  }`}
                />
                <span
                  className={`absolute left-0 top-4 block h-0.5 w-5 bg-current transition-transform duration-200 ${
                    open ? "-translate-y-2 -rotate-45" : ""
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile dropdown (ensure it's ABOVE the backdrop) */}
      <div className="md:hidden mx-auto w-[min(1100px,calc(100%-2rem))] relative z-[55]">
        <div
          className={`mt-3 overflow-y-auto rounded-3xl bg-black/50 backdrop-blur-md border border-white/15 transition-all duration-200 ${
            open
              ? "max-h-[420px] opacity-100 pointer-events-auto"
              : "max-h-0 opacity-0 pointer-events-none"
          }`}
        >
          <div className="px-6 py-5 flex flex-col gap-3">
            {NAV.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  if (item.external && item.href) {
                    window.open(item.href, "_blank");
                  } else if (item.href) {
                    router.push(item.href);
                  } else if (item.id) {
                    scrollToId(item.id);
                  }
                  setOpen(false);
                }}
                className="text-left text-white/90 hover:text-white transition-colors text-base tracking-widest uppercase"
                style={{ fontFamily: "Street Flow NYC" }}
              >
                {item.label}
              </button>
            ))}

            {/* Sign In/Out button for mobile */}
            {isLoggedIn || isAdmin ? (
              <>
                {isLoggedIn && (
                  <button
                    className="rounded-xl px-4 py-3 mt-2 bg-[#2d0a4b] text-white font-semibold transition hover:bg-[#4b1c7a] w-full"
                    style={{ fontFamily: "Street Flow NYC" }}
                    onClick={() => {
                      router.push("/userProfile");
                      setOpen(false);
                    }}
                  >
                    Profile
                  </button>
                )}
                <button
                  className="rounded-xl px-4 py-3 mt-2 bg-[#2d0a4b] text-white font-semibold transition hover:bg-[#4b1c7a] w-full"
                  style={{ fontFamily: "Street Flow NYC" }}
                  onClick={async () => {
                    if (isLoggedIn) {
                      await auth.signOut();
                    }
                    router.push("/");
                    setOpen(false);
                  }}
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                className="rounded-xl px-4 py-3 mt-2 bg-[#2d0a4b] text-white font-semibold transition hover:bg-[#4b1c7a] w-full"
                style={{ fontFamily: "Street Flow NYC" }}
                onClick={() => {
                  router.push("/signin");
                  setOpen(false);
                }}
              >
                Sign In
              </button>
            )}

            {isAdmin && (
              <div className="rounded-xl border border-[#DDD059]/35 bg-[#DDD059]/10 p-3 mt-2">
                <div
                  className="text-xs uppercase tracking-widest text-[#DDD059] mb-2"
                  style={{ fontFamily: "Street Flow NYC" }}
                >
                  Admin
                </div>
                <button
                  type="button"
                  className="rounded-xl px-4 py-3 bg-[#DDD059] text-black font-semibold transition hover:bg-[#f4ea83] w-full"
                  style={{ fontFamily: "Street Flow NYC" }}
                  onClick={() => {
                    router.push("/scanner");
                    setOpen(false);
                  }}
                >
                  Scanner
                </button>
                <button
                  type="button"
                  className="rounded-xl px-4 py-3 mt-2 bg-[#DDD059] text-black font-semibold transition hover:bg-[#f4ea83] w-full"
                  style={{ fontFamily: "Street Flow NYC" }}
                  onClick={() => {
                    router.push("/admin/hackers");
                    setOpen(false);
                  }}
                >
                  Hackers
                </button>
              </div>
            )}

            {/* Socials for mobile */}
            <div className="pt-2 flex items-center gap-4 sm:hidden">
              <button
                type="button"
                onClick={() =>
                  window.open("https://www.instagram.com/utdais/", "_blank")
                }
                aria-label="Instagram"
                className="text-white hover:text-[#E1306C] transition-colors duration-300"
              >
                <FaInstagram size={24} />
              </button>
              <button
                type="button"
                onClick={() =>
                  window.open("https://discord.gg/756atmKkAq", "_blank")
                }
                aria-label="Discord"
                className="text-white hover:text-[#5865F2] transition-colors duration-300"
              >
                <FaDiscord size={24} />
              </button>
              <button
                type="button"
                onClick={() =>
                  window.open(
                    "https://www.linkedin.com/company/ais-utd",
                    "_blank"
                  )
                }
                aria-label="LinkedIn"
                className="text-white hover:text-[#0A66C2] transition-colors duration-300"
              >
                <FaLinkedin size={24} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Click outside backdrop (below dropdown, above page) */}
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="md:hidden fixed inset-0 bg-black/30 z-[54]"
        />
      )}
    </header>
  );
};

export default Navbar;
