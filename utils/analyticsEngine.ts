// =====================================================================
// ATHLYTICA ANALYTICS ENGINE — Next.js entry point
// The canonical implementation lives in
// supabase/functions/_shared/analyticsEngine.ts so the Supabase Edge
// Function (Deno) and the Next.js app (Node) execute IDENTICAL math.
// Never fork the logic here — edit the canonical file only.
// =====================================================================

export * from "../supabase/functions/_shared/analyticsEngine";
