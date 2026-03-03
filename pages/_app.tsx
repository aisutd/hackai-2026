import type { AppProps } from 'next/app';
import Head from 'next/head';
import localFont from 'next/font/local';
import '../globals.css';
import { useRouter } from 'next/router';
import Preloader from '@/components/Preloader';
import React, { useState, useEffect } from 'react';

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
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    // Clean up on unmount
    return () => {
      setLoading(false);
    };
  }, [router.pathname]);

  return (
    <div className={`${octin.variable} ${streetFlow.variable}`}>
      {/* {loading && router.pathname === '/' ? (
        <Preloader onDone={() => setLoading(false)} minDuration={800} />
      ) : ( */}
        <Component {...pageProps} />
      {/* )} */}
    </div>
  );
}