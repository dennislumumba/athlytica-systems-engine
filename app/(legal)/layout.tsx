import type { ReactNode } from "react";
import Link from "next/link";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "48px 20px 64px",
        lineHeight: 1.75,
        fontSize: 15,
      }}
    >
      <nav style={{ display: "flex", gap: 16, fontSize: 13, marginBottom: 28 }}>
        <Link href="/" style={{ color: "#9fb1c9" }}>
          Home
        </Link>
        <Link href="/terms" style={{ color: "#9fb1c9" }}>
          Terms of Service
        </Link>
        <Link href="/privacy" style={{ color: "#9fb1c9" }}>
          Privacy Policy
        </Link>
      </nav>
      {children}
      <p style={{ marginTop: 40, fontSize: 12, color: "#5f7392" }}>
        Athlytica Technologies Limited · Nairobi, Kenya · legal@athlyticahq.com
      </p>
    </main>
  );
}
