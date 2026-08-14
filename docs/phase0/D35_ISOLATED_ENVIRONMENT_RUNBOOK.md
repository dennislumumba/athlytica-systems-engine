# D-35 — Isolated Postgres: operator checklist and FORCE RLS test matrix

**Status: BLOCKED.** Requires an elevated terminal and a reboot, neither of
which is available to an agent session. **The requirement is not weakened:
until the matrix in §2 executes against an isolated Postgres, no FORCE RLS
behaviour may be claimed and M1 may not be accepted. Static analysis is not a
substitute.**

## Diagnosis — VERIFIED 2026-08-15

| Check | Result |
|---|---|
| `docker --version` | **Docker version 29.7.2** — installed |
| Docker Desktop binary | present at `C:\Program Files\Docker\Docker\Docker Desktop.exe` |
| Launched during this phase | yes — engine failed: `npipe:////./pipe/dockerDesktopLinuxEngine` never appeared, then `Docker Desktop is unable to start` |
| `wsl --status` | **"The Windows Subsystem for Linux is not installed."** ← root cause |
| `com.docker.service` | `Stopped`, StartType `Manual` |
| Session elevated? | **No** |
| `supabase` CLI | not installed (`npx supabase` works) |
| `psql` | not installed |

Docker Desktop was stopped again afterwards; the machine is as it was found.

---

## 1. Operator checklist

Steps 1–3 need an **elevated** terminal. Do not run them from an agent session.

### 1. Open an elevated terminal
Start menu → *PowerShell* → **Run as administrator**. Confirm:
```powershell
([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
```
Must print `True`.

### 2. Install the WSL components
```powershell
wsl --install
```
This enables `VirtualMachinePlatform` and `Microsoft-Windows-Subsystem-Linux`,
installs the WSL2 kernel and a default distribution. If it reports WSL is
already partly present:
```powershell
wsl --install --no-distribution
wsl --set-default-version 2
```

### 3. Reboot
Required. `wsl --install` will say so.

### 4. Start Docker Desktop
```powershell
Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
```
Wait for the whale icon to stop animating. First start after a WSL install can
take several minutes while the backend VM is provisioned.

### 5. Verify the daemon
```bash
docker info --format '{{.ServerVersion}}'
```
Must print a version. If it prints `failed to connect to the docker API`, stop
here — the environment is still not ready and nothing below is meaningful.

### 6. Start the local stack
From the repository root:
```bash
npx supabase start
```
First run downloads several GB of images. It ends by printing `API URL`,
`DB URL`, `service_role key` and `anon key` for the **local** stack.

> ⚠ **Never point this at production.** `npx supabase start` is self-contained.
> Do **not** run `supabase link`, `supabase db push`, or
> `supabase migration repair` (D-32) at any point.

### 7. Verify local Postgres and load the schema
```bash
npx supabase status
psql "$LOCAL_DB_URL" -c "select current_database(), version();"
```
Then reproduce **only the relevant objects** — do not restore a production
dump, which would copy real registrations and guardian rows into a container:

```bash
# Schema only, no data, from the local migration files:
npx supabase db reset          # replays supabase/migrations into the local stack
```

`supabase db reset` is safe **because it targets the local container**. Note it
will replay all 38 local migration files, 30 of which carry versions that do
not match production (D-16) — that is expected and harmless locally, and is
itself a useful check that the local files are internally consistent.

Seed the fixtures the matrix needs (synthetic only — never production rows):
one `provenance` row, one `tenants` row, two `public.users`, two
`auth.users`, two `public.athlete` rows with `guardian_contact`, one
`registrations` row.

### 8. Run the matrix in §2, record every result, then update
`RLS_IDENTITY_THREAT_MODEL.md` §6 and close D-35.

---

## 2. FORCE RLS test matrix

Run each case **twice** — once with `FORCE ROW LEVEL SECURITY` off (the current
production posture) and once with it on. **A row only passes when the two runs
are both understood**, not merely when the second one does not error.

Legend: **must-pass** = required for FORCE RLS to be adoptable.

| # | Case | Setup | Assertion | Why it can fail |
|---|---|---|---|---|
| **1** | `public.athletes` read, owner | `role authenticated`, JWT = owner | own bridge row visible, others not | baseline; confirms M5 unchanged under FORCE |
| **2** | `public.athletes` write, client | `role authenticated` | **denied 42501** both runs | M5 revoked the grant; FORCE must not re-open it |
| **3** | `public.athletes` write, service | `role service_role` | succeeds both runs | **must-pass** — FORCE could subject service_role to policy if it is not `BYPASSRLS` |
| **4** | Guardian ownership read | owner JWT, athlete claimed | `guardian_contact`, `biometric_record`, `injury_record`, `custody_record` return exactly the owned athlete's rows | **must-pass** — these policies call `jwt_athlete_ids()`, a DEFINER function reading a forced table |
| **5** | `jwt_athlete_ids()` under FORCE | as #4 | returns the same set in both runs | **must-pass** — the function runs as `postgres`; under FORCE it becomes subject to `athletes_self_read`. If `auth.uid()` does not resolve inside the DEFINER context, this returns ∅ and every athlete-scoped page silently goes blank **with no error** |
| **6** | Policy → DEFINER → forced-table recursion | force `athletes`, query `athlete` | no `infinite recursion detected in policy` | **must-pass** — surfaces at runtime under load, not at migration time |
| **7** | **Big Ice athlete creation** | `bigice_next_athlete_code()` + insert, service_role | succeeds; sequence Δ == rows Δ | **must-pass** — DEFINER writing a forced table |
| **8** | **NRHL athlete creation** | `link_guardian` + `nrhl_next_athlete_code()` + upsert | succeeds; guardian row created | **must-pass** — three DEFINERs in one path |
| **9** | **Settlement against `registrations`** | `settle_payment_transaction`, service_role, forced `registrations` | settles; no policy denial | **must-pass, highest risk.** `tenant_isolation_policy` is `tenant_id = app_tenant_id()`, and `app_tenant_id()` is **NULL** in a service-role connection. Under FORCE this plausibly denies the write and **breaks checkout.** D-01b (drop that policy) must land *before* FORCE reaches this table |
| **10** | `payment_service_authorization` | M4 gate, forced tables | returns the same verdicts as unforced | must-pass |
| **11** | SECURITY DEFINER `search_path` | call each DEFINER with a hostile `search_path` set | behaviour unchanged | pinned on all but `generate_legacy_claim_token`; confirm the unpinned one is genuinely unreachable by clients |
| **12** | `service_role` BYPASSRLS? | `select rolbypassrls from pg_roles where rolname='service_role'` | record the answer | determines whether FORCE touches service paths at all — **answer this first; it conditions 3, 7, 8, 9** |
| **13** | `authenticated` behaviour | full CRUD attempt on each forced table | denied except where a policy admits | no silent widening |
| **14** | **Rollback** | apply FORCE, run the M5 rollback, re-run #1–#4 | posture returns exactly to pre-FORCE | **must-pass** — an un-revertable security change is not adoptable |
| **15** | **Concurrent creation** | two sessions, simultaneous Big Ice creates | no duplicate identifiers; no deadlock on `scalable_id_sequence` | **must-pass** — needs two connections, which is precisely why the MCP connector cannot do it |
| **16** | Concurrent NRHL creation | as #15, NRHL path | same | must-pass |
| **17** | Cross-venture concurrent | one Big Ice + one NRHL simultaneously | no cross-venture code reuse; measure lock contention on the shared sequence row | quantifies M1's serialisation cost — and, under D-33 Option C, should show it disappearing |

### Ordering constraint

> **Case 9 must be run, and D-01b resolved, before `FORCE` is applied to
> `registrations` in production.** If case 9 fails, FORCE on that table breaks
> settlement — and settlement is the only path by which this business takes
> money.

### Exit criteria for D-35

D-35 closes when **all 17 rows have recorded results from an isolated
Postgres**, cases marked must-pass have passed, and case 14 has demonstrated a
clean rollback. Partial results do not close it. A green matrix with cases 15–17
unrun does not close it, because those are the ones this environment cannot
run — which is the entire reason D-35 exists.
