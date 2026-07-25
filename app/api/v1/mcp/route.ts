// =====================================================================
// MCP EDGE GATEWAY — SECURITY MODEL (patched 2026-07-12, sweep manual 02)
//
// Original design delegated tenant isolation entirely to Supabase RLS
// via the caller's JWT. Audit finding: NO RLS policies exist in any
// migration in this repository, and `cohort_telemetry` /
// `scouting_metric_log` have no DDL in version control at all. RLS
// delegation without versioned policies is an unverifiable wall.
//
// Therefore this route now enforces the APPLICATION-LAYER multi-tenant
// barrier (.agentic-os/02_SECURITY_SWEEP.md §2) in addition to the JWT:
//   1. Caller JWT -> auth.getUser() -> `users` row -> caller tenant_id.
//      Unresolvable identity fails closed (403).
//   2. Athlete-scoped tools (get_athlete_passport, log_scouting_metric)
//      verify the passport-plane athlete_id bridges to an app-plane
//      `athletes` row AND that `athlete_tenant_links` proves the
//      (athlete, caller-tenant) edge. No link -> FORBIDDEN.
//   3. get_cohort_telemetry filters on tenant_id = caller tenant. If the
//      deployed table lacks a tenant_id column the query errors and the
//      tool FAILS CLOSED — the required migration is the fix, not
//      removing the filter.
//   4. log_scouting_metric stamps tenant_id on the write. Same
//      fail-closed rule as (3).
//
// OPEN DEBT (tracked in 02 §4.1 as SEC-001): commit DDL + RLS policies
// for cohort_telemetry and scouting_metric_log. Until then this
// app-layer barrier is the ONLY tenant wall on this route.
// =====================================================================
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0").optional(),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
});

const ToolCallSchema = z.object({
  tool_name: z.string().min(1),
  arguments: z.record(z.unknown()).optional(),
});

const ToolNameSchema = z.enum([
  "get_cohort_telemetry",
  "get_athlete_passport",
  "log_scouting_metric",
]);

type JsonRpcId = string | number | null;

type ToolCall = {
  toolName: string;
  args: Record<string, unknown>;
};

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

function buildJsonRpcResponse(id: JsonRpcId, result?: unknown, error?: { code: number; message: string; data?: unknown }) {
  return {
    jsonrpc: "2.0" as const,
    id,
    ...(error ? { error } : { result }),
  };
}

function getBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  const sessionHeader = req.headers.get("x-session-jwt");
  return sessionHeader?.trim() ? sessionHeader.trim() : null;
}

function getSupabaseClient(jwt: string): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("missing_server_config");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });
}

// ---------------------------------------------------------------------
// MULTI-TENANT AUTHORIZATION BARRIER — .agentic-os/02_SECURITY_SWEEP.md
// ---------------------------------------------------------------------
type CallerContext = {
  userId: string;
  email: string;
  role: string;
  tenantId: string;
};

/**
 * Resolve the authenticated caller to exactly one tenant via the app-plane
 * `users` table. Fail closed: any auth error, missing email, or missing
 * users row returns null and the request must be rejected.
 */
async function resolveCallerTenant(client: SupabaseClient): Promise<CallerContext | null> {
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData?.user?.email) return null;

  const { data: row, error } = await client
    .from("users")
    .select("id, email, role, tenant_id")
    .eq("email", authData.user.email)
    .maybeSingle();
  if (error || !row || !row.tenant_id) return null;

  return {
    userId: String(row.id),
    email: String(row.email),
    role: String(row.role),
    tenantId: String(row.tenant_id),
  };
}

/**
 * Verify the (athlete, tenant) boundary for a PASSPORT-plane athlete_id.
 * Bridge path: public.athlete.athlete_id -> athletes.passport_athlete_id
 * -> athlete_tenant_links(athlete_id, tenant_id).
 * "error" = infrastructure failure (surface as 500-class, never as allow).
 * "forbidden" = no bridge row or no link row (fail closed).
 */
async function verifyAthleteTenantBoundary(
  client: SupabaseClient,
  passportAthleteId: string,
  tenantId: string,
): Promise<"ok" | "forbidden" | "error"> {
  const { data: appAthlete, error: athleteError } = await client
    .from("athletes")
    .select("id")
    .eq("passport_athlete_id", passportAthleteId)
    .maybeSingle();
  if (athleteError) return "error";
  if (!appAthlete) return "forbidden"; // unbridged passport identities are unreachable via tenant tooling

  const { data: link, error: linkError } = await client
    .from("athlete_tenant_links")
    .select("id")
    .eq("athlete_id", appAthlete.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (linkError) return "error";
  return link ? "ok" : "forbidden";
}

function tenantBoundaryRejection(requestId: string, outcome: "forbidden" | "error") {
  if (outcome === "error") {
    return {
      content: [{ type: "text" as const, text: "Authorization lookup failed." }],
      structuredContent: { ok: false, error: "authorization_lookup_failed", requestId },
      isError: true,
    };
  }
  // No information leakage: do not reveal athlete existence or tenant lists.
  return {
    content: [{ type: "text" as const, text: "Athlete-tenant boundary mismatch." }],
    structuredContent: { ok: false, error: "tenant_boundary_mismatch", requestId },
    isError: true,
  };
}

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "get_cohort_telemetry",
      description: "Retrieve cohort telemetry using the caller's authenticated session for RLS-aware access.",
      inputSchema: {
        type: "object",
        properties: {
          cohort_id: { type: "string" },
          vertical: { type: "string" },
        },
        required: ["cohort_id"],
      },
    },
    {
      name: "get_athlete_passport",
      description: "Return a passport-style athlete profile with the caller's JWT flowing to Supabase for RLS enforcement.",
      inputSchema: {
        type: "object",
        properties: {
          athlete_id: { type: "string" },
        },
        required: ["athlete_id"],
      },
    },
    {
      name: "log_scouting_metric",
      description: "Persist a scouting metric event through Supabase with the caller's JWT preserved for row-level access.",
      inputSchema: {
        type: "object",
        properties: {
          athlete_id: { type: "string" },
          metric_code: { type: "string" },
          value: { type: ["number", "string", "boolean"] },
          context: { type: "string" },
        },
        required: ["athlete_id", "metric_code", "value"],
      },
    },
  ];
}

function normalizeToolCall(input: unknown): ToolCall {
  const parsed = ToolCallSchema.parse(input);
  return {
    toolName: parsed.tool_name,
    args: parsed.arguments ?? {},
  };
}

async function invokeTool(
  toolName: string,
  args: Record<string, unknown>,
  client: SupabaseClient,
  requestId: string,
  caller: CallerContext,
) {
  switch (toolName) {
    case "get_cohort_telemetry": {
      const cohortId = String(args.cohort_id ?? "").trim();
      if (!cohortId) {
        return {
          content: [{ type: "text" as const, text: "Missing cohort_id" }],
          structuredContent: { ok: false, error: "missing_cohort_id" },
          isError: true,
        };
      }

      // TENANT SCOPE: rows outside the caller's tenant are invisible.
      // If deployed DDL lacks tenant_id this errors -> fails closed (see header).
      const { data, error } = await client
        .from("cohort_telemetry")
        .select("cohort_id, vertical, enrolled_count, active_count, conversion_rate, last_updated_at")
        .eq("cohort_id", cohortId)
        .eq("tenant_id", caller.tenantId)
        .limit(1)
        .maybeSingle();

      if (error) {
        return {
          content: [{ type: "text" as const, text: `Cohort telemetry lookup failed: ${error.message}` }],
          structuredContent: { ok: false, error: "database_query_failed", requestId, details: error.message },
          isError: true,
        };
      }

      return {
        content: [{ type: "json" as const, data: data ?? null }],
        structuredContent: { ok: true, requestId, data: data ?? null },
      };
    }

    case "get_athlete_passport": {
      const athleteId = String(args.athlete_id ?? "").trim();
      if (!athleteId) {
        return {
          content: [{ type: "text" as const, text: "Missing athlete_id" }],
          structuredContent: { ok: false, error: "missing_athlete_id" },
          isError: true,
        };
      }

      // MULTI-TENANT BARRIER: passport reads expose DOB/sex — minors' data.
      // The caller's tenant must hold an athlete_tenant_links edge.
      const boundary = await verifyAthleteTenantBoundary(client, athleteId, caller.tenantId);
      if (boundary !== "ok") return tenantBoundaryRejection(requestId, boundary);

      const { data, error } = await client
        .from("athlete")
        .select("athlete_id, legal_name, preferred_name, date_of_birth, sex_at_birth, nationalities, primary_sport_code, created_at")
        .eq("athlete_id", athleteId)
        .maybeSingle();

      if (error) {
        return {
          content: [{ type: "text" as const, text: `Athlete passport lookup failed: ${error.message}` }],
          structuredContent: { ok: false, error: "database_query_failed", requestId, details: error.message },
          isError: true,
        };
      }

      return {
        content: [{ type: "json" as const, data: data ?? null }],
        structuredContent: { ok: true, requestId, passport: data ?? null },
      };
    }

    case "log_scouting_metric": {
      const athleteId = String(args.athlete_id ?? "").trim();
      const metricCode = String(args.metric_code ?? "").trim();
      const value = args.value;

      if (!athleteId || !metricCode || value === undefined) {
        return {
          content: [{ type: "text" as const, text: "Missing athlete_id, metric_code, or value" }],
          structuredContent: { ok: false, error: "invalid_payload" },
          isError: true,
        };
      }

      // MULTI-TENANT BARRIER: writes require a proven (athlete, tenant) edge.
      const boundary = await verifyAthleteTenantBoundary(client, athleteId, caller.tenantId);
      if (boundary !== "ok") return tenantBoundaryRejection(requestId, boundary);

      const payload = {
        athlete_id: athleteId,
        metric_code: metricCode,
        value,
        context: String(args.context ?? "training_session"),
        logged_at: new Date().toISOString(),
        // Tenant stamp — required for scoped reads. If deployed DDL lacks
        // this column the insert errors -> fails closed (see header).
        tenant_id: caller.tenantId,
      };

      const { data, error } = await client.from("scouting_metric_log").insert(payload).select("*" ).single();

      if (error) {
        return {
          content: [{ type: "text" as const, text: `Scouting metric log failed: ${error.message}` }],
          structuredContent: { ok: false, error: "database_write_failed", requestId, details: error.message },
          isError: true,
        };
      }

      return {
        content: [{ type: "json" as const, data: data ?? null }],
        structuredContent: { ok: true, requestId, persisted: data ?? null },
      };
    }

    default:
      return {
        content: [{ type: "text" as const, text: `Unsupported tool: ${toolName}` }],
        structuredContent: { ok: false, error: "unsupported_tool" },
        isError: true,
      };
  }
}

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const token = getBearerToken(req);

  if (!token) {
    return NextResponse.json(
      buildJsonRpcResponse(null, undefined, { code: -32001, message: "Authentication required" }),
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    {
      protocol: "streamable-http",
      requestId,
      capabilities: {
        streaming: true,
        tools: getToolDefinitions(),
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        buildJsonRpcResponse(null, undefined, { code: -32001, message: "Authentication required" }),
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const body = await req.text();
    if (!body) {
      return NextResponse.json(
        buildJsonRpcResponse(null, undefined, { code: -32600, message: "Empty request body" }),
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const parsedBody = JsonRpcRequestSchema.safeParse(JSON.parse(body));
    if (!parsedBody.success) {
      return NextResponse.json(
        buildJsonRpcResponse(null, undefined, { code: -32600, message: "Invalid JSON-RPC request" }),
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { method, params, id } = parsedBody.data;
    if (method === "initialize") {
      return NextResponse.json(
        buildJsonRpcResponse(id ?? null, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "athlytica-mcp-edge", version: "0.1.0" },
          tools: getToolDefinitions(),
        }),
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (method === "tools/list") {
      return NextResponse.json(
        buildJsonRpcResponse(id ?? null, { tools: getToolDefinitions() }),
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (method === "tools/call") {
      const toolCall = normalizeToolCall(params);
      const toolName = ToolNameSchema.safeParse(toolCall.toolName);
      if (!toolName.success) {
        return NextResponse.json(
          buildJsonRpcResponse(id ?? null, undefined, { code: -32602, message: "Unsupported tool" }),
          { status: 400, headers: { "Cache-Control": "no-store" } }
        );
      }

      const client = getSupabaseClient(token);

      // MULTI-TENANT AUTHORIZATION BARRIER (02_SECURITY_SWEEP.md §2):
      // every tool call executes inside exactly one resolved tenant.
      const caller = await resolveCallerTenant(client);
      if (!caller) {
        return NextResponse.json(
          buildJsonRpcResponse(id ?? null, undefined, {
            code: -32001,
            message: "Caller identity could not be resolved to a tenant.",
          }),
          { status: 403, headers: { "Cache-Control": "no-store" } }
        );
      }

      const result = await invokeTool(toolName.data, toolCall.args, client, requestId, caller);

      return NextResponse.json(
        buildJsonRpcResponse(id ?? null, {
          content: result.content,
          structuredContent: result.structuredContent,
          isError: result.isError ?? false,
        }),
        { status: result.isError ? 400 : 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      buildJsonRpcResponse(id ?? null, undefined, { code: -32601, message: "Method not found" }),
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      buildJsonRpcResponse(null, undefined, {
        code: -32603,
        message: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
