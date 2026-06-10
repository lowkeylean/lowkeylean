# GHJ Defect Manager

A mobile-first defect management web app for tracking facility defects from
report to completion.

## Features

- **Reporting form** — authorized users (access-code gated) report a defect,
  pick a predefined segment, and upload exactly 1 "before" photo.
- **Worker view** — a list of active defects. Tapping a task moves it to
  *In Progress*; the worker then uploads an "after" photo, types remarks, and
  marks it *Completed*.
- **Dashboard** — Total Defects Reported, Total Defects Completed, and a
  calculated Completion %.

## Tech stack

- Node.js (>= 22.13) with Express
- SQLite via Node's built-in `node:sqlite` module (no native compilation)
- Multer for photo uploads (stored in `uploads/`)
- Vanilla HTML/CSS/JS frontend, mobile-first

## Database schema

| Field              | Type    | Notes                                          |
| ------------------ | ------- | ---------------------------------------------- |
| id                 | INTEGER | Primary key, autoincrement                     |
| segment            | TEXT    | Public Area, Rooms, Lobby, Kitchen             |
| status             | TEXT    | Reported, In Progress, Completed               |
| before_picture_url | TEXT    | Required at creation                           |
| after_picture_url  | TEXT    | Set on completion                              |
| remarks            | TEXT    | Set on completion                              |
| created_at         | TEXT    | ISO-8601 UTC, defaults to now                  |

## Run it

```bash
npm install
npm start
# open http://localhost:3000
```

### Configuration (environment variables)

| Variable      | Default      | Purpose                                |
| ------------- | ------------ | -------------------------------------- |
| `PORT`        | `3000`       | HTTP port                              |
| `ACCESS_CODE` | `1234`       | Access code required to report defects |
| `DB_PATH`     | `defects.db` | SQLite database file location          |

## API

| Method | Path                      | Auth | Description                                  |
| ------ | ------------------------- | ---- | -------------------------------------------- |
| POST   | `/api/auth/check`         | ✅   | Validate access code                         |
| POST   | `/api/defects`            | ✅   | Report defect (`segment` + 1 `before` photo) |
| GET    | `/api/defects`            | —    | List defects (`?status=active` for open)     |
| POST   | `/api/defects/:id/start`  | —    | Move a defect to In Progress                 |
| POST   | `/api/defects/:id/complete` | —  | Complete (`after` photo + `remarks`)         |
| GET    | `/api/metrics`            | —    | Dashboard totals and completion %            |
| GET    | `/api/segments`           | —    | Predefined segment list                      |

Auth is a shared access code sent as the `x-access-code` header.
