# Fix “Invalid email or password” on Vercel – Step-by-step

---

## “This project is already connected to the target store”

**You don’t need to fix anything.** That message means the project is **already linked** to that Redis store. Do **not** click Connect again.

- Go to **Settings → Environment Variables** and confirm `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are there.
- **Redeploy** (Deployments → ⋯ → Redeploy, uncheck “Use existing Build Cache”) so the app uses Redis.
- To use the same Redis **locally**: run `vercel env pull .env.development.local` (or copy the vars into `.env.development.local`). The API store loads that file when present.

---

On Vercel, each API runs in a **separate serverless function** with **no shared disk**. So:

- When the **manager** creates an employee login, that data is saved in one function’s memory/disk.
- When the **employee** tries to log in, a **different** function runs and never sees that data → **“Invalid email or password”**.

**Fix:** Use **Upstash Redis** (REST over HTTPS) so all API routes share the same storage.  
**Important:** Use **Upstash REST** (the env vars below), **not** `REDIS_URL`. On Vercel, `REDIS_URL` (TCP Redis) is often blocked; the app needs the REST URL and token.

---

## Checklist (do in order)

| #   | What to do                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------- |
| 1   | In Vercel: **Storage** → Create **Upstash Redis** (free)                                                    |
| 2   | **Connect** that Redis database to **this** Vercel project                                                  |
| 3   | Confirm **Settings → Environment Variables**: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` exist |
| 4   | **Redeploy** (Deployments → ⋯ → Redeploy, **uncheck** “Use existing Build Cache”)                           |
| 5   | First login: **Manager** with `manager@company.com` / `Manager@123`                                         |
| 6   | In app: Manager → **Create employee login** → create an employee                                            |
| 7   | Log out; log in as **Employee** with that email and password                                                |

---

## Step 1: Open your project on Vercel

1. Go to [https://vercel.com](https://vercel.com) and sign in.
2. Open your **Task Manager** project from the dashboard.

---

## Step 2: Create Upstash Redis (shared storage)

1. In the project, click **Storage** in the top nav (or **Integrations** / **Marketplace**).
2. Click **Create Database** (or **Add** / **Connect Store**).
3. Choose **Upstash Redis** (by Upstash).
4. **Create new database**:
   - **Name:** e.g. `taskmanager-redis`
   - **Region:** e.g. `us-east-1` or `ap-south-1`
   - **Type:** Free
5. Click **Create**.

---

## Step 3: Connect Redis to this project

1. After the database is created, you’ll see **Connect to Project** (or **Add to Project**).
2. Select **this** Vercel project (the Task Manager app).
3. Confirm **Production** (and optionally Preview) is selected.
4. Finish the connection.  
   Vercel will add two environment variables to the project:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`  
     You don’t need to copy them manually.

---

## Step 4: Confirm environment variables

1. In the project, go to **Settings** → **Environment Variables**.
2. You must see:
   - `UPSTASH_REDIS_REST_URL` (value hidden)
   - `UPSTASH_REDIS_REST_TOKEN` (value hidden)
3. If they are **missing**, go back to **Storage** → your Redis database → **Connect to Project** again and select this project.

**Do not rely only on `REDIS_URL`.** The app uses `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for Vercel. TCP Redis (`REDIS_URL`) often does not work on Vercel.

---

## Step 5: Redeploy

1. Go to **Deployments**.
2. Open the **⋯** menu on the latest deployment.
3. Click **Redeploy**.
4. **Uncheck** “Use existing Build Cache” so the new env vars and code are used.
5. Confirm **Redeploy**. Wait until the deployment is **Ready**.

---

## Step 6: Use the app (first time)

1. Open your app URL (e.g. `https://your-app.vercel.app`).
2. **Manager login (default account):**
   - Role: **Manager**
   - Email: `manager@company.com`
   - Password: `Manager@123`
   - Sign in.
3. In the app: open **Manager** (or account menu) → **Create employee login**.
4. Create an employee, e.g.:
   - Email: `employee@example.com`
   - Password: `Test@123` (min 6 characters)
   - Name: optional
5. **Employee login:**
   - Log out (or use another browser/incognito).
   - Role: **Employee**
   - Email: `employee@example.com`
   - Password: `Test@123`
   - Sign in.

If Redis is connected and you redeployed, employee login will work.

---

## If you still see “Invalid email or password”

1. **Redis connected to this project?**  
   **Settings** → **Environment Variables** → confirm `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` exist (not only `REDIS_URL`).

2. **Redeploy after adding Redis**  
   **Deployments** → ⋯ → **Redeploy** and **uncheck** “Use existing Build Cache”. Wait until Ready.

3. **Manager first**  
   Log in as Manager (`manager@company.com` / `Manager@123`) so the default manager is created in Redis. Then create employee logins.

4. **Employee created after Redis + redeploy**  
   Create the employee login **after** Redis is connected and you’ve redeployed. Old “employees” created before Redis are not in Redis.

5. **Exact credentials**  
   Use the **exact** email and password you set when creating the employee (case-sensitive for password).

6. **Wait a bit**  
   After redeploy, wait 1–2 minutes and try again.

---

## Summary

| Step | Action                                                                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------- |
| 1    | Vercel → your project                                                                                      |
| 2    | **Storage** → Create **Upstash Redis** (free)                                                              |
| 3    | **Connect** Redis to this project                                                                          |
| 4    | **Settings → Environment Variables**: ensure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` exist |
| 5    | **Deployments** → Redeploy (no build cache)                                                                |
| 6    | First login: Manager `manager@company.com` / `Manager@123`                                                 |
| 7    | Create employee logins in the app; then log in as Employee with those credentials                          |

Using **Upstash REST** (not only `REDIS_URL`) and **redeploying after connecting** Redis is what makes the deployed app work without “Invalid email or password”.
