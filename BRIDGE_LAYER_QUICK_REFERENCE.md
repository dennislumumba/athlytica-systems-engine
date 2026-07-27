# Convex Bridge Layer — Quick Reference Guide

**Last Updated:** 2026-07-14  
**Status:** Production-Ready ✅

---

## 🎯 What This Bridge Does

Automatically synchronizes athlete data from our Supabase backend to the Hercules frontend (Convex) whenever:
- A new athlete is registered
- An athlete's profile is updated
- Performance metrics are logged

---

## 📍 Where to Find Things

### Core Modules
| What | Where | Purpose |
|------|-------|---------|
| Data transformation | `lib/converters/convexAdapter.ts` | Postgres rows → Convex documents |
| Async queue | `lib/sync/convexSyncQueue.ts` | Job queue with retry logic |
| API webhook | `app/api/v1/sync/convex/route.ts` | Receives Supabase triggers |
| Schema | `supabase/migrations/20260714_sync_monitoring.sql` | Dead-letter queue table |
| ID normalization | `scripts/normalize-legacy-ids.js` | Legacy passport ID cleanup |
| Documentation | `BRIDGE_LAYER_DEPLOYMENT.md` | Complete operational guide |

---

## 🚀 Common Tasks

### Adding a New Data Type to Sync

1. **Add adapter function** in `lib/converters/convexAdapter.ts`:
   ```typescript
   export function toConvexYourDocument(row: YourRow): ConvexYourDocument {
     return {
       // Map fields...
       syncedFrom: "athlytica-postgres",
     };
   }
   ```

2. **Register in dispatch function**:
   ```typescript
   export function adaptRecordForConvex(recordType: ConvexRecordType, payload: unknown) {
     switch (recordType) {
       case "your_type":
         return toConvexYourDocument(payload as YourRow);
       // ...
     }
   }
   ```

3. **Add database trigger** in Supabase:
   ```sql
   CREATE TRIGGER sync_your_table
   AFTER INSERT ON public.your_table
   FOR EACH ROW
   EXECUTE FUNCTION public.send_sync_webhook('your_type', ROW);
   ```

### Testing the Bridge Locally

```bash
# 1. Ensure Supabase credentials are in .env.local
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=your-key

# 2. Start dev server
npm run dev

# 3. Send test payload to the webhook
curl -X POST http://localhost:3000/api/v1/sync/convex \
  -H 'Content-Type: application/json' \
  -H 'X-Signature: YOUR_HMAC_HERE' \
  -d '{
    "recordType": "athlete",
    "record": {
      "athlete_id": "test-uuid",
      "passport_id": "ATH-2025-0001",
      "legal_name": "Test Athlete",
      "primary_sport_code": "ice_hockey",
      "created_at": "2025-01-01T00:00:00Z"
    }
  }'

# Expected response: 202 Accepted
```

### Checking Dead-Letter Queue

```sql
-- In Supabase console or psql
SELECT id, record_type, last_error, failed_at
FROM public.sync_dead_letter_queue
ORDER BY failed_at DESC
LIMIT 10;
```

### Running ID Normalization

```bash
# Dry-run (recommended first)
node scripts/normalize-legacy-ids.js --dry-run

# Review outputs/normalize-legacy-ids-dryrun-*.json

# Execute (if dry-run looks good)
node scripts/normalize-legacy-ids.js --execute

# Verify outputs/normalize-legacy-ids-executed-*.json
```

---

## 🔒 Security Checklist

- [ ] `GOOGLE_FORMS_WEBHOOK_SECRET` set in environment
- [ ] Webhook endpoint always verifies X-Signature header
- [ ] Service role key never shared in code or logs
- [ ] Dead-letter queue has RLS enabled (no anon access)
- [ ] TypeScript strict mode enabled (no `any` types)

---

## 📊 Monitoring

### Queue Stats Endpoint
```javascript
// Inside Node.js handler
import { getSyncQueueStats } from "@/lib/sync/convexSyncQueue";

const stats = getSyncQueueStats();
console.log(`Pending: ${stats.pending}, Dispatched: ${stats.dispatched}`);
```

### Common Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| `RATE_LIMITED` | Convex endpoint returned 429 | Check Convex rate limits; respects Retry-After |
| `HTTP_5xx` | Server error from Convex | Will retry; check Convex status |
| `NETWORK_UNREACHABLE` | Can't reach Convex endpoint | Check network; verify endpoint URL |
| `TIMEOUT` | Request exceeded 10s | Convex endpoint slow; check load |

---

## 🐛 Troubleshooting

### "Invalid signature" error

**Problem:** Webhook returns 401

**Check:**
```bash
# 1. Verify GOOGLE_FORMS_WEBHOOK_SECRET matches trigger
echo $GOOGLE_FORMS_WEBHOOK_SECRET

# 2. Compute expected signature (compute HMAC-SHA256 of raw body)
node -e "
const crypto = require('crypto');
const secret = 'YOUR_SECRET';
const body = '{\"recordType\":\"athlete\",...}';
const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
console.log(hmac);
"

# 3. Compare with X-Signature header from trigger
```

### "athlete row '...' carries no passport_id"

**Problem:** Adapter throws error when passport_id is null

**Fix:** Run normalization script first
```bash
node scripts/normalize-legacy-ids.js --execute
```

### Dead-letter queue growing rapidly

**Problem:** Many jobs failing; need to investigate

**Solution:**
```sql
-- Group errors by type
SELECT last_error, COUNT(*) as count
FROM public.sync_dead_letter_queue
GROUP BY last_error
ORDER BY count DESC;

-- Check recent failures
SELECT failed_at, record_type, last_error
FROM public.sync_dead_letter_queue
WHERE failed_at > now() - INTERVAL '1 hour'
ORDER BY failed_at DESC;
```

---

## 📖 Type Reference

### Athlete Document (Convex)
```typescript
{
  passportId: "ATH-2025-0001",          // Canonical ID
  sourceRowId: "uuid",                  // Original Postgres UUID
  legalName: "First Last",
  preferredName: "Nickname" | null,
  dateOfBirth: "YYYY-MM-DD",
  sexAtBirth: "M" | "F" | null,
  nationalities: ["KE", "US"],
  status: "active" | "inactive",
  sport: "ice_hockey",                  // Normalized lowercase
  sizing: "{\"skate\":{\"size\":\"38\",\"system\":\"eu\"},\"protectiveKit\":{\"size\":\"xl\"}}", // JSON string
  syncedFrom: "athlytica-postgres",
  sourceUpdatedAt: "2026-07-14T10:30:00Z"
}
```

### Metric Document (Convex)
```typescript
{
  passportId: "ATH-2025-0001",
  sourceRowId: "uuid",
  sport: "ice_hockey" | null,
  metricCode: "SPEED_MAX",              // e.g., 'PHY_SPEED_MAX', 'COG_DECISION'
  metricValue: 28.5 | "HIGH" | true,    // Flexible type
  recordedAt: "2026-07-14T09:15:00Z",
  syncedFrom: "athlytica-postgres",
  sourceUpdatedAt: "2026-07-14T10:30:00Z"
}
```

---

## 🔗 Related Documentation

- **Full Deployment Guide:** [BRIDGE_LAYER_DEPLOYMENT.md](BRIDGE_LAYER_DEPLOYMENT.md)
- **Athlete Passport Spec:** [core-engine/athlytica-spec.md](core-engine/athlytica-spec.md)
- **Database Schema:** [prisma/schema.prisma](prisma/schema.prisma)
- **Supabase Docs:** https://supabase.com/docs

---

## ⚡ Performance Tips

1. **Batch inserts in Supabase** — Each insert fires a trigger; batch multiple athletes for efficiency
2. **Check queue stats regularly** — Use `getSyncQueueStats()` to monitor health
3. **Set appropriate backoff** — Exponential backoff (500ms → 1000ms) prevents thundering herd
4. **Dead-letter replay sparingly** — Only replay after verifying root cause is fixed

---

## 🤝 Getting Help

1. Check [BRIDGE_LAYER_DEPLOYMENT.md](BRIDGE_LAYER_DEPLOYMENT.md) for operational runbooks
2. Review TypeScript error messages (strict type checking helps catch issues early)
3. Check dead-letter queue logs for sync failures
4. Verify environment variables are set correctly

---

**Questions?** Review the deployment documentation or check the TypeScript interfaces for exact shapes.
