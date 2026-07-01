# Deploying to Railway + MongoDB Atlas

This app deploys as a **single Railway service**: the `Dockerfile` builds the React
frontend and the Node/Express backend serves it alongside the `/api` routes. One URL,
no CORS, no separate frontend host.

You will do three things: (1) create a free MongoDB Atlas database, (2) push this code
to GitHub, (3) connect the GitHub repo to Railway and set environment variables.

---

## 1. MongoDB Atlas (free database)

1. Sign up / log in at <https://cloud.mongodb.com>.
2. **Create a free cluster**: *Build a Database* → **M0 (Free)** → pick a cloud provider
   and the region closest to you → *Create*.
3. **Database user** (Security → *Database Access* → *Add New Database User*):
   - Authentication: *Password*.
   - Username: e.g. `ironsteel` — Password: click *Autogenerate* and **copy it**.
   - Role: *Read and write to any database*. Save.
4. **Network access** (Security → *Network Access* → *Add IP Address*):
   - Choose **Allow Access from Anywhere** (`0.0.0.0/0`). Railway uses dynamic IPs, so
     this is required. (The DB is still protected by the username/password.)
5. **Connection string** (Database → *Connect* → *Drivers*):
   - Copy the URI. It looks like:
     ```
     mongodb+srv://ironsteel:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
     ```
   - Replace `<password>` with the password from step 3, and add the database name
     `iron_steel_db` right before the `?`:
     ```
     mongodb+srv://ironsteel:YOURPASSWORD@cluster0.xxxxx.mongodb.net/iron_steel_db?retryWrites=true&w=majority
     ```
   - Keep this string — it is your `MONGO_URI`.

---

## 2. Push to GitHub

A local git repo has already been initialized and committed for you. Create an **empty**
repo on GitHub (no README/gitignore), then push:

```bash
cd c:\Abhishek\iron-steel-app
git remote add origin https://github.com/ShailenderGoyal/iron-steel-app.git
git branch -M main
git push -u origin main
```

> `node_modules` and `.env` are gitignored, so no dependencies or secrets are pushed.

---

## 3. Railway

1. Sign up / log in at <https://railway.app> (use *Login with GitHub*).
2. **New Project** → **Deploy from GitHub repo** → authorize Railway to access your
   repos → select `iron-steel-app`.
3. Railway detects the `Dockerfile` and `railway.json` automatically and starts building.
4. **Set environment variables** — open the service → *Variables* → add:

   | Variable | Value |
   |---|---|
   | `MONGO_URI` | your Atlas connection string from step 1 |
   | `JWT_SECRET` | a long random string (see below) |
   | `NODE_ENV` | `production` |
   | `SEED_ON_START` | `true`  *(only for the first deploy — see step 6)* |

   Generate a strong `JWT_SECRET` locally with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   > Do **not** set `PORT` — Railway injects it automatically and the server reads it.

5. **Generate a public URL**: service → *Settings* → *Networking* → *Generate Domain*.
   Railway redeploys with the variables; open the generated `*.up.railway.app` URL.

6. **Seed the database (first deploy only):** because `SEED_ON_START=true`, the first
   boot creates the 3 default users, 6 machines, and default settings. After the app
   loads and you can log in, **delete the `SEED_ON_START` variable** (or set it to
   `false`) so it does not re-run on every restart. Seeding is idempotent, so a stray
   extra run is harmless, but it is cleaner to remove it.

   *Alternative (no env var):* run the seed once from your machine against Atlas:
   ```bash
   cd backend
   # temporarily put the Atlas MONGO_URI in backend/.env, then:
   npm run seed
   ```

---

## 4. First login & lock it down

Default logins created by the seed:

| Username | Password | Role |
|---|---|---|
| owner1 | IronBiz@2024 | Owner |
| owner2 | IronBiz@2024 | Owner |
| supervisor | Super@2024 | Supervisor |

**Immediately** log in as `owner1` and, in *Settings → Users*, reset every password.
These defaults are public (they are in the source), so treat them as temporary.

---

## 5. Shipping future changes

With the GitHub → Railway connection, deploying an update is just:

```bash
git add -A
git commit -m "your change"
git push
```

Railway rebuilds and redeploys automatically on every push to `main`.

---

## Troubleshooting

- **Build fails** — check the Railway *Deployments → Build Logs*. Most issues are a
  missing/typo'd env var.
- **App loads but login fails / spins** — almost always `MONGO_URI` is wrong or Atlas
  *Network Access* does not allow `0.0.0.0/0`. Check *Deploy Logs* for
  `MongoDB connection error`.
- **Health check** — Railway pings `/api/health`; it should return `{"status":"ok"}`.
- **"Not found" on refresh of a sub-page** — should not happen (SPA fallback is
  configured), but if it does, confirm `NODE_ENV=production` is set.
