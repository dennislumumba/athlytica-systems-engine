export const dynamic = 'force-dynamic';

// The tab container lives in layout.tsx; the index route is just the
// entry point into the first tab.

import { redirect } from "next/navigation";

export default function NrhlLeagueIndex() {
  redirect("/dashboard/leagues/nrhl/overview");
}
