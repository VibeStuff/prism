# Prism Backend

A modular, plugin-based backend built with **Fastify + TypeScript**, featuring a hot-pluggable module system, persistent job queues, realtime notifications, and a timer-triggered event pipeline.

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript |
| Framework | Fastify |
| Database | PostgreSQL 16 via Prisma |
| Queue / Jobs | BullMQ (backed by Redis) |
| Realtime | Socket.io |
| Auth | JWT (via @fastify/jwt) |
| Timers | TimerService → BullMQ |
| Container | Docker + Docker Compose |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Node.js 20+ (for local dev without Docker)
- `npm` or `pnpm`

---

## Quick Start (Docker)

```bash
# 1. Clone and enter the backend directory
cd backend

# 2. Copy environment variables
cp .env.example .env
# Edit .env if needed (defaults work with docker-compose out of the box)

# 3. Start all services
docker compose up -d

# 4. Run Prisma migrations (first time only)
docker compose exec api npx prisma migrate dev --name init

# 5. Check health
curl http://localhost:3000/health
```

Services available:

| Service | URL |
|---|---|
| API | http://localhost:3000 |
| Bull Board (job monitor) | http://localhost:3001 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

---

## Local Development (without Docker)

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Start Postgres + Redis (adjust connection strings in .env)
# Then run:
npm run dev
```

---

## Environment Variables

See [`.env.example`](.env.example) for all available variables.

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Sets env mode |
| `PORT` | `3000` | HTTP server port |
| `JWT_SECRET` | `dev-secret-...` | JWT signing secret |
| `DATABASE_URL` | *(docker default)* | Prisma connection string |
| `REDIS_HOST` | `redis` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |

---

## Authentication

All routes require a valid JWT in the `Authorization: Bearer <token>` header.  

**Public routes** (no JWT needed): `GET /health`

**Dev-only token** (only active when `NODE_ENV=development`):
```bash
curl http://localhost:3000/dev/token
# Returns: { "token": "..." }
export TOKEN=<paste token here>
```

---

## API Routes

### Core

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | ❌ | DB + Redis status |
| `GET` | `/dev/token` | ❌ (dev only) | Get a signed JWT for testing |

### Time Module

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/time/now` | ✅ | Current server time |
| `GET` | `/time/convert?datetime=&userId=` | ✅ | Convert datetime to user's timezone |
| `POST` | `/time/trigger` | ✅ | Schedule a timer-triggered action |

#### POST /time/trigger — Timer Actions

Schedule any action to fire after a delay:

```bash
# Trigger a notification after 5 seconds
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "welcome-notification",
    "delayMs": 5000,
    "action": {
      "type": "notify",
      "payload": { "userId": "user-id", "title": "Hello!", "body": "Timer fired." }
    }
  }' \
  http://localhost:3000/time/trigger

# Emit an EventBus event after 2 seconds
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "bus-event",
    "delayMs": 2000,
    "action": { "type": "event", "event": "notify", "payload": { "userId": "1", "title": "Bus!", "body": "From timer." } }
  }' \
  http://localhost:3000/time/trigger

# Send a message to a named channel after 3 seconds
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "channel-msg",
    "delayMs": 3000,
    "action": { "type": "message", "channel": "alerts", "payload": { "text": "Hello channel!" } }
  }' \
  http://localhost:3000/time/trigger
```

### Notifications Module

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/notifications/:userId` | ✅ | Notification history (paginated) |
| `PATCH` | `/notifications/:notificationId/read` | ✅ | Mark notification as read |
| `DELETE` | `/notifications/:jobId` | ✅ | Cancel scheduled notification |

---

## Module System

Modules live in `src/modules/<name>/index.ts` and must export a default implementing `AppModule`:

```typescript
import type { AppModule } from '../../shared/types/module'

const MyModule: AppModule = {
  name: 'my-module',
  version: '1.0.0',
  async register(server, services) {
    server.get('/my-route', async () => ({ hello: 'world' }))

    // Schedule a timer-triggered notification
    await services.timer.after('daily-digest', 86_400_000, {
      type: 'notify',
      payload: { userId: 'user-id', title: 'Daily Digest', body: 'Your summary.' }
    })

    // Emit an event to other modules
    services.events.emit('my-module:initialized', { at: services.time.now().toISO() })
  }
}

export default MyModule
```

The plugin loader automatically discovers and registers new modules on startup — no manual wiring required.

---

## Timer-Triggered Action Types

| `type` | What happens |
|---|---|
| `notify` | Calls `NotificationService.send()` → saves to DB + Socket.io push |
| `event` | Calls `EventBus.emit(event, payload)` → any subscribed module reacts |
| `message` | Calls `EventBus.emit("msg:<channel>", payload)` → namespaced channel |

---

## CoreServices Interface

Every module receives the full `CoreServices` object:

```typescript
interface CoreServices {
  time: TimeService       // Luxon date/time utilities
  notify: NotificationService  // Send / schedule notifications
  scheduler: Scheduler    // Raw BullMQ job scheduling
  timer: TimerService     // High-level timer → action routing
  events: EventBus        // Internal pub/sub (inter-module comms)
  db: PrismaClient        // Direct Prisma access
}
```

---

## Project Structure

```
backend/
├── src/
│   ├── core/
│   │   ├── server.ts           # Fastify + Socket.io + JWT + plugin loader
│   │   ├── plugin-loader.ts    # Auto-discovers and registers modules
│   │   └── services/
│   │       ├── index.ts        # CoreServices singleton builder
│   │       ├── db.ts           # Prisma singleton
│   │       ├── time.ts         # TimeService (Luxon)
│   │       ├── event-bus.ts    # EventBus (Node EventEmitter)
│   │       ├── scheduler.ts    # Scheduler (BullMQ)
│   │       ├── timer.ts        # TimerService (action routing)
│   │       └── notifications.ts # NotificationService
│   ├── modules/
│   │   ├── time/index.ts       # /time/* routes + POST /time/trigger
│   │   └── notifications/index.ts  # /notifications/* routes
│   └── shared/
│       └── types/module.ts     # AppModule, CoreServices, TimerAction types
├── prisma/
│   └── schema.prisma
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── README.md
```
