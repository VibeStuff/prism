<div align="center">

<!-- Hero Banner -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://capsule-render.vercel.app/api?type=waving&color=0:6366f1,50:8b5cf6,100:a78bfa&height=220&section=header&text=Prism&fontSize=80&fontColor=ffffff&fontAlignY=35&desc=Modular%20self-hosted%20tools%20you%20actually%20own&descSize=18&descAlignY=55&descColor=e0e7ff&animation=fadeIn">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:6366f1,50:8b5cf6,100:a78bfa&height=220&section=header&text=Prism&fontSize=80&fontColor=ffffff&fontAlignY=35&desc=Modular%20self-hosted%20tools%20you%20actually%20own&descSize=18&descAlignY=55&descColor=e0e7ff&animation=fadeIn" width="100%" alt="Prism">
</picture>

<br>

**Drop a folder in. Get a page. That's it.**

[![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?style=flat-square&logo=fastify&logoColor=white)](https://fastify.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

<br>

## Why Prism?

Tools like Monday.com, Notion, Linear, and Airtable are powerful — but they're bloated, expensive, and built for someone else's workflow.

With Prism, **you own the stack**. Write the UI exactly how you want it, drop it in a folder, and it's live. Vibe code a custom project tracker, a personal CRM, or a habit tracker in an afternoon and run it yourself — no subscriptions, no vendor lock-in.

<br>

## How It Works

Every page is a **module** — a self-contained folder that the server auto-discovers on startup. No registration, no config changes.

```
src/modules/
│
├── 📊 dashboard/        → yoursite.com/dashboard
│   ├── index.ts         → backend routes + logic
│   └── public/          → HTML, CSS, JS served automatically
│       ├── index.html
│       ├── app.js
│       └── style.css
│
├── 📋 kanban/           → yoursite.com/kanban
│   ├── index.ts
│   └── public/
│
└── 👥 crm/             → yoursite.com/crm
    ├── index.ts
    └── public/
```

> **That's the whole pattern.** Folder name becomes the route. Static files are served. APIs are scoped. Done.

<br>

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/AnthonyChen05/prism.git
cd prism/backend

cp .env.example .env
docker compose up -d

# First time — run migrations
docker compose exec api npx prisma migrate dev --name init
```

Then open **http://localhost:3000**

### Local Dev

Requires PostgreSQL and Redis running locally.

```bash
cd backend
npm install
cp .env.example .env        # then update DATABASE_URL and REDIS_HOST

npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

<br>

## Creating a Module

A module needs one file: `src/modules/<name>/index.ts`

```typescript
import type { AppModule } from '../../shared/types/module'

const MyModule: AppModule = {
  name: 'my-module',
  version: '1.0.0',

  async register(server, services, prefix) {
    // prefix = "/my-module" — derived from folder name

    // Serve a page
    server.get(prefix, { config: { public: true } } as never, async (_req, reply) => {
      reply.type('text/html').send('<h1>Hello from my module</h1>')
    })

    // Add API routes
    server.get(`${prefix}/api/data`, { config: { public: true } } as never, async () => {
      return { items: await services.db.yourModel.findMany() }
    })
  }
}

export default MyModule
```

Add a `public/` folder next to it and your static files are served at `/<name>-assets/`.

**In your HTML** — use `{{ASSETS}}` for asset paths (replaced at serve time):

```html
<link rel="stylesheet" href="{{ASSETS}}/style.css" />
<script src="{{ASSETS}}/app.js"></script>
```

**In your JS** — use `window.location.pathname` as the API base:

```js
const API = window.location.pathname.replace(/\/$/, '')
const data = await fetch(API + '/api/data').then(r => r.json())
```

<br>

## What's Included

### Built-in Dashboard

The default landing page — a personal home screen with:

| Widget | Description |
|:--|:--|
| **Quick Links** | Bookmark your most-used sites with custom icons and colors |
| **To-Do List** | Simple persistent tasks with drag-to-reorder |
| **Google Calendar** | Embed your calendar with a single URL |
| **RSS Feeds** | Follow any RSS/Atom feed (server-side proxy, no CORS issues) |
| **Custom Background** | Upload your own image, stored locally |

### Core Services

Every module gets access to the full service layer via dependency injection:

```
┌─────────────────────────────────────────────────────────┐
│                     CoreServices                        │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐    │
│  │    db    │  │   time   │  │      events        │    │
│  │ (Prisma) │  │ (Luxon)  │  │    (EventBus)      │    │
│  └──────────┘  └──────────┘  └────────────────────┘    │
│                                                         │
│  ┌──────────────────┐  ┌───────────────────────────┐   │
│  │     notify       │  │         timer             │   │
│  │ (Notifications)  │  │   (Delayed Actions)       │   │
│  └──────────────────┘  └───────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │              scheduler (BullMQ)                   │  │
│  │          Persistent job queue via Redis            │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

<details>
<summary><strong>TypeScript interface</strong></summary>

```typescript
interface CoreServices {
  db: PrismaClient            // PostgreSQL via Prisma — query anything
  time: TimeService           // Timezone-aware date/time (Luxon)
  notify: NotificationService // Send real-time notifications via Socket.io
  timer: TimerService         // Schedule actions to fire after a delay
  scheduler: Scheduler        // Raw BullMQ job scheduling
  events: EventBus            // Pub/sub between modules
}
```

</details>

### Timer Actions

Schedule anything to happen after a delay:

```typescript
// Notify in 24 hours
await services.timer.after('daily-reminder', 86_400_000, {
  type: 'notify',
  payload: { userId: 'user-1', title: 'Daily check-in', body: 'How are your tasks looking?' }
})

// Emit an event to other modules in 5 seconds
await services.timer.after('sync-trigger', 5000, {
  type: 'event',
  event: 'crm:sync',
  payload: { source: 'scheduler' }
})
```

<br>

## Architecture

```
                    ┌──────────────────────┐
                    │     Client / Browser  │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   Fastify + Socket.io │
                    │      (Port 3000)      │
                    └──────────┬───────────┘
                               │
               ┌───────────────┼───────────────┐
               │               │               │
      ┌────────▼──────┐ ┌─────▼─────┐ ┌───────▼───────┐
      │   Dashboard   │ │   Time    │ │ Notifications │
      │    Module     │ │  Module   │ │    Module     │
      └────────┬──────┘ └─────┬─────┘ └───────┬───────┘
               │               │               │
               └───────────────┼───────────────┘
                               │
                    ┌──────────▼───────────┐
                    │    Core Services     │
                    │  db · time · events  │
                    │ notify · timer · sched│
                    └─────┬──────────┬─────┘
                          │          │
              ┌───────────▼──┐  ┌───▼───────────┐
              │ PostgreSQL 16│  │   Redis 7      │
              │   (Prisma)   │  │  (BullMQ)      │
              └──────────────┘  └────────────────┘
```

<br>

## Tech Stack

| Layer | Technology | Purpose |
|:--|:--|:--|
| **Runtime** | Node.js 20 + TypeScript | Server-side logic |
| **Framework** | Fastify 5 | HTTP server + routing |
| **Database** | PostgreSQL 16 + Prisma | Persistent storage + ORM |
| **Queue** | BullMQ + Redis 7 | Background jobs + scheduling |
| **Realtime** | Socket.io | Live push notifications |
| **Auth** | JWT | Route protection |
| **Container** | Docker + Docker Compose | One-command deployment |

<br>

## Configuration

| Variable | Default | Description |
|:--|:--|:--|
| `PORT` | `3000` | Server port |
| `LANDING_MODULE` | `dashboard` | Module to redirect `/` to |
| `DATABASE_URL` | *(see .env.example)* | PostgreSQL connection string |
| `REDIS_HOST` | `redis` | Redis hostname |
| `JWT_SECRET` | *(change this)* | JWT signing secret |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |

To change the landing page:

```env
LANDING_MODULE=kanban
```

<br>

## Module Ideas

Things people pay monthly subscriptions for that you can vibe code in a weekend:

| Build This | Instead of Paying For |
|:--|:--|
| Kanban board | Trello / Linear |
| Project tracker | Monday.com / Asana |
| Personal CRM | HubSpot |
| Habit tracker | Streaks / Habitica |
| Reading list | Pocket / Instapaper |
| Budget tracker | Mint / YNAB |
| Note-taking | Notion |
| Time tracker | Toggl |
| Link board | Linktree |
| Status page | Statuspage.io |

> Every one of these is a folder with an HTML file and some API routes.

<br>

## Project Structure

```
prism/
├── backend/
│   ├── src/
│   │   ├── core/
│   │   │   ├── server.ts              # Server bootstrap, auth, Socket.io
│   │   │   ├── plugin-loader.ts       # Auto-discovers modules
│   │   │   └── services/              # db, time, notify, timer, scheduler, events
│   │   ├── modules/
│   │   │   ├── dashboard/             # Built-in personal dashboard
│   │   │   ├── time/                  # Time + timer API
│   │   │   └── notifications/         # Notification history + push
│   │   └── shared/
│   │       └── types/module.ts        # AppModule, CoreServices, TimerAction
│   ├── prisma/schema.prisma
│   ├── docker-compose.yml
│   ├── Dockerfile
│   └── .env.example
└── README.md
```

<br>

## License

MIT — do whatever you want with it.

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://capsule-render.vercel.app/api?type=waving&color=0:6366f1,50:8b5cf6,100:a78bfa&height=100&section=footer">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:6366f1,50:8b5cf6,100:a78bfa&height=100&section=footer" width="100%" alt="">
</picture>

</div>
