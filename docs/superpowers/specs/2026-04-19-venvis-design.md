# VENVIS — Design Spec

**Date:** 2026-04-19
**Domain:** venvis.orvexautomation.com
**VPS:** 31.97.21.155

---

## Overview

VENVIS es un asistente personal de IA con personalidad propia, voz bidireccional y memoria larga. Es una PWA instalable que corre en un VPS propio con Node.js. Es una evolución directa de "William" — mismo motor, mismo carácter, renombrado.

---

## Personalidad

VENVIS habla en español rioplatense. Es directo, inteligente, con opiniones propias. Se siente como hablar con una persona real. Nunca dice "¡Claro!" ni "¡Por supuesto!". El tono varía según el contexto: serio para tareas complejas, distendido para charla casual. Recuerda todo lo que el usuario le cuenta y lo usa naturalmente.

---

## Stack Técnico

| Capa | Tecnología | Notas |
|------|-----------|-------|
| Runtime | Node.js (ESM) | VPS 31.97.21.155 |
| Framework | Express + Socket.io | Streaming en tiempo real |
| IA | Claude Haiku (`claude-haiku-4-5-20251001`) | vía @anthropic-ai/sdk |
| DB | SQLite — `node:sqlite` built-in | Sin compilación nativa |
| TTS | edge-tts CLI (`es-AR-TomasNeural`) | Gratuito, server-side |
| STT | Browser `SpeechRecognition` API | Chrome/Edge, client-side |
| Proceso | PM2 | Auto-restart + startup |
| Proxy | Nginx | Reverse proxy a localhost:3000 |
| HTTPS | Let's Encrypt (Certbot) | Dominio: venvis.orvexautomation.com |
| PWA | manifest.json + Service Worker | Instalable en mobile y desktop |

---

## Arquitectura de Carpetas

```
venvis/
├── package.json
├── .env
├── .env.example
├── .gitignore
├── server/
│   ├── index.mjs       # Express + Socket.io + rutas REST
│   ├── brain.mjs       # Claude streaming + extracción __MEMORIZE__
│   ├── memory.mjs      # SQLite CRUD (node:sqlite)
│   └── tts.mjs         # edge-tts wrapper → MP3 buffer
└── client/
    ├── index.html      # Shell PWA — 3 vistas: Chat, Voz, Memoria
    ├── app.js          # Lógica cliente — Socket.io, SpeechRecognition, UI
    ├── style.css       # Diseño oscuro minimalista
    ├── manifest.json   # PWA manifest
    ├── sw.js           # Service worker — cache offline básico
    └── icon.svg        # Logo: "V" blanca sobre fondo negro
```

> `stt.mjs` eliminado — STT pasa al browser vía `SpeechRecognition`.

---

## Base de Datos SQLite

Tres tablas inicializadas al arrancar si no existen:

```sql
conversations(id, session_id, role, content, timestamp)
memory(id, session_id, key, value, confidence, updated_at) -- UNIQUE(session_id, key)
sessions(id, name, created_at)
```

### API de memory.mjs

| Función | Descripción |
|---------|-------------|
| `getRecentMessages(sessionId, n=10)` | Últimos N mensajes en orden cronológico |
| `getAllMemory(sessionId)` | Todos los recuerdos del usuario |
| `saveMessage(sessionId, role, content)` | Guarda mensaje en conversations |
| `upsertMemory(sessionId, key, value, confidence)` | Crea o actualiza un recuerdo |
| `deleteMemory(sessionId, key)` | Borra un recuerdo |
| `ensureSession(sessionId, name)` | Crea sesión si no existe |

---

## Backend — Flujo de Conversación

1. Socket emite `user_message { text, sessionId }`
2. `brain.mjs` carga últimos 10 mensajes + toda la memoria del usuario
3. Construye system prompt dinámico con los recuerdos
4. Llama a Claude con stream
5. Por cada chunk: emite `venvis_chunk { text }`
6. Al terminar: extrae `__MEMORIZE__` si está presente, guarda en SQLite
7. Emite `venvis_done { text }` con el texto limpio
8. Llama a `textToSpeech(fullText)` → MP3 buffer
9. Emite `venvis_audio { audioBase64 }` al cliente

### System Prompt

```
Sos VENVIS, asistente personal de IA con carácter propio.
Hablás en español rioplatense. Sos directo, inteligente, tenés opiniones
propias y no tenés problema en debatir o contradecir. Te sentís como
hablar con una persona real. Nunca decís "¡Claro!" ni "¡Por supuesto!".
Tu tono es natural y varía según el contexto.

Lo que sabés de este usuario:
[lista de recuerdos de SQLite]

Si el usuario menciona algo importante sobre sí mismo, al final de tu
respuesta agregá en línea separada:
__MEMORIZE__{"key":"clave","value":"dato","confidence":8}__

Solo un __MEMORIZE__ por respuesta, solo si vale la pena recordarlo.
No se lo menciones al usuario.
```

---

## Frontend — Modos de Interfaz

### Modo Chat
- Input de texto + botón enviar (Enter también)
- Mensajes de VENVIS: texto directo con markdown renderizado (marked.js)
- Mensajes del usuario: burbuja alineada derecha
- Efecto streaming: texto aparece chunk a chunk
- Dots animados ("pensando...") mientras espera primer chunk
- Audio se reproduce automáticamente al recibir `venvis_audio`

### Modo Voz
- Pantalla oscura con "VENVIS" centrado en 48px
- Indicador de estado: "Listo" / "Escuchando..." / "Pensando..." / "Hablando..."
- Botón circular push-to-talk: mantener presionado activa `SpeechRecognition`
- Al soltar: el texto transcripto se envía como `user_message`
- Al recibir `venvis_audio`: reproduce y muestra "Hablando..."
- Transcripción visible debajo del botón

### Panel de Memoria
- Slide-in lateral al presionar "Memoria" en el header
- Lista todos los recuerdos: clave, valor, confianza/10
- Botón × por ítem → DELETE `/api/memory/:key`
- Se actualiza en tiempo real

---

## REST API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/memory?session=X` | Todos los recuerdos |
| GET | `/api/history?session=X` | Últimos 50 mensajes |
| DELETE | `/api/memory/:key?session=X` | Borra un recuerdo |

---

## Socket.io Events

| Evento | Dirección | Payload |
|--------|-----------|---------|
| `user_message` | cliente → servidor | `{ text, sessionId }` |
| `venvis_chunk` | servidor → cliente | `{ text }` |
| `venvis_done` | servidor → cliente | `{ text }` |
| `venvis_audio` | servidor → cliente | `{ audioBase64 }` |
| `venvis_error` | servidor → cliente | `{ message }` |

---

## STT — SpeechRecognition (Browser)

```javascript
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)()
recognition.lang = 'es-AR'
recognition.continuous = false
recognition.interimResults = false
// onstart → estado "Escuchando..."
// onresult → enviar texto transcripto como user_message
// onerror / onend → volver a "Listo"
```

Solo disponible en Chrome/Edge. En otros browsers se muestra un aviso.

---

## TTS — edge-tts (Server-side)

```bash
edge-tts --voice "es-AR-TomasNeural" --text "..." --write-media output.mp3
```

- Texto limpiado: comillas → apóstrofo, saltos → espacio, max 500 chars
- Fallback a `python -m edge_tts` si el comando directo falla
- Si falla completamente: retorna `null`, el cliente muestra solo texto

---

## Diseño Visual

```css
--bg:         #0a0a0a
--surface:    #111111
--text:       #e8e8e8
--text-muted: #666666
--accent:     #7c6af7   /* violeta */
--border:     #1e1e1e
--danger:     #e05555
```

- Font: system-ui
- Sin sombras, sin gradientes, sin bordes brillantes
- Header fijo con título "VENVIS" + botones Voz/Memoria
- Modo voz: "VENVIS" en 48px, letter-spacing: 0.15em

---

## PWA

- `manifest.json`: nombre "VENVIS", theme/background `#0a0a0a`, display standalone
- `sw.js`: cachea assets estáticos (index.html, style.css, app.js, manifest.json, icon.svg)
- No cachea rutas `/api/` ni `socket.io`
- Instalable en Android/iOS/desktop via Chrome

---

## Despliegue en VPS

### Estructura en el servidor
```
/var/www/venvis/          # código del proyecto
/etc/nginx/sites-available/venvis   # config Nginx
```

### Nginx Config
```nginx
server {
    listen 443 ssl;
    server_name venvis.orvexautomation.com;

    ssl_certificate /etc/letsencrypt/live/venvis.orvexautomation.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/venvis.orvexautomation.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name venvis.orvexautomation.com;
    return 301 https://$host$request_uri;
}
```

> El header `Upgrade` es necesario para que Socket.io funcione detrás de Nginx.

### PM2
```bash
pm2 start server/index.mjs --name venvis
pm2 startup
pm2 save
```

---

## .env

```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000
SESSION_NAME=agus
```

---

## Prerequisitos en el VPS

- Node.js ≥ 22 (para `node:sqlite` built-in)
- Python + pip + edge-tts (`pip install edge-tts`)
- Nginx
- Certbot (`apt install certbot python3-certbot-nginx`)
- PM2 (`npm install -g pm2`)
- DNS: `venvis.orvexautomation.com` apuntando a `31.97.21.155`
