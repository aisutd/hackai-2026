import type { AppProps } from 'next/app';
import localFont from 'next/font/local';
import '../globals.css';
import { useRouter } from 'next/router';
import Preloader from '@/components/Preloader';
import React, { useCallback, useEffect, useState } from 'react';

const octin = localFont({
  src: [{ path: "../public/fonts/OctinSpraypaint.otf" }],
  variable: "--font-octin",
  display: "swap",
});

const streetFlow = localFont({
  src: [{ path: "../public/fonts/StreetFlowNYC.otf" }],
  variable: "--font-streetflow",
  display: "swap",
});

export default function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [homePreloaderDone, setHomePreloaderDone] = useState(false);

  const handlePreloaderDone = useCallback(() => {
    setHomePreloaderDone(true);
    const w = window as Window & { __HACKAI_PRELOADER_DONE?: boolean };
    w.__HACKAI_PRELOADER_DONE = true;
    window.dispatchEvent(new Event('hackai-preloader-done'));
  }, []);

  useEffect(() => {
    const w = window as Window & { __HACKAI_PRELOADER_DONE?: boolean };
    w.__HACKAI_PRELOADER_DONE = homePreloaderDone;
  }, [homePreloaderDone]);

  const showPreloader = router.pathname === '/' && !homePreloaderDone;

  return (
    <div className={`${octin.variable} ${streetFlow.variable}`}>
      <Component {...pageProps} />
      {showPreloader && <Preloader onDone={handlePreloaderDone} />}
    </div>
  );
}
