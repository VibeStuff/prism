<div align="center">

<!-- Hero Banner -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://capsule-render.vercel.app/api?type=waving&color=0:6366f1,50:8b5cf6,100:a78bfa&height=220&section=header&text=Prism&fontSize=80&fontColor=ffffff&fontAlignY=35&desc=真正屬於你的模組化自架工具&descSize=18&descAlignY=55&descColor=e0e7ff&animation=fadeIn">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:6366f1,50:8b5cf6,100:a78bfa&height=220&section=header&text=Prism&fontSize=80&fontColor=ffffff&fontAlignY=35&desc=真正屬於你的模組化自架工具&descSize=18&descAlignY=55&descColor=e0e7ff&animation=fadeIn" width="100%" alt="Prism">
</picture>

<br>

**丟進一個資料夾，就有一個頁面。就這麼簡單。**

[![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?style=flat-square&logo=fastify&logoColor=white)](https://fastify.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

**[English](README.md)** | **繁體中文**

</div>

<br>

## 為什麼選擇 Prism？

Monday.com、Notion、Linear、Airtable 這些工具很強大——但它們臃腫、昂貴，而且是為別人的工作流程打造的。

使用 Prism，**你擁有整個技術棧**。按照你想要的方式撰寫 UI，丟進資料夾，它就上線了。花一個下午隨手寫一個自訂專案追蹤器、個人 CRM 或習慣追蹤器，然後自己運行——不用訂閱、不被供應商綁定。

<br>

## 運作原理

每個頁面都是一個**模組**——一個獨立的資料夾，伺服器會在啟動時自動探索。不需要註冊，不需要修改設定。

```
src/modules/
│
├── 📊 dashboard/        → yoursite.com/dashboard
│   ├── index.ts         → 後端路由 + 邏輯
│   └── public/          → HTML、CSS、JS 自動提供
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

> **就是這個模式。** 資料夾名稱就是路由。靜態檔案自動提供。API 自動隔離。完成。

<br>

## 快速開始

### Docker（推薦）

```bash
git clone https://github.com/AnthonyChen05/prism.git
cd prism/backend

cp .env.example .env
docker compose up -d

# 首次使用——執行資料庫遷移
docker compose exec api npx prisma migrate dev --name init
```

然後開啟 **http://localhost:3000**

### 本地開發

需要在本機運行 PostgreSQL 和 Redis。

```bash
cd backend
npm install
cp .env.example .env        # 然後更新 DATABASE_URL 和 REDIS_HOST

npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

<br>

## 建立模組

模組只需要一個檔案：`src/modules/<name>/index.ts`

```typescript
import type { AppModule } from '../../shared/types/module'

const MyModule: AppModule = {
  name: 'my-module',
  version: '1.0.0',

  async register(server, services, prefix) {
    // prefix = "/my-module" — 由資料夾名稱推導

    // 提供頁面
    server.get(prefix, { config: { public: true } } as never, async (_req, reply) => {
      reply.type('text/html').send('<h1>來自我的模組的問候</h1>')
    })

    // 新增 API 路由
    server.get(`${prefix}/api/data`, { config: { public: true } } as never, async () => {
      return { items: await services.db.yourModel.findMany() }
    })
  }
}

export default MyModule
```

在旁邊新增一個 `public/` 資料夾，你的靜態檔案就會在 `/<name>-assets/` 下提供。

**在 HTML 中** — 使用 `{{ASSETS}}` 作為資源路徑（在提供時替換）：

```html
<link rel="stylesheet" href="{{ASSETS}}/style.css" />
<script src="{{ASSETS}}/app.js"></script>
```

**在 JS 中** — 使用 `window.location.pathname` 作為 API 基礎路徑：

```js
const API = window.location.pathname.replace(/\/$/, '')
const data = await fetch(API + '/api/data').then(r => r.json())
```

<br>

## 內建功能

### 金融儀表板

AI 驅動的即時市場情報儀表板：

| 功能 | 說明 |
|:--|:--|
| **即時行情** | 標普 500、道瓊、納斯達克、羅素 2000、VIX，附走勢圖 |
| **自選股** | 追蹤任何標的——即時價格更新，一鍵新增/移除 |
| **板塊表現** | 全部 11 個 GICS 板塊依當日漲跌排序 |
| **市場新聞** | Google 新聞商業 RSS，依時間排序，支援搜尋篩選 |
| **漲跌幅排行** | 當日主要股票漲幅榜與跌幅榜 |
| **AI 分析** | Claude 驅動的市場分析，Markdown 排版，可收合側邊抽屜 |
| **AI 對話** | 具記憶功能的對話助手——管理自選股、篩選新聞、搜尋網路 |
| **雙語支援** | 完整英文與繁體中文介面 |

### AI 儀表板

可透過 REST API 或 LLM 代理程式控制的可程式化小工具儀表板：

| 功能 | 說明 |
|:--|:--|
| **11 種小工具** | 統計、列表、Markdown、HTML、圖表、進度條、表格、圖片、倒數、鍵值對、嵌入 |
| **新聞動態** | 可置頂、分類的公告，支援 Markdown |
| **多分頁** | 將小工具整理到不同命名分頁 |
| **推送 API** | 一次原子性呼叫批次更新小工具、新聞和元資料 |

### 內建儀表板

預設首頁——個人主畫面，包含：

| 小工具 | 說明 |
|:--|:--|
| **快速連結** | 用自訂圖示和顏色收藏常用網站 |
| **待辦清單** | 簡單的持久化任務，支援拖曳排序 |
| **Google 日曆** | 用一個 URL 嵌入你的日曆 |
| **RSS 訂閱** | 訂閱任何 RSS/Atom 來源（伺服器端代理，無 CORS 問題） |
| **自訂背景** | 上傳你自己的圖片，儲存在本地 |

### 核心服務

每個模組都能透過依賴注入取得完整的服務層：

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
│  │          透過 Redis 的持久化工作佇列               │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

<details>
<summary><strong>TypeScript 介面</strong></summary>

```typescript
interface CoreServices {
  db: PrismaClient            // 透過 Prisma 操作 PostgreSQL — 查詢任何資料
  time: TimeService           // 時區感知的日期/時間（Luxon）
  notify: NotificationService // 透過 Socket.io 發送即時通知
  timer: TimerService         // 排程延遲觸發的動作
  scheduler: Scheduler        // 原生 BullMQ 工作排程
  events: EventBus            // 模組間的發布/訂閱
}
```

</details>

### 計時器動作

排程任何延遲執行的事件：

```typescript
// 24 小時後通知
await services.timer.after('daily-reminder', 86_400_000, {
  type: 'notify',
  payload: { userId: 'user-1', title: '每日簽到', body: '你的任務進展如何？' }
})

// 5 秒後向其他模組發送事件
await services.timer.after('sync-trigger', 5000, {
  type: 'event',
  event: 'crm:sync',
  payload: { source: 'scheduler' }
})
```

<br>

## 架構

```
                    ┌──────────────────────┐
                    │     客戶端 / 瀏覽器   │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   Fastify + Socket.io │
                    │      (Port 3000)      │
                    └──────────┬───────────┘
                               │
               ┌───────────────┼───────────────┐
               │               │               │
  ┌────────┬──────────┬────────┬────────┬──────────┐
  │        │          │        │        │          │
┌─▼──────┐┌▼────────┐┌▼──────┐┌▼──────┐┌▼────────┐
│金融儀表││AI 儀表板││儀表板 ││ 時間  ││  通知   │
│  板    ││        ││ 模組  ││ 模組  ││  模組   │
└─┬──────┘└┬────────┘└┬──────┘└┬──────┘└┬────────┘
  │        │          │        │        │
  └────────┴──────────┴────────┴────────┘
                               │
                    ┌──────────▼───────────┐
                    │      核心服務        │
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

## 技術棧

| 層級 | 技術 | 用途 |
|:--|:--|:--|
| **執行環境** | Node.js 20 + TypeScript | 伺服器端邏輯 |
| **框架** | Fastify 5 | HTTP 伺服器 + 路由 |
| **資料庫** | PostgreSQL 16 + Prisma | 持久化儲存 + ORM |
| **佇列** | BullMQ + Redis 7 | 背景工作 + 排程 |
| **即時通訊** | Socket.io | 即時推播通知 |
| **認證** | JWT | 路由保護 |
| **容器** | Docker + Docker Compose | 一鍵部署 |

<br>

## 設定

| 變數 | 預設值 | 說明 |
|:--|:--|:--|
| `PORT` | `3000` | 伺服器埠號 |
| `LANDING_MODULE` | `dashboard` | 將 `/` 重新導向至的模組 |
| `DATABASE_URL` | *（見 .env.example）* | PostgreSQL 連線字串 |
| `REDIS_HOST` | `redis` | Redis 主機名稱 |
| `JWT_SECRET` | *（請修改）* | JWT 簽名密鑰 |
| `JWT_EXPIRES_IN` | `15m` | 存取權杖有效期 |
| `ANTHROPIC_API_KEY` | *（空）* | Claude AI 分析與對話功能的 API 金鑰 |
| `FINANCIAL_DASHBOARD_MODEL` | `claude-sonnet-4-6` | 金融 AI 功能使用的 Claude 模型 |
| `SEARXNG_URL` | *（空）* | SearXNG 實例 URL，用於網路搜尋（如 `http://localhost:8888`） |
| `AI_DASHBOARD_TOKEN` | *（請修改）* | AI 儀表板推送 API 認證令牌 |

變更首頁：

```env
LANDING_MODULE=kanban
```

<br>

## 模組靈感

你可以在一個週末隨手寫出來的東西，而不用每月付費訂閱：

| 自己做 | 取代付費服務 |
|:--|:--|
| 看板 | Trello / Linear |
| 專案追蹤器 | Monday.com / Asana |
| 個人 CRM | HubSpot |
| 習慣追蹤器 | Streaks / Habitica |
| 閱讀清單 | Pocket / Instapaper |
| 預算追蹤器 | Mint / YNAB |
| 筆記工具 | Notion |
| 時間追蹤器 | Toggl |
| 連結頁面 | Linktree |
| 狀態頁面 | Statuspage.io |

> 每一個都只是一個資料夾，裡面放 HTML 檔案和一些 API 路由。

<br>

## 專案結構

```
prism/
├── backend/
│   ├── src/
│   │   ├── core/
│   │   │   ├── server.ts              # 伺服器啟動、認證、Socket.io
│   │   │   ├── plugin-loader.ts       # 自動探索模組
│   │   │   └── services/              # db、time、notify、timer、scheduler、events
│   │   ├── modules/
│   │   │   ├── financial-dashboard/   # 即時行情 + AI 分析
│   │   │   ├── ai-dashboard/          # 可程式化小工具儀表板
│   │   │   ├── dashboard/             # 內建個人儀表板
│   │   │   ├── time/                  # 時間 + 計時器 API
│   │   │   └── notifications/         # 通知歷史 + 推播
│   │   └── shared/
│   │       └── types/module.ts        # AppModule、CoreServices、TimerAction
│   ├── prisma/schema.prisma
│   ├── docker-compose.yml
│   ├── Dockerfile
│   └── .env.example
└── README.md
```

<br>

## 授權條款

MIT — 你想怎麼用就怎麼用。

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://capsule-render.vercel.app/api?type=waving&color=0:6366f1,50:8b5cf6,100:a78bfa&height=100&section=footer">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:6366f1,50:8b5cf6,100:a78bfa&height=100&section=footer" width="100%" alt="">
</picture>

</div>
