"use client";

// =====================================================================
// LEGACY REDIRECT — /register/academy  →  /register/bigice
//
// This route used to render a "unified intake": one League/academy
// dropdown offering Big Ice, NRHL and Athlytica, with the package list
// swapping underneath it. That is the page a parent arriving from
// bigice.co.ke to buy skating lessons actually landed on, and it showed
// them — in one radio list, under a header reading
// "NRHL · Big Ice · Athlytica" — the NRHL Performance Hockey Program at
// 27,500, NRHL Elite at 45,000 and a 150,000 institutional campus
// licence. Big Ice and NRHL are separate businesses with separate
// journeys; that page merged their catalogues at the moment of payment.
//
// The Big Ice registration now lives at /register/bigice and sells Big
// Ice packages only. This route stays because its URL is live in the
// wild (bigice.co.ke CTAs, and /register's own redirect for
// ?source=bigice / ?package=), and a dead checkout link is worse than a
// hop. §44: do not break existing links without a redirect.
//
// RETIRED WITH THE OLD PAGE: the self-service `enterprise_150k`
// Institutional / Campus Licence radio option. It was linked from no
// public surface, and a KES 150,000 campus licence is not a purchase
// anyone makes by tapping a radio button next to a child's skating
// lessons. The tier itself is untouched — config/registration-fees.ts,
// the STK route and the NRHL dashboard label all still know it, so an
// institutional sale settles exactly as before through admissions.
// =====================================================================

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AcademyRedirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    // Query is preserved verbatim: ?package=<tier_id> is how a
    // "Choose 6 Months" click arrives with 6 months already selected,
    // and dropping it would land every deep link on an unselected page.
    const qs = params.toString();
    router.replace(qs ? `/register/bigice?${qs}` : "/register/bigice");
  }, [params, router]);

  // Deliberately not a spinner. A redirect that fails leaves whatever is
  // on screen, and a spinner that never resolves tells a parent nothing.
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#0A1B33",
        color: "#E8EEF7",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        padding: 24,
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: 15, lineHeight: 1.7 }}>
        Taking you to Big Ice registration…
        <br />
        <a href="/register/bigice" style={{ color: "#FFE49B" }}>
          Continue now →
        </a>
      </p>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AcademyRedirect />
    </Suspense>
  );
}
