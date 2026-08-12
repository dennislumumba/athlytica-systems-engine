import type { ReactNode } from "react";

// =====================================================================
// BIG ICE REGISTRATION — page identity.
//
// The root layout titles every route "Athlytica", which is right for a
// multi-workspace shell and wrong for the one page where a parent is
// about to enter an M-Pesa PIN. The browser tab, the bookmark, the
// shared link preview and the printed receipt header all read from here,
// and every one of them is a place a parent checks that they are dealing
// with the business they think they are dealing with.
//
// THE FAVICON PATH IS /logo-shield.png ON PURPOSE. This page is served
// on two hosts: the engine's own domain, and bigice.co.ke through a
// vercel.json proxy that forwards only /register, /portal, /api/v1/* and
// /_next/*. A root-relative icon therefore resolves against WHICHEVER
// host is serving — so it has to be a path that exists on both.
// bigice.co.ke already ships /logo-shield.png, and public/ now carries
// the same file, so the tab icon is correct either way. (The wordmark
// inside the page dodges this entirely by static-importing the image
// into /_next/static/media/, which IS proxied.)
// =====================================================================

export const metadata = {
  title: "Register — Big Ice Inline Fitness",
  description:
    "Register your athlete with Big Ice Inline Fitness. Choose a skating development programme, " +
    "pay securely by M-Pesa, and receive a permanent Big Ice Athlete ID.",
  icons: { icon: "/logo-shield.png" },
  openGraph: {
    title: "Register — Big Ice Inline Fitness",
    description:
      "Skating development programmes in Nairobi. Register your athlete and pay securely by M-Pesa.",
    siteName: "Big Ice Inline Fitness",
  },
  // A checkout has no business in search results: the URLs carry
  // ?package= deep links, and an indexed one goes stale the moment a
  // price tier is retired.
  robots: { index: false, follow: true },
};

export default function BigIceRegistrationLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
