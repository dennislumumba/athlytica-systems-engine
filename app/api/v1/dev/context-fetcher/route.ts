// =====================================================================
// CONTEXT7 DOCS FETCHER — Charlie OS skill 1.02 (Dept 1: Developers)
// GET /api/v1/dev/context-fetcher?package=<npm-name>
//
// PURPOSE: index an installed third-party dependency (manifest metadata
// + bounded type-declaration listing) for model/terminal consumption.
//
// SECURITY MODEL (05_CORPORATE_SKILLS.md §2 — this is a filesystem-
// touching route, so the boundaries are laws, not preferences):
//   1. DEV-ONLY. NODE_ENV === "production" -> 403 unconditionally.
//      A disk-reading API surface has no business existing in prod.
//   2. NO PATHS ACCEPTED. Input is an npm package NAME validated
//      against the strict npm-name grammar. "../", absolute paths,
//      URL-encoding tricks all fail the regex before touching fs.
//   3. REALPATH CONFINEMENT. The resolved package root must sit inside
//      the realpath of <cwd>/node_modules after symlink resolution,
//      or the request is rejected. Defense in depth behind (2).
//   4. BOUNDED OUTPUT. Only package.json (size-capped) is parsed;
//      declaration files are LISTED (never read), walk depth and file
//      count are capped. This route never returns arbitrary file
//      contents.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Official npm package-name grammar (scoped + unscoped).
const NPM_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const MANIFEST_SIZE_CAP_BYTES = 1_000_000; // 1 MB
const DECL_FILE_CAP = 200;
const WALK_DEPTH_CAP = 4;

interface PackageIndex {
  name: string;
  version: string;
  description: string | null;
  entryPoints: {
    main: string | null;
    module: string | null;
    types: string | null;
    exportKeys: string[];
  };
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  declarationFiles: string[]; // paths relative to package root, listing only
  declarationListTruncated: boolean;
}

async function listDeclarationFiles(root: string): Promise<{ files: string[]; truncated: boolean }> {
  const files: string[] = [];
  let truncated = false;

  async function walk(dir: string, depth: number): Promise<void> {
    if (truncated || depth > WALK_DEPTH_CAP) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable subtree: skip, never error the request
    }
    for (const entry of entries) {
      if (truncated) return;
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith(".d.ts")) {
        if (files.length >= DECL_FILE_CAP) {
          truncated = true;
          return;
        }
        files.push(path.relative(root, full).split(path.sep).join("/"));
      }
    }
  }

  await walk(root, 0);
  return { files, truncated };
}

export async function GET(request: NextRequest) {
  // Law 1: development-only surface.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { status: "FORBIDDEN", error: "context-fetcher is a development-only surface." },
      { status: 403 },
    );
  }

  // Law 2: names only, never paths.
  const pkgName = request.nextUrl.searchParams.get("package") ?? "";
  if (!NPM_NAME_RE.test(pkgName) || pkgName.length > 214) {
    return NextResponse.json(
      { status: "INPUT_REJECTED", error: "Expected a valid npm package name (?package=)." },
      { status: 400 },
    );
  }

  const nodeModules = path.join(process.cwd(), "node_modules");
  const candidateRoot = path.join(nodeModules, ...pkgName.split("/"));

  // Law 3: realpath confinement.
  let realRoot: string;
  let realNodeModules: string;
  try {
    [realRoot, realNodeModules] = await Promise.all([
      fs.realpath(candidateRoot),
      fs.realpath(nodeModules),
    ]);
  } catch {
    return NextResponse.json(
      { status: "NOT_FOUND", error: `Package "${pkgName}" is not installed.` },
      { status: 404 },
    );
  }
  if (realRoot !== realNodeModules && !realRoot.startsWith(realNodeModules + path.sep)) {
    return NextResponse.json(
      { status: "FORBIDDEN", error: "Resolved package escapes the node_modules boundary." },
      { status: 403 },
    );
  }

  // Law 4: bounded manifest read.
  const manifestPath = path.join(realRoot, "package.json");
  let manifest: Record<string, unknown>;
  try {
    const stat = await fs.stat(manifestPath);
    if (stat.size > MANIFEST_SIZE_CAP_BYTES) {
      return NextResponse.json(
        { status: "INPUT_REJECTED", error: "Package manifest exceeds size cap." },
        { status: 422 },
      );
    }
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { status: "NOT_FOUND", error: `No readable package.json for "${pkgName}".` },
      { status: 404 },
    );
  }

  const { files: declarationFiles, truncated } = await listDeclarationFiles(realRoot);

  const exportsField = manifest.exports;
  const payload: PackageIndex = {
    name: typeof manifest.name === "string" ? manifest.name : pkgName,
    version: typeof manifest.version === "string" ? manifest.version : "unknown",
    description: typeof manifest.description === "string" ? manifest.description : null,
    entryPoints: {
      main: typeof manifest.main === "string" ? manifest.main : null,
      module: typeof manifest.module === "string" ? manifest.module : null,
      types:
        typeof manifest.types === "string"
          ? manifest.types
          : typeof manifest.typings === "string"
            ? manifest.typings
            : null,
      exportKeys:
        exportsField && typeof exportsField === "object" && !Array.isArray(exportsField)
          ? Object.keys(exportsField as Record<string, unknown>).slice(0, 100)
          : [],
    },
    dependencies: (manifest.dependencies as Record<string, string> | undefined) ?? {},
    peerDependencies: (manifest.peerDependencies as Record<string, string> | undefined) ?? {},
    declarationFiles,
    declarationListTruncated: truncated,
  };

  return NextResponse.json({ status: "OK", index: payload }, { status: 200 });
}
