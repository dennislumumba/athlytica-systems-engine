// =====================================================================
// DOCUMENT RETRIEVAL — GET /api/v1/portal/document/<document_id>
//
// §53: a parent's documents are not reachable by guessing a URL. The id
// is a UUID, but that is not the control — the control is that this
// route resolves the caller's own athletes from their verified session
// and refuses any document not belonging to one of them. Guessing a
// valid id gets a 404, not a document.
//
// Returns the STORED artifact, byte for byte as it was issued. It is
// never re-rendered from the current template, because the point of
// keeping it (§21) is that a family can always see what they were
// actually sent.
//
// Served as text/html with a restrictive CSP and nosniff: the stored
// documents are ours, but this endpoint returns a document body to a
// browser, and that is worth locking down at the boundary rather than
// trusting the pipeline that filled the column.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { adminClient, serviceRoleConfigured } from "@/lib/auth/workspace";
import { resolveGuardian } from "@/lib/auth/guardian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!serviceRoleConfigured()) {
    return NextResponse.json(
      { success: false, status: "CONFIG_DEBT", error: "Database credentials are not provisioned." },
      { status: 503 },
    );
  }

  const guardian = await resolveGuardian(request);
  if (!guardian) {
    return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });
  }

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ success: false, error: "Not found." }, { status: 404 });
  }

  const codes = guardian.athletes.map((a) => a.biifCode);
  if (codes.length === 0) {
    return NextResponse.json({ success: false, error: "Not found." }, { status: 404 });
  }

  // The ownership filter is part of the QUERY, not a check on the
  // result. A document belonging to another family is never loaded into
  // this process in the first place.
  const { data, error } = await adminClient()
    .from("bigice_document")
    .select("title, content_html")
    .eq("document_id", id)
    .in("biif_code", codes)
    .maybeSingle();

  // A document that exists but is not theirs and one that does not exist
  // return the same thing — a distinguishable response would confirm
  // which ids are real.
  if (error || !data) {
    return NextResponse.json({ success: false, error: "Not found." }, { status: 404 });
  }

  return new NextResponse(String(data.content_html), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      "Cache-Control": "private, no-store",
    },
  });
}
