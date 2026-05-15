# Aria Web App — Design Spec

## Overview

Aria Web es la capa visual del producto Aria. Los clientes que contratan Aria obtienen acceso tanto al bot de WhatsApp como a esta web app. El bot maneja toda la interacción conversacional (recordatorios, registro de datos, seguimiento); la web app muestra lo que WhatsApp no puede mostrar bien: rutinas visuales, imágenes de ejercicios, dashboard de módulos.

**Principio central:** cero fricción para la persona vaga. WhatsApp avisa, la web muestra exactamente qué hacer, WhatsApp cierra el loop de accountability.

---

## Arquitectura

### Stack
- **Frontend + API:** Next.js 14 (App Router) — mismo stack que orgroup-hub
- **Estilos:** Tailwind CSS
- **DB:** SQLite compartida con Aria (`/app/data/aria.db`) — volumen Docker compartido
- **Auth:** sesión por cookie (JWT firmado), OTP enviado por Aria via WhatsApp
- **Deploy:** segundo servicio Docker en Easypanel, junto a `aria/`

### Estructura en el repo
```
aria-web/
├── app/
│   ├── page.tsx                  ← login
│   ├── dashboard/
│   │   └── page.tsx              ← módulos activos del usuario
│   ├── catalogo/
│   │   └── page.tsx              ← módulos disponibles
│   ├── rutina/
│   │   └── page.tsx              ← vista semanal
│   │   └── [id]/
│   │       └── page.tsx          ← detalle de ejercicio (param: exercise id)
│   └── api/
│       ├── auth/
│       │   ├── request-otp/route.ts
│       │   └── verify-otp/route.ts
│       └── rutina/
│           └── route.ts
├── lib/
│   ├── db.ts                     ← conexión SQLite (better-sqlite3)
│   ├── auth.ts                   ← JWT helpers
│   └── session.ts                ← cookie helpers
├── components/
│   ├── Navbar.tsx
│   ├── ModuleCard.tsx
│   └── ExerciseCard.tsx
├── Dockerfile
├── .env.example
└── package.json
```

### Relación con Aria (bot)
La web app y el bot comparten la misma DB. Para el OTP de login, la web escribe en `web_otps`; el tick de Aria (corre cada minuto) lee esa tabla y envía el código por WhatsApp. No hay llamadas HTTP entre servicios — la DB es el canal de comunicación.

---

## Autenticación

### Flujo
1. Usuario abre la web, ingresa su número de WhatsApp (formato: `549351XXXXXXX`)
2. `POST /api/auth/request-otp` — inserta OTP de 6 dígitos en `web_otps` (expira en 5 minutos)
3. El tick de Aria detecta el OTP pendiente y manda por WhatsApp: *"Tu código de acceso a Aria: 482910. Expira en 5 minutos."*
4. Usuario ingresa el código en la web
5. `POST /api/auth/verify-otp` — valida código, crea JWT firmado, setea cookie `aria_session` (httpOnly, 30 días)
6. Redirect al dashboard

### Tabla nueva: `web_otps`
```sql
CREATE TABLE IF NOT EXISTS web_otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Seguridad
- OTP expira en 5 minutos
- Máximo 3 intentos fallidos antes de invalidar el código
- Rate limit: 1 OTP por número cada 60 segundos
- JWT firmado con `JWT_SECRET` en `.env`

---

## Shell

### Login (`/`)
- Campo de número de WhatsApp
- Botón "Recibir código"
- Campo de 6 dígitos (aparece tras enviar)
- Botón "Entrar"
- Sin registro, sin contraseña

### Dashboard (`/dashboard`)
- Muestra los módulos activos del usuario (tarjetas con nombre e ícono)
- Si no tiene módulos activos → redirige a `/catalogo`
- Navbar: logo Aria, nombre del usuario, botón cerrar sesión

### Catálogo (`/catalogo`)
- Lista todos los módulos disponibles:

| Módulo | Estado |
|--------|--------|
| Rutina de ejercicios | Disponible |
| Dieta / nutrición | Próximamente |
| Finanzas | Próximamente |
| Documentos | Próximamente |
| Calendario (iPhone) | Próximamente |

- Módulos bloqueados muestran candado, sin lógica de pago (el admin activa módulos por usuario desde el panel de Aria)

---

## Módulo: Rutina de ejercicios

### Filosofía
El usuario vago no tiene excusas. Al abrir la app, ve directamente el entrenamiento de hoy. WhatsApp lo despertó, la app le muestra qué hacer y cómo, WhatsApp cierra el día.

### Pantallas

**Vista semanal (`/rutina`):**
- Abre siempre en el día actual
- Días de entrenamiento: lista de ejercicios (nombre, series × reps)
- Días de descanso: "Descanso 🛌"
- Tapping en un ejercicio → vista detalle

**Vista de ejercicio (`/rutina/[id]`):**
- Nombre y grupo muscular
- Imagen o GIF del movimiento
- Descripción de ejecución correcta (cómo hacerlo bien)
- Series y reps asignadas para el usuario

### Comportamiento de Aria (WhatsApp)
- **Mañana del día de entrenamiento** → *"Hoy toca [nombre rutina] 💪. Abrí la app para ver los ejercicios: [ARIA_WEB_URL]/rutina"*
- **Noche sin registro** (si no respondió "listo") → *"¿Entrenaste hoy? Respondé 'listo' cuando termines 🏋️"*
- El usuario registra pesos y series completadas respondiendo por chat a Aria
- Aria necesita la variable de entorno `ARIA_WEB_URL` para incluir el link en los mensajes

### Tablas nuevas en la DB

```sql
CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  muscle_group TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS routines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  difficulty TEXT CHECK(difficulty IN ('beginner','intermediate','advanced')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS routine_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  routine_id INTEGER NOT NULL,
  exercise_id INTEGER NOT NULL,
  day_of_week TEXT NOT NULL,  -- 'MON','TUE','WED','THU','FRI','SAT','SUN'
  order_index INTEGER NOT NULL,
  sets INTEGER NOT NULL,
  reps TEXT NOT NULL,         -- ej: "10-12" o "15"
  rest_seconds INTEGER,
  FOREIGN KEY (routine_id) REFERENCES routines(id),
  FOREIGN KEY (exercise_id) REFERENCES exercises(id)
);

CREATE TABLE IF NOT EXISTS user_routines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  routine_id INTEGER NOT NULL,
  active INTEGER DEFAULT 1,
  assigned_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (phone) REFERENCES users(phone),
  FOREIGN KEY (routine_id) REFERENCES routines(id)
);
```

### Carga de datos
El admin carga ejercicios y rutinas una vez via script o directamente en la DB. Los usuarios no crean ejercicios — eligen entre las plantillas disponibles.

**Dependencia en el panel de Aria:** el panel admin necesita una nueva sección "Rutinas" donde el admin pueda asignar una rutina a un usuario (insertar en `user_routines`). Sin esto el usuario no ve nada en la app. Esta sección se construye junto con el módulo.

---

## Activación de módulos

Por ahora no hay lógica de pago. El admin activa módulos por usuario editando la tabla `user_modules`:

```sql
CREATE TABLE IF NOT EXISTS user_modules (
  phone TEXT NOT NULL,
  module TEXT NOT NULL,  -- 'rutina', 'dieta', 'finanzas', etc.
  active INTEGER DEFAULT 1,
  activated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (phone, module),
  FOREIGN KEY (phone) REFERENCES users(phone)
);
```

---

## Deploy en Easypanel

- Nuevo servicio `aria-web` con imagen Docker buildada desde `aria-web/`
- Mismo volumen `/app/data` que `aria` (para compartir la DB)
- Variables de entorno: `DB_PATH`, `JWT_SECRET`, `ARIA_APP_URL`
- Puerto interno: 3000 (Next.js default)
- Dominio: `app.aria.[dominio]` o subpath del servidor

---

## Módulos futuros (fuera de scope del MVP)

Diseñados como secciones independientes dentro de la misma Next.js app. Cada uno tiene su propia carpeta en `app/[modulo]/` y sus propias tablas en la DB. Se habilitan por usuario via `user_modules`.
