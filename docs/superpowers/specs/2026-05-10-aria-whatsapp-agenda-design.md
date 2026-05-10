# Aria — WhatsApp AI Agenda Service

## Overview

Aria is a standalone WhatsApp-based AI agenda service sold as a SaaS product. Customers interact with Aria via 1-on-1 WhatsApp chat. The service manages reminders, recurring reminders, a daily summary, and free-form memory storage. Aria is built as a new independent Node.js service (`aria/`) that adapts core modules from Venvis, keeping Venvis untouched.

## Architecture

### Stack
- **Runtime:** Node.js (ESM)
- **WhatsApp:** `@whiskeysockets/baileys` — unofficial library, QR-based session, no Meta approval needed
- **AI:** Claude Haiku (`claude-haiku-4-5-20251001`) via Anthropic SDK — lowest cost per message
- **Database:** SQLite via `better-sqlite3` — multi-tenant, isolated per user
- **Deploy:** Docker container on existing Easypanel server alongside Venvis

### Folder structure
```
aria/
├── server/
│   ├── index.mjs        ← entry point, wires all modules
│   ├── whatsapp.mjs     ← Baileys connection + message routing
│   ├── brain.mjs        ← Claude Haiku + tool definitions
│   ├── memory.mjs       ← per-user free memory (adapted from Venvis)
│   ├── reminders.mjs    ← one-time + recurring reminders (adapted from Venvis)
│   ├── users.mjs        ← user registration, activation codes
│   └── db.mjs           ← SQLite schema + queries
├── scripts/
│   └── generate-code.mjs  ← admin CLI to generate activation codes
├── Dockerfile
├── .env.example
└── package.json
```

## User Management & Activation

### Flow
1. Customer scans a QR code (or taps `wa.me/BOT_NUMBER`) — opens WhatsApp chat with Aria
2. Aria replies asking for an activation code
3. Admin generates a code manually via `node scripts/generate-code.mjs`
4. Customer sends the code → Aria validates → account activated
5. Aria asks for customer's name → onboarding complete

### Activation codes
- Format: `ARIA-XXXX` (4 random alphanumeric chars)
- Expire after 48 hours
- Single use

### Admin commands (sent from `ADMIN_PHONE` to the bot)
- `/generar-codigo` — generates a new activation code
- `/listar-usuarios` — lists active users
- `/desactivar <phone>` — deactivates a user

### Database schema — `users` table
| Column | Type | Notes |
|--------|------|-------|
| `phone` | TEXT PRIMARY KEY | WhatsApp number (e.g. `5491112345678`) |
| `name` | TEXT | Set during onboarding |
| `active` | INTEGER | 0 = pending, 1 = active |
| `activation_code` | TEXT | Null once used |
| `code_expires_at` | TEXT | ISO datetime |
| `timezone` | TEXT | Default: `America/Argentina/Buenos_Aires` |
| `created_at` | TEXT | ISO datetime |

## AI Brain

### Model
Claude Haiku — cheapest Anthropic model, sufficient for agenda tasks. Estimated cost: $0.50–1.00 USD/user/month at ~500 messages/month.

### Tools available to Claude
| Tool | Description |
|------|-------------|
| `save_reminder` | Save a one-time reminder with date + time |
| `save_recurring_reminder` | Save a repeating reminder (daily, weekly, custom) |
| `save_memory` | Store a free-form key/value memory entry |
| `get_memory` | Retrieve stored memory entries |
| `list_reminders` | List upcoming active reminders |
| `delete_reminder` | Delete a reminder by ID |

### System prompt
Aria speaks in natural, casual Spanish. Max 2-3 sentences per response. No markdown. Uses tools silently — confirms actions briefly. Always addresses the user by name once known.

### Message history
Last 10 messages per user kept in context for continuity.

## Reminders

### One-time reminders
Stored with `remind_at` (ISO datetime). A background tick runs every minute, queries reminders due `<= now`, sends WhatsApp message, marks done.

### Recurring reminders
Stored with a `recurrence` field: `daily`, `weekly:MON`, `weekly:FRI`, etc. After firing, next `remind_at` is computed and updated instead of marking done.

### Daily summary (8:00 AM)
Automatic message sent each morning listing the day's reminders. Format:
```
Buenos días [Name] ☀️
Hoy tenés:
• 15:00 — Dentista
• 20:00 — Cena con Lucas
Que tengas un gran día!
```
If no reminders: "Buenos días [Name]! No tenés nada agendado para hoy. 🗓"

### Database schema — `reminders` table
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY | |
| `phone` | TEXT | FK → users.phone |
| `text` | TEXT | Reminder description |
| `remind_at` | TEXT | ISO datetime of next fire |
| `recurrence` | TEXT | Null = one-time; `daily`, `weekly:MON`, etc. |
| `done` | INTEGER | 1 = completed (one-time only) |
| `created_at` | TEXT | |

## Memory

Free-form key/value store per user. Users say things like "mi DNI es 38.123.456" and Aria stores it. Later "cuál es mi DNI?" retrieves it. Claude decides when to call `save_memory` or `get_memory` based on context.

### Database schema — `memories` table
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY | |
| `phone` | TEXT | FK → users.phone |
| `key` | TEXT | Short label (e.g. "DNI") |
| `value` | TEXT | Stored content |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

## Deployment

### Environment variables
```
ANTHROPIC_API_KEY=
ADMIN_PHONE=549XXXXXXXXXX
TZ=America/Argentina/Buenos_Aires
```

### Docker
Single container `aria` on Easypanel. Persistent volume `aria_data` for SQLite + Baileys session files. No public port needed — only outbound WhatsApp connection via Baileys.

### Baileys session
QR scanned once by admin at first deploy. Session persisted to disk. If session expires, admin re-scans QR.

## V1 Scope

| Feature | Included |
|---------|----------|
| WhatsApp 1-on-1 chat | ✅ |
| Activation code system | ✅ |
| Natural conversation (Spanish) | ✅ |
| One-time reminders | ✅ |
| Recurring reminders | ✅ |
| Daily summary at 8am | ✅ |
| Free-form memory storage | ✅ |
| Admin commands via WhatsApp | ✅ |
| Voice message support | ❌ V2 |
| Web dashboard | ❌ V2 |
| Automated payments | ❌ V2 |
| Google Calendar integration | ❌ V2 |

## Scalability

SQLite handles up to ~500 concurrent active users comfortably. Migration to PostgreSQL deferred to V2 if needed.
