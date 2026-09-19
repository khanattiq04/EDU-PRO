# Danistan Network API

Express 5 API backed by MySQL.

## Commands

```bash
npm install       # install dependencies
npm run dev       # start with file watching
npm start         # start for production
npm run seed:demo # create the demo student, membership and welcome notification
```

## Layout

- `src/server.js` - app wiring, middleware, startup
- `src/db.js` - MySQL pool and query helpers
- `src/middleware/` - shared Express middleware
- `src/routes/` - endpoints grouped by audience (public, auth, quizzes, student, admin)
- `src/services/` - domain logic
- `scripts/` - one-off maintenance scripts

## Endpoints

Public: `GET /api/health`, `GET /api/public`, `GET /api/plans`

Auth: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/admin`

Student (Bearer token, role `student`): `/api/me` and its sub-routes for dashboard,
payments, content, notifications and results.

Quiz (Bearer token): `GET /api/quizzes`, plus `/api/attempts/start`,
`/api/attempts/:id/answer`, `/api/attempts/:id/warning`, `/api/attempts/:id/submit`.

Admin (Bearer token, role `admin`): `/api/admin/*` for stats, students, quizzes,
questions, payments, results, notifications, content and settings.

## Configuration

Copy `.env.example` to `.env` and fill it in. The database schema lives in
`../database/schema.sql` and must be imported before the first start; the API refuses to
boot with a clear message if it cannot reach MySQL.
