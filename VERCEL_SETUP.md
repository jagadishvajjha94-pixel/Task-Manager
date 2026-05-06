# Vercel + shared storage (recommended)

Serverless deployments need **shared storage** so manager accounts, employee logins, and the board stay consistent across requests.

## Quick check

Open: `https://your-app.vercel.app/api/store-status`

- **`"backend":"upstash"`** — Redis (REST) is connected. Good.
- **`"backend":"file"`** — No shared DB. On Vercel, employee logins and data can break across instances.

## Connect Upstash Redis

1. Vercel project → **Storage** → create or link **Upstash Redis**.
2. Ensure **Production** has:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. If you use **Vercel KV** instead, ensure `KV_REST_API_URL` and `KV_REST_API_TOKEN` are set (the app reads both).
4. **Remove `REDIS_URL`** from Production if you saw timeouts or 504s (TCP often hangs on Vercel).
5. **Redeploy** without build cache.
6. Confirm `/api/store-status` shows `"backend":"upstash"`.
7. Sign in as manager, then **create employee logins again** (anything saved only to `/tmp` before Redis was not shared).

## Custom env prefix

If variables are prefixed (e.g. `STORAGE_UPSTASH_REDIS_REST_URL`), set `REDIS_ENV_PREFIX=STORAGE` in the project env.
