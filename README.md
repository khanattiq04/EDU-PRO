# Danistan Network

Student learning and quiz platform: a Vite + React single-page app, an Express API, and a MySQL database.

## Stack

| Part     | Technology                    | Folder      |
| -------- | ----------------------------- | ----------- |
| Frontend | Vite + React (SPA)            | `frontend/` |
| Backend  | Node.js + Express 5           | `backend/`  |
| Database | MySQL 8 / MariaDB 10.4+       | `database/` |

## Structure

```
.
├── backend/            Express API
│   ├── scripts/        One-off maintenance scripts (demo seed)
│   ├── src/
│   │   ├── db.js       MySQL connection pool
│   │   ├── middleware/ Shared Express middleware
│   │   ├── routes/     HTTP endpoints, grouped by audience
│   │   ├── services/   Domain logic (auth, crypto, registration, settings, students)
│   │   └── server.js   App wiring and startup
│   └── .env.example    Environment template
├── database/           MySQL schema and optional demo data
│   ├── schema.sql      Tables
│   └── seed.sql        Optional demo quiz and study content
└── frontend/           Vite + React SPA
    └── .env.example    API base URL template
```

## Local setup

**1. Database**

```bash
mysql -u root -p -e "CREATE DATABASE danistan_network CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p danistan_network < database/schema.sql
mysql -u root -p danistan_network < database/seed.sql   # optional demo quiz
```

**2. Backend**

```bash
cd backend
cp .env.example .env      # then fill in your MySQL credentials
npm install
npm run seed:demo         # optional: creates areeba@example.com / Student123!
npm run dev               # http://localhost:4000
```

Confirm it is up: `curl http://localhost:4000/api/health` should return `{"ok":true,...}`.

**3. Frontend**

```bash
cd frontend
cp .env.example .env      # VITE_API_URL must point at the API
npm install
npm run dev
```

## Environment variables

Set in `backend/.env`:

| Variable                   | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `PORT`                     | API port (default 4000)                                        |
| `DB_HOST` `DB_PORT`         | MySQL host and port                                            |
| `DB_USER` `DB_PASSWORD`     | MySQL credentials                                              |
| `DB_NAME`                  | MySQL database name                                            |
| `DB_POOL_SIZE`             | Connection pool size (default 10)                              |
| `CORS_ORIGIN`              | Comma-separated allowed origins. Empty means allow any origin.  |
| `ADMIN_EMAIL` `ADMIN_PASSWORD` | Admin panel login                                          |
| `DANISTAN_SESSION_KEY`     | HMAC key for session tokens - change in production             |
| `DANISTAN_ENCRYPTION_KEY`  | AES key for stored CNIC values - change in production          |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Set in `frontend/.env` (build time only, baked into the bundle):

| Variable       | Purpose                                  |
| -------------- | ---------------------------------------- |
| `VITE_API_URL` | Base URL of the API, no trailing slash   |

## Deploying to Hostinger

The panel flow used here is **Websites -> Add Website -> Node.js web app**, available on
Business Web Hosting and Cloud plans. VPS plans run Node.js but need manual CLI setup instead.

**1. Create the database**

In hPanel open **Databases -> MySQL Databases** and create a database plus a user.
Hostinger prefixes both with your account id, for example `u123456789_danistan` and
`u123456789_admin`. Note the generated password.

**2. Import the schema**

Open **phpMyAdmin** from the database screen, select your new database, then use
**Import** to upload `database/schema.sql`. Repeat with `database/seed.sql` if you want
the demo quiz.

**3. Deploy the backend**

1. Add a website, choose **Node.js web app**, and pick **Import Git repository**.
2. Select this repository and set **Root directory** to `backend`.
3. Set **Framework preset** to `Express`, **Node.js version** to `22`, and leave
   **Build command** and **Output directory** empty.
4. Set **Entry file** to `src/server.js`.
5. Add the environment variables from the table above. At minimum:
   `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `CORS_ORIGIN`,
   `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DANISTAN_SESSION_KEY`, `DANISTAN_ENCRYPTION_KEY`.
6. Deploy, then check `https://<your-api-domain>/api/health`.

**4. Deploy the frontend**

1. Add a second **Node.js web app** for the site domain, pointing at the same repository
   with **Root directory** set to `frontend`.
2. Set **Framework preset** to `Vite`, **Build command** to `build`, and
   **Output directory** to `dist`.
3. Add `VITE_API_URL=https://<your-api-domain>` as an environment variable so the value is
   baked into the bundle at build time.
4. Deploy.

Pushing to the connected branch rebuilds both apps automatically.

### Notes

- Only the live build and one previous build are kept on the server, so never store
  runtime data inside the app directory - it is replaced on every deploy.
- `CORS_ORIGIN` should list your public site origin, for example
  `https://www.desertsafaridunes.com,https://desertsafaridunes.com`.
- Admin credentials fall back to `admin@danistan.network` / `Admin123!` when the
  environment variables are missing. Always set them in production.
