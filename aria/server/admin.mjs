import { listUsers, deactivateUser, activateUserDirect, setPaidUntil, setDisplayName } from './users.mjs'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'aria-admin-2026'

// ── SSE for real-time new-user notifications ─────────────
const adminSseClients = new Set()

export function broadcastNewUser(phone) {
  const data = JSON.stringify({ phone, ts: Date.now() })
  for (const c of adminSseClients) c.write(`data: ${data}\n\n`)
}

// ── Auth helper ──────────────────────────────────────────
function isAuthed(req) {
  const cookie = req.headers.cookie || ''
  return cookie.split(';').some(c => c.trim() === `ap=${ADMIN_PASSWORD}`)
}

function parseBody(req) {
  return new Promise(resolve => {
    let body = ''
    req.on('data', d => { body += d })
    req.on('end', () => {
      try { resolve(JSON.parse(body)) } catch { resolve({}) }
    })
  })
}

// ── Route handler ────────────────────────────────────────
export async function handleAdminRequest(req, res) {
  const url = req.url.split('?')[0]

  // Login
  if (url === '/admin/login' && req.method === 'POST') {
    const body = await parseBody(req)
    if (body.password === ADMIN_PASSWORD) {
      res.writeHead(200, {
        'Set-Cookie': `ap=${ADMIN_PASSWORD}; Path=/; HttpOnly`,
        'Content-Type': 'application/json'
      })
      res.end(JSON.stringify({ ok: true }))
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Contraseña incorrecta' }))
    }
    return
  }

  // Protect everything else
  if (!isAuthed(req)) {
    if (url === '/admin' || url === '/admin/') {
      // serve login page
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'No autorizado' }))
      return
    }
  }

  // SSE for new users
  if (url === '/admin/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    adminSseClients.add(res)
    req.on('close', () => adminSseClients.delete(res))
    return
  }

  // API: list users
  if (url === '/admin/api/users' && req.method === 'GET') {
    const users = listUsers()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(users))
    return
  }

  // API: enable user
  if (url.startsWith('/admin/api/users/') && url.endsWith('/enable') && req.method === 'POST') {
    const phone = decodeURIComponent(url.replace('/admin/api/users/', '').replace('/enable', ''))
    activateUserDirect(phone)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  // API: disable user
  if (url.startsWith('/admin/api/users/') && url.endsWith('/disable') && req.method === 'POST') {
    const phone = decodeURIComponent(url.replace('/admin/api/users/', '').replace('/disable', ''))
    deactivateUser(phone)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  // API: set paid until
  if (url.startsWith('/admin/api/users/') && url.endsWith('/pay') && req.method === 'POST') {
    const phone = decodeURIComponent(url.replace('/admin/api/users/', '').replace('/pay', ''))
    const body = await parseBody(req)
    setPaidUntil(phone, body.until)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  // API: set display name
  if (url.startsWith('/admin/api/users/') && url.endsWith('/name') && req.method === 'POST') {
    const phone = decodeURIComponent(url.replace('/admin/api/users/', '').replace('/name', ''))
    const body = await parseBody(req)
    setDisplayName(phone, body.name)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  // Admin HTML page
  if (url === '/admin' || url === '/admin/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(ADMIN_HTML)
    return
  }

  res.writeHead(404)
  res.end()
}

// ── Admin HTML ───────────────────────────────────────────
const ADMIN_HTML = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aria Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0f0f0f;color:#e0e0e0;min-height:100vh}
#login{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:12px}
#login input{padding:10px 16px;border-radius:8px;border:1px solid #333;background:#1a1a1a;color:#fff;font-size:15px;width:260px}
#login button{padding:10px 24px;border-radius:8px;border:none;background:#25d366;color:#000;font-weight:700;font-size:15px;cursor:pointer;width:260px}
#login .err{color:#f44;font-size:13px}
#app{display:none;padding:20px}
header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px}
h1{font-size:20px;font-weight:700}
#notif{background:#25d366;color:#000;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;display:none}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;padding:10px 8px;border-bottom:1px solid #222;color:#888;font-weight:500}
td{padding:10px 8px;border-bottom:1px solid #1a1a1a;vertical-align:middle}
tr:hover td{background:#151515}
.badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600}
.active{background:#1a3d2b;color:#25d366}
.inactive{background:#2d1a1a;color:#f44}
.paid{background:#1a2d3d;color:#4da6ff}
.expired{background:#3d2a1a;color:#ff9944}
.no-pay{background:#222;color:#666}
.actions{display:flex;gap:6px;flex-wrap:wrap}
button.btn{padding:4px 12px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:600}
.btn-green{background:#25d366;color:#000}
.btn-red{background:#c0392b;color:#fff}
.btn-blue{background:#2980b9;color:#fff}
.btn-gray{background:#333;color:#aaa}
.name-input{background:transparent;border:none;border-bottom:1px solid #333;color:#e0e0e0;font-size:14px;width:120px;padding:2px 4px}
.name-input:focus{outline:none;border-bottom-color:#25d366}
@media(max-width:600px){table{font-size:12px}th:nth-child(3),td:nth-child(3){display:none}}
</style>
</head><body>

<div id="login">
  <h2 style="margin-bottom:8px">🤖 Aria Admin</h2>
  <input type="password" id="pwd" placeholder="Contraseña" onkeydown="if(event.key==='Enter')login()">
  <button onclick="login()">Entrar</button>
  <span class="err" id="login-err"></span>
</div>

<div id="app">
  <header>
    <h1>Aria — Panel Admin</h1>
    <div id="notif">📱 Nuevo usuario!</div>
  </header>
  <table>
    <thead><tr>
      <th>Teléfono</th>
      <th>Nombre cliente</th>
      <th>Nombre bot</th>
      <th>Estado</th>
      <th>Pago</th>
      <th>Vence</th>
      <th>Acciones</th>
    </tr></thead>
    <tbody id="tbody"></tbody>
  </table>
</div>

<script>
let users = []

async function login() {
  const pwd = document.getElementById('pwd').value
  const r = await fetch('/admin/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({password: pwd}) })
  if (r.ok) { document.getElementById('login').style.display='none'; document.getElementById('app').style.display='block'; loadUsers(); startSSE() }
  else { document.getElementById('login-err').textContent = 'Contraseña incorrecta' }
}

async function loadUsers() {
  const r = await fetch('/admin/api/users')
  if (!r.ok) return
  users = await r.json()
  render()
}

function payLabel(u) {
  if (!u.paid_until) return '<span class="badge no-pay">Sin configurar</span>'
  const exp = new Date(u.paid_until) < new Date()
  return \`<span class="badge \${exp ? 'expired' : 'paid'}">\${exp ? 'Vencido' : 'Al día'}</span>\`
}

function render() {
  const tbody = document.getElementById('tbody')
  tbody.innerHTML = users.map(u => \`
    <tr id="row-\${u.phone.replace(/[^a-z0-9]/gi,'_')}">
      <td>\${u.phone}</td>
      <td><input class="name-input" data-phone="\${u.phone}" value="\${u.display_name||''}" placeholder="Agregar nombre" onkeydown="if(event.key==='Enter'){saveName(this);this.blur()}" onblur="saveName(this)"></td>
      <td>\${u.name || '—'}</td>
      <td><span class="badge \${u.active ? 'active' : 'inactive'}">\${u.active ? 'Activo' : 'Inactivo'}</span></td>
      <td>\${payLabel(u)}</td>
      <td>\${u.paid_until ? u.paid_until.slice(0,10) : '—'}</td>
      <td class="actions">
        \${u.active
          ? '<button class="btn btn-red" onclick="disable(\\''+u.phone+'\\')">Desactivar</button>'
          : '<button class="btn btn-green" onclick="enable(\\''+u.phone+'\\')">Activar</button>'}
        <button class="btn btn-blue" onclick="markPaid('\${u.phone}')">Marcar pagado</button>
      </td>
    </tr>
  \`).join('')
}

async function enable(phone) {
  await fetch('/admin/api/users/'+encodeURIComponent(phone)+'/enable', {method:'POST'})
  loadUsers()
}
async function disable(phone) {
  await fetch('/admin/api/users/'+encodeURIComponent(phone)+'/disable', {method:'POST'})
  loadUsers()
}
async function markPaid(phone) {
  const d = new Date(); d.setDate(d.getDate()+30)
  const until = d.toISOString().slice(0,10)
  const custom = prompt('Fecha de vencimiento (YYYY-MM-DD):', until)
  if (!custom) return
  await fetch('/admin/api/users/'+encodeURIComponent(phone)+'/pay', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({until: custom})})
  loadUsers()
}
async function saveName(input) {
  const phone = input.dataset.phone
  const name = input.value.trim()
  input.style.borderBottomColor = '#888'
  await fetch('/admin/api/users/'+encodeURIComponent(phone)+'/name', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name})})
  input.style.borderBottomColor = '#25d366'
  setTimeout(() => input.style.borderBottomColor = '#333', 1500)
}

function startSSE() {
  const es = new EventSource('/admin/events')
  es.onmessage = e => {
    const d = JSON.parse(e.data)
    const notif = document.getElementById('notif')
    notif.textContent = '📱 Nuevo usuario: ' + d.phone
    notif.style.display = 'inline-block'
    setTimeout(() => notif.style.display='none', 8000)
    loadUsers()
  }
}

// Auto-check if already logged in
fetch('/admin/api/users').then(r => {
  if (r.ok) { document.getElementById('login').style.display='none'; document.getElementById('app').style.display='block'; r.json().then(u => { users=u; render() }); startSSE() }
})
</script>
</body></html>`
