# Gergolet Web — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the redesigned Gergolet Agrícola website with 7 public pages, a marketing admin panel (products/categories), and an owner admin panel (banks/financing text).

**Architecture:** Next.js 16 App Router with route groups `(public)`, `(auth)`, and `admin`. Supabase handles DB, Auth (with role metadata), and Storage for product images. Two separate admin dashboards gated by Supabase Auth user metadata role (`marketing` | `owner`).

**Tech Stack:** Next.js 16, Supabase (@supabase/ssr), Tailwind CSS v4, Vercel, Montserrat + Lato fonts (Google Fonts)

---

## Task 1: Project scaffold + config

**Files:**
- Create: `gergolet-web/` (new Next.js project)
- Create: `gergolet-web/next.config.ts`
- Create: `gergolet-web/package.json` (build script fix)
- Create: `gergolet-web/.env.local`
- Create: `gergolet-web/app/globals.css`

- [ ] **Step 1: Scaffold project**

```bash
cd /c/Users/Charly/OneDrive/Escritorio/ClaudeCode/CreadorApps
npx create-next-app@latest gergolet-web --typescript --tailwind --app --no-src-dir --no-turbopack --import-alias "@/*"
cd gergolet-web
npm install @supabase/ssr @supabase/supabase-js
```

- [ ] **Step 2: Fix build script to use webpack (not Turbopack)**

Edit `package.json` — change the build script:
```json
"scripts": {
  "dev": "next dev --webpack",
  "build": "next build --webpack",
  "start": "next start",
  "lint": "next lint"
}
```

- [ ] **Step 3: Configure next.config.ts**

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
}

export default nextConfig
```

- [ ] **Step 4: Create .env.local**

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
RESEND_API_KEY=your-resend-key
```

- [ ] **Step 5: Set up globals.css with Tailwind v4 + fonts**

```css
/* app/globals.css */
@import "tailwindcss";

@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;900&family=Lato:wght@400;700&display=swap');

@theme inline {
  --font-heading: 'Montserrat', sans-serif;
  --font-body: 'Lato', sans-serif;
  --color-red: #e3000c;
  --color-navy: #1B273D;
  --color-gray-light: #f0f4f9;
}

body {
  font-family: 'Lato', sans-serif;
  background-color: #ffffff;
  color: #1B273D;
}

h1, h2, h3, h4 {
  font-family: 'Montserrat', sans-serif;
}
```

- [ ] **Step 6: Verify dev server runs**

```bash
npm run dev
```
Expected: server at http://localhost:3000 with no errors.

- [ ] **Step 7: Commit**

```bash
git init && git add -A
git commit -m "chore: scaffold gergolet-web with Next.js 16 + Supabase"
```

---

## Task 2: Supabase schema + types

**Files:**
- Create: `supabase/schema.sql`
- Create: `lib/supabase/types.ts`
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`

- [ ] **Step 1: Create schema.sql**

```sql
-- supabase/schema.sql

-- Categorías
CREATE TABLE categorias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Productos
CREATE TABLE productos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  descripcion_corta TEXT,
  descripcion_completa TEXT,
  categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  pdf_url TEXT,
  activo BOOLEAN DEFAULT TRUE,
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Imágenes de productos
CREATE TABLE producto_imagenes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bancos
CREATE TABLE bancos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  logo_url TEXT,
  activo BOOLEAN DEFAULT FALSE,
  orden INTEGER DEFAULT 0
);

-- Configuración general
CREATE TABLE config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

-- Seed: categorías iniciales
INSERT INTO categorias (nombre, slug, orden) VALUES
  ('Mezcladoras', 'mezcladoras', 1),
  ('Tanques', 'tanques', 2),
  ('Homogeneizadores', 'homogeneizadores', 3),
  ('Tolvas', 'tolvas', 4),
  ('Desmalezadoras', 'desmalezadoras', 5);

-- Seed: texto de financiación
INSERT INTO config (clave, valor) VALUES
  ('financiacion_texto', 'Financiá tu maquinaria con las mejores condiciones del mercado. Trabajamos con los principales bancos del país para ofrecerte opciones flexibles de pago.');

-- Seed: bancos argentinos
INSERT INTO bancos (nombre, logo_url, activo, orden) VALUES
  ('Banco Nación', '', false, 1),
  ('Banco Provincia', '', false, 2),
  ('Santander', '', false, 3),
  ('Galicia', '', false, 4),
  ('BBVA', '', false, 5),
  ('HSBC', '', false, 6),
  ('Macro', '', false, 7),
  ('Supervielle', '', false, 8),
  ('Credicoop', '', false, 9),
  ('Banco Patagonia', '', false, 10),
  ('Banco Ciudad', '', false, 11),
  ('Banco Córdoba', '', false, 12),
  ('Banco Entre Ríos', '', false, 13),
  ('Itaú', '', false, 14),
  ('ICBC', '', false, 15),
  ('Brubank', '', false, 16),
  ('Naranja X', '', false, 17),
  ('Uala', '', false, 18),
  ('Mercado Pago', '', false, 19),
  ('Personal Pay', '', false, 20);

-- RLS
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE producto_imagenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bancos ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Público: solo lectura
CREATE POLICY "Public read categorias" ON categorias FOR SELECT USING (true);
CREATE POLICY "Public read productos" ON productos FOR SELECT USING (activo = true);
CREATE POLICY "Public read producto_imagenes" ON producto_imagenes FOR SELECT USING (true);
CREATE POLICY "Public read bancos activos" ON bancos FOR SELECT USING (activo = true);
CREATE POLICY "Public read config" ON config FOR SELECT USING (true);

-- Marketing: CRUD productos, categorias, imagenes
CREATE POLICY "Marketing CRUD categorias" ON categorias FOR ALL USING (auth.jwt() ->> 'role' = 'marketing' OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'marketing');
CREATE POLICY "Marketing CRUD productos" ON productos FOR ALL USING (auth.jwt() ->> 'role' = 'marketing' OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'marketing');
CREATE POLICY "Marketing CRUD imagenes" ON producto_imagenes FOR ALL USING (auth.jwt() ->> 'role' = 'marketing' OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'marketing');

-- Owner: CRUD bancos y config
CREATE POLICY "Owner CRUD bancos" ON bancos FOR ALL USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'owner');
CREATE POLICY "Owner CRUD config" ON config FOR ALL USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'owner');

-- Storage bucket para imágenes de productos (ejecutar en Supabase dashboard)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('productos', 'productos', true);
```

- [ ] **Step 2: Create TypeScript types**

```typescript
// lib/supabase/types.ts
export interface Categoria {
  id: string
  nombre: string
  slug: string
  orden: number
  created_at: string
}

export interface Producto {
  id: string
  nombre: string
  slug: string
  descripcion_corta: string | null
  descripcion_completa: string | null
  categoria_id: string | null
  pdf_url: string | null
  activo: boolean
  orden: number
  created_at: string
}

export interface ProductoImagen {
  id: string
  producto_id: string
  url: string
  orden: number
  created_at: string
}

export interface Banco {
  id: string
  nombre: string
  logo_url: string | null
  activo: boolean
  orden: number
}

export interface Config {
  clave: string
  valor: string
}

export interface ProductoConImagenes extends Producto {
  categoria: Categoria | null
  imagenes: ProductoImagen[]
}
```

- [ ] **Step 3: Create Supabase browser client**

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 4: Create Supabase server client**

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 5: Run schema in Supabase SQL Editor**

Copy contents of `supabase/schema.sql` and run in Supabase → SQL Editor → New query → Run.
Also create the storage bucket: Supabase → Storage → New bucket → name: `productos`, Public: ON.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Supabase schema, types, and client helpers"
```

---

## Task 3: Auth + proxy middleware + layout

**Files:**
- Create: `proxy.ts`
- Create: `app/layout.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `lib/utils.ts`

- [ ] **Step 1: Create proxy.ts (auth middleware for Next.js 16)**

```typescript
// proxy.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Protect /admin routes
  if (pathname.startsWith('/admin') && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Protect role-specific admin routes
  if (pathname.startsWith('/admin/marketing') && user) {
    const role = user.user_metadata?.role
    if (role !== 'marketing') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  if (pathname.startsWith('/admin/owner') && user) {
    const role = user.user_metadata?.role
    if (role !== 'owner') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
```

- [ ] **Step 2: Create root layout**

```typescript
// app/layout.tsx
export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Gergolet Agrícola',
  description: 'Fabricantes de maquinaria agrícola y ganadera. Morteros, Córdoba.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Create login page**

```typescript
// app/(auth)/login/page.tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
      return
    }
    const role = data.user?.user_metadata?.role
    if (role === 'marketing') router.push('/admin/marketing')
    else if (role === 'owner') router.push('/admin/owner')
    else router.push('/')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1B273D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '40px', width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img src="/logo.png" alt="GEA Gergolet" style={{ height: '60px', marginBottom: '12px' }} />
          <p style={{ color: '#666', fontSize: '14px' }}>Panel de administración</p>
        </div>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '10px 12px', fontSize: '14px' }}
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '10px 12px', fontSize: '14px' }}
          />
          {error && <p style={{ color: '#e3000c', fontSize: '13px', margin: 0 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{ background: '#e3000c', color: '#fff', border: 'none', borderRadius: '6px', padding: '11px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create lib/utils.ts**

```typescript
// lib/utils.ts
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}
```

- [ ] **Step 5: Add logo to public folder**

Place the GEA Gergolet logo file as `public/logo.png` (copy from the existing website or ask the client).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: auth middleware, login page, root layout"
```

---

## Task 4: Public layout — Navbar + Footer

**Files:**
- Create: `app/(public)/layout.tsx`
- Create: `components/layout/Navbar.tsx`
- Create: `components/layout/Footer.tsx`

- [ ] **Step 1: Create public layout**

```typescript
// app/(public)/layout.tsx
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main>{children}</main>
      <Footer />
    </>
  )
}
```

- [ ] **Step 2: Create Navbar**

```typescript
// components/layout/Navbar.tsx
'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const NAV_LINKS = [
  { href: '/',               label: 'Inicio' },
  { href: '/empresa',        label: 'Empresa' },
  { href: '/productos',      label: 'Productos' },
  { href: '/servicios',      label: 'Servicios' },
  { href: '/concesionarios', label: 'Concesionarios' },
  { href: '/financiacion',   label: 'Financiación' },
  { href: '/contacto',       label: 'Contacto' },
]

export function Navbar() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav style={{ background: '#1B273D', position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
        <Link href="/">
          <img src="/logo.png" alt="GEA Gergolet" style={{ height: '40px' }} />
        </Link>

        {/* Desktop nav */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} className="desktop-nav">
          {NAV_LINKS.slice(0, -1).map(link => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                color: pathname === link.href ? '#e3000c' : '#aec6e8',
                fontFamily: 'Montserrat, sans-serif',
                fontWeight: 600,
                fontSize: '12px',
                letterSpacing: '0.5px',
                padding: '6px 10px',
                borderRadius: '4px',
                textDecoration: 'none',
                borderBottom: pathname === link.href ? '2px solid #e3000c' : '2px solid transparent',
              }}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/contacto"
            style={{ background: '#e3000c', color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '12px', letterSpacing: '1px', padding: '8px 16px', borderRadius: '4px', textDecoration: 'none', marginLeft: '8px' }}
          >
            CONTACTO
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '24px', display: 'none' }}
          className="mobile-menu-btn"
          aria-label="Menú"
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{ background: '#0d1829', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              style={{ display: 'block', color: '#aec6e8', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: '14px', padding: '14px 24px', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: block !important; }
        }
      `}</style>
    </nav>
  )
}
```

- [ ] **Step 3: Create Footer**

```typescript
// components/layout/Footer.tsx
import Link from 'next/link'

export function Footer() {
  return (
    <footer style={{ background: '#1B273D', color: '#aec6e8', marginTop: '80px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 20px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '32px' }}>
        <div>
          <img src="/logo.png" alt="GEA Gergolet" style={{ height: '48px', marginBottom: '12px' }} />
          <p style={{ fontSize: '13px', lineHeight: '1.6', margin: 0 }}>Fabricantes de maquinaria agrícola y ganadera. Morteros, Córdoba.</p>
        </div>
        <div>
          <h4 style={{ color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '12px', letterSpacing: '2px', marginBottom: '12px' }}>NAVEGACIÓN</h4>
          {[['/', 'Inicio'], ['/empresa', 'Empresa'], ['/productos', 'Productos'], ['/servicios', 'Servicios'], ['/concesionarios', 'Concesionarios'], ['/financiacion', 'Financiación']].map(([href, label]) => (
            <Link key={href} href={href} style={{ display: 'block', color: '#aec6e8', fontSize: '13px', textDecoration: 'none', marginBottom: '6px' }}>{label}</Link>
          ))}
        </div>
        <div>
          <h4 style={{ color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '12px', letterSpacing: '2px', marginBottom: '12px' }}>CONTACTO</h4>
          <p style={{ fontSize: '13px', margin: '0 0 6px' }}>Blvd. Eva Perón 1257, Morteros, Córdoba</p>
          <p style={{ fontSize: '13px', margin: '0 0 6px' }}>(03562) 404141</p>
          <p style={{ fontSize: '13px', margin: '0 0 6px' }}>consultas@gergolet.com.ar</p>
          <p style={{ fontSize: '13px', margin: '0 0 12px' }}>Lun–Vie 7:00–12:00 / 14:00–18:00</p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <a href="https://facebook.com" target="_blank" rel="noopener" style={{ color: '#aec6e8', fontSize: '18px' }}>f</a>
            <a href="https://instagram.com" target="_blank" rel="noopener" style={{ color: '#aec6e8', fontSize: '18px' }}>ig</a>
            <a href="https://youtube.com" target="_blank" rel="noopener" style={{ color: '#aec6e8', fontSize: '18px' }}>yt</a>
          </div>
        </div>
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '16px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: '12px', color: '#7a9cc4', margin: 0 }}>© {new Date().getFullYear()} GEA Gergolet Agrícola. Todos los derechos reservados.</p>
      </div>
    </footer>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: public layout with Navbar and Footer"
```

---

## Task 5: Homepage (`/`)

**Files:**
- Create: `app/(public)/page.tsx`
- Create: `components/home/Hero.tsx`
- Create: `components/home/ProductosDestacados.tsx`
- Create: `components/home/FinanciacionPreview.tsx`
- Create: `components/home/ContactoRapido.tsx`

- [ ] **Step 1: Create Hero component**

```typescript
// components/home/Hero.tsx
import Link from 'next/link'

export function Hero() {
  return (
    <section style={{ background: 'linear-gradient(135deg, #1B273D 0%, #0d1829 100%)', padding: '80px 20px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <p style={{ color: '#e3000c', fontSize: '11px', letterSpacing: '4px', fontWeight: 700, marginBottom: '12px', fontFamily: 'Montserrat, sans-serif' }}>
          MORTEROS, CÓRDOBA — DESDE 1985
        </p>
        <h1 style={{ color: '#fff', fontSize: 'clamp(32px, 5vw, 64px)', fontWeight: 900, lineHeight: 1.1, marginBottom: '16px', fontFamily: 'Montserrat, sans-serif' }}>
          Maquinaria agrícola<br />
          <span style={{ color: '#e3000c' }}>de alto rendimiento</span>
        </h1>
        <p style={{ color: '#aec6e8', fontSize: '16px', lineHeight: 1.7, maxWidth: '520px', marginBottom: '32px' }}>
          Diseñamos y fabricamos equipos para el agro argentino. Más de 35 años de experiencia en mezcladoras, tanques, homogeneizadores y más.
        </p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link href="/productos" style={{ background: '#e3000c', color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '13px', letterSpacing: '1px', padding: '14px 28px', borderRadius: '6px', textDecoration: 'none' }}>
            VER PRODUCTOS
          </Link>
          <Link href="/financiacion" style={{ border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: '13px', padding: '14px 28px', borderRadius: '6px', textDecoration: 'none' }}>
            FINANCIACIÓN
          </Link>
        </div>
        <div style={{ display: 'flex', gap: '40px', marginTop: '48px', paddingTop: '32px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {[['35+', 'AÑOS'], ['47', 'PRODUCTOS'], ['∞', 'FINANCIACIÓN']].map(([num, label]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ color: num === '35+' ? '#e3000c' : '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '36px' }}>{num}</div>
              <div style={{ color: '#7a9cc4', fontSize: '10px', letterSpacing: '2px', marginTop: '4px' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create ProductosDestacados**

```typescript
// components/home/ProductosDestacados.tsx
import Link from 'next/link'
import type { ProductoConImagenes } from '@/lib/supabase/types'

interface Props { productos: ProductoConImagenes[] }

export function ProductosDestacados({ productos }: Props) {
  return (
    <section style={{ background: '#fff', padding: '80px 20px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{ color: '#e3000c', fontSize: '10px', letterSpacing: '4px', fontWeight: 700, fontFamily: 'Montserrat, sans-serif', marginBottom: '8px' }}>CATÁLOGO</p>
          <h2 style={{ color: '#1B273D', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(24px, 4vw, 40px)', margin: 0 }}>Nuestros productos</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {productos.map(p => (
            <Link key={p.id} href={`/productos/${p.slug}`} style={{ textDecoration: 'none', border: '1px solid #eee', borderRadius: '12px', overflow: 'hidden', display: 'block', transition: 'box-shadow 0.2s' }}>
              <div style={{ background: '#f5f7fa', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {p.imagenes[0] ? (
                  <img src={p.imagenes[0].url} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ color: '#ccc', fontSize: '48px' }}>⚙</div>
                )}
              </div>
              <div style={{ padding: '16px' }}>
                <h3 style={{ color: '#1B273D', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '15px', margin: '0 0 6px' }}>{p.nombre}</h3>
                {p.descripcion_corta && <p style={{ color: '#666', fontSize: '13px', margin: '0 0 10px', lineHeight: 1.5 }}>{p.descripcion_corta}</p>}
                <span style={{ color: '#e3000c', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: '12px' }}>Ver ficha →</span>
              </div>
            </Link>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: '40px' }}>
          <Link href="/productos" style={{ background: '#1B273D', color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '13px', letterSpacing: '1px', padding: '14px 32px', borderRadius: '6px', textDecoration: 'none' }}>
            VER CATÁLOGO COMPLETO
          </Link>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Create FinanciacionPreview**

```typescript
// components/home/FinanciacionPreview.tsx
import Link from 'next/link'
import type { Banco } from '@/lib/supabase/types'

interface Props { bancos: Banco[]; texto: string }

export function FinanciacionPreview({ bancos, texto }: Props) {
  return (
    <section style={{ background: '#f0f4f9', padding: '80px 20px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
        <p style={{ color: '#e3000c', fontSize: '10px', letterSpacing: '4px', fontWeight: 700, fontFamily: 'Montserrat, sans-serif', marginBottom: '8px' }}>FINANCIACIÓN</p>
        <h2 style={{ color: '#1B273D', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(24px, 4vw, 40px)', marginBottom: '16px' }}>Financiá tu compra</h2>
        <p style={{ color: '#4a5568', fontSize: '15px', lineHeight: 1.7, maxWidth: '600px', margin: '0 auto 40px' }}>{texto}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', marginBottom: '32px' }}>
          {bancos.map(b => (
            <div key={b.id} style={{ background: '#fff', borderRadius: '8px', padding: '12px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: '13px', color: '#1B273D' }}>
              {b.nombre}
            </div>
          ))}
        </div>
        <Link href="/financiacion" style={{ color: '#e3000c', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '13px', letterSpacing: '1px', textDecoration: 'none' }}>
          VER MÁS OPCIONES →
        </Link>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Create ContactoRapido**

```typescript
// components/home/ContactoRapido.tsx
export function ContactoRapido() {
  return (
    <section style={{ background: '#1B273D', padding: '80px 20px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '48px', alignItems: 'start' }}>
        <div>
          <p style={{ color: '#e3000c', fontSize: '10px', letterSpacing: '4px', fontWeight: 700, fontFamily: 'Montserrat, sans-serif', marginBottom: '8px' }}>CONTACTO</p>
          <h2 style={{ color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(24px, 3vw, 36px)', marginBottom: '24px' }}>Consultanos</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[['📍', 'Blvd. Eva Perón 1257, Morteros, Córdoba'],['📞', '(03562) 404141'],['✉️', 'consultas@gergolet.com.ar'],['🕐', 'Lun–Vie 7:00–12:00 / 14:00–18:00']].map(([icon, text]) => (
              <div key={text} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '16px' }}>{icon}</span>
                <span style={{ color: '#aec6e8', fontSize: '14px', lineHeight: 1.5 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <ContactForm />
        </div>
      </div>
    </section>
  )
}

function ContactForm() {
  return (
    <form style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {['Nombre', 'Email'].map(label => (
        <input key={label} placeholder={label} type={label === 'Email' ? 'email' : 'text'} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', padding: '12px 14px', color: '#fff', fontSize: '14px' }} />
      ))}
      <textarea placeholder="Mensaje" rows={4} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', padding: '12px 14px', color: '#fff', fontSize: '14px', resize: 'none' }} />
      <button type="submit" style={{ background: '#e3000c', color: '#fff', border: 'none', borderRadius: '6px', padding: '13px', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '13px', letterSpacing: '1px', cursor: 'pointer' }}>
        ENVIAR MENSAJE
      </button>
    </form>
  )
}
```

- [ ] **Step 5: Create homepage**

```typescript
// app/(public)/page.tsx
import { createClient } from '@/lib/supabase/server'
import { Hero } from '@/components/home/Hero'
import { ProductosDestacados } from '@/components/home/ProductosDestacados'
import { FinanciacionPreview } from '@/components/home/FinanciacionPreview'
import { ContactoRapido } from '@/components/home/ContactoRapido'
import type { ProductoConImagenes } from '@/lib/supabase/types'

export default async function HomePage() {
  const supabase = await createClient()

  const [{ data: productosRaw }, { data: imagenesRaw }, { data: categoriasRaw }, { data: bancosRaw }, { data: configRaw }] = await Promise.all([
    supabase.from('productos').select('*').eq('activo', true).order('orden').limit(6),
    supabase.from('producto_imagenes').select('*').order('orden'),
    supabase.from('categorias').select('*').order('orden'),
    supabase.from('bancos').select('*').eq('activo', true).order('orden'),
    supabase.from('config').select('*').eq('clave', 'financiacion_texto').single(),
  ])

  const categorias = categoriasRaw ?? []
  const imagenes = imagenesRaw ?? []
  const productos: ProductoConImagenes[] = (productosRaw ?? []).map(p => ({
    ...p,
    categoria: categorias.find(c => c.id === p.categoria_id) ?? null,
    imagenes: imagenes.filter(i => i.producto_id === p.id),
  }))

  return (
    <>
      <Hero />
      <ProductosDestacados productos={productos} />
      <FinanciacionPreview bancos={bancosRaw ?? []} texto={(configRaw as any)?.valor ?? ''} />
      <ContactoRapido />
    </>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: homepage with Hero, ProductosDestacados, FinanciacionPreview, ContactoRapido"
```

---

## Task 6: Página de Productos + detalle

**Files:**
- Create: `app/(public)/productos/page.tsx`
- Create: `app/(public)/productos/[slug]/page.tsx`
- Create: `components/productos/ProductoGrid.tsx`
- Create: `components/productos/FiltrosCategorias.tsx`

- [ ] **Step 1: Create FiltrosCategorias (client component)**

```typescript
// components/productos/FiltrosCategorias.tsx
'use client'
import type { Categoria } from '@/lib/supabase/types'

interface Props {
  categorias: Categoria[]
  activa: string
  onChange: (slug: string) => void
}

export function FiltrosCategorias({ categorias, activa, onChange }: Props) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '32px' }}>
      <button
        onClick={() => onChange('todas')}
        style={{ background: activa === 'todas' ? '#e3000c' : '#f0f4f9', color: activa === 'todas' ? '#fff' : '#1B273D', border: 'none', borderRadius: '20px', padding: '8px 18px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: '12px', cursor: 'pointer', letterSpacing: '0.5px' }}
      >
        Todas
      </button>
      {categorias.map(c => (
        <button
          key={c.id}
          onClick={() => onChange(c.slug)}
          style={{ background: activa === c.slug ? '#e3000c' : '#f0f4f9', color: activa === c.slug ? '#fff' : '#1B273D', border: 'none', borderRadius: '20px', padding: '8px 18px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: '12px', cursor: 'pointer', letterSpacing: '0.5px' }}
        >
          {c.nombre}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create ProductoGrid (client component with filter + search)**

```typescript
// components/productos/ProductoGrid.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { FiltrosCategorias } from './FiltrosCategorias'
import type { ProductoConImagenes, Categoria } from '@/lib/supabase/types'

interface Props {
  productos: ProductoConImagenes[]
  categorias: Categoria[]
}

export function ProductoGrid({ productos, categorias }: Props) {
  const [filtro, setFiltro] = useState('todas')
  const [busqueda, setBusqueda] = useState('')

  const filtrados = productos.filter(p => {
    const matchCategoria = filtro === 'todas' || p.categoria?.slug === filtro
    const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    return matchCategoria && matchBusqueda
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '24px' }}>
        <input
          placeholder="Buscar producto..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{ flex: '1', minWidth: '200px', border: '1px solid #ddd', borderRadius: '6px', padding: '10px 14px', fontSize: '14px' }}
        />
      </div>
      <FiltrosCategorias categorias={categorias} activa={filtro} onChange={setFiltro} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
        {filtrados.map(p => (
          <Link key={p.id} href={`/productos/${p.slug}`} style={{ textDecoration: 'none', border: '1px solid #eee', borderRadius: '12px', overflow: 'hidden', display: 'block' }}>
            <div style={{ background: '#f5f7fa', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {p.imagenes[0] ? (
                <img src={p.imagenes[0].url} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ color: '#ccc', fontSize: '48px' }}>⚙</div>
              )}
            </div>
            <div style={{ padding: '16px' }}>
              {p.categoria && <span style={{ background: '#f0f4f9', color: '#1B273D', fontSize: '10px', fontWeight: 700, fontFamily: 'Montserrat, sans-serif', padding: '3px 8px', borderRadius: '10px', letterSpacing: '0.5px' }}>{p.categoria.nombre}</span>}
              <h3 style={{ color: '#1B273D', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '15px', margin: '8px 0 6px' }}>{p.nombre}</h3>
              {p.descripcion_corta && <p style={{ color: '#666', fontSize: '13px', margin: '0 0 10px', lineHeight: 1.5 }}>{p.descripcion_corta}</p>}
              <span style={{ color: '#e3000c', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: '12px' }}>Ver ficha técnica →</span>
            </div>
          </Link>
        ))}
        {filtrados.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px', color: '#999' }}>
            No se encontraron productos
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create productos page**

```typescript
// app/(public)/productos/page.tsx
import { createClient } from '@/lib/supabase/server'
import { ProductoGrid } from '@/components/productos/ProductoGrid'
import type { ProductoConImagenes } from '@/lib/supabase/types'

export default async function ProductosPage() {
  const supabase = await createClient()
  const [{ data: productosRaw }, { data: imagenesRaw }, { data: categorias }] = await Promise.all([
    supabase.from('productos').select('*').eq('activo', true).order('orden'),
    supabase.from('producto_imagenes').select('*').order('orden'),
    supabase.from('categorias').select('*').order('orden'),
  ])

  const productos: ProductoConImagenes[] = (productosRaw ?? []).map(p => ({
    ...p,
    categoria: (categorias ?? []).find(c => c.id === p.categoria_id) ?? null,
    imagenes: (imagenesRaw ?? []).filter(i => i.producto_id === p.id),
  }))

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 20px' }}>
      <p style={{ color: '#e3000c', fontSize: '10px', letterSpacing: '4px', fontWeight: 700, fontFamily: 'Montserrat, sans-serif', marginBottom: '8px' }}>CATÁLOGO</p>
      <h1 style={{ color: '#1B273D', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(28px, 4vw, 48px)', marginBottom: '40px' }}>Productos</h1>
      <ProductoGrid productos={productos} categorias={categorias ?? []} />
    </div>
  )
}
```

- [ ] **Step 4: Create product detail page**

```typescript
// app/(public)/productos/[slug]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export default async function ProductoDetallePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: producto } = await supabase.from('productos').select('*').eq('slug', slug).eq('activo', true).single()
  if (!producto) notFound()

  const [{ data: imagenes }, { data: categoria }] = await Promise.all([
    supabase.from('producto_imagenes').select('*').eq('producto_id', producto.id).order('orden'),
    producto.categoria_id ? supabase.from('categorias').select('*').eq('id', producto.categoria_id).single() : Promise.resolve({ data: null }),
  ])

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '48px', alignItems: 'start' }}>
        {/* Imágenes */}
        <div>
          <div style={{ background: '#f5f7fa', borderRadius: '12px', overflow: 'hidden', aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
            {imagenes?.[0] ? (
              <img src={imagenes[0].url} alt={producto.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ color: '#ccc', fontSize: '64px' }}>⚙</div>
            )}
          </div>
          {imagenes && imagenes.length > 1 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {imagenes.slice(1).map(img => (
                <div key={img.id} style={{ width: '72px', height: '72px', borderRadius: '6px', overflow: 'hidden' }}>
                  <img src={img.url} alt={producto.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          {categoria && <span style={{ background: '#f0f4f9', color: '#1B273D', fontSize: '11px', fontWeight: 700, fontFamily: 'Montserrat, sans-serif', padding: '4px 10px', borderRadius: '10px' }}>{categoria.nombre}</span>}
          <h1 style={{ color: '#1B273D', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(24px, 3vw, 36px)', margin: '12px 0 16px' }}>{producto.nombre}</h1>
          {producto.descripcion_corta && <p style={{ color: '#e3000c', fontWeight: 600, fontSize: '15px', marginBottom: '16px' }}>{producto.descripcion_corta}</p>}
          {producto.descripcion_completa && <p style={{ color: '#4a5568', fontSize: '15px', lineHeight: 1.8, marginBottom: '24px' }}>{producto.descripcion_completa}</p>}
          {producto.pdf_url && (
            <a href={producto.pdf_url} target="_blank" rel="noopener" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#1B273D', color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '13px', padding: '12px 24px', borderRadius: '6px', textDecoration: 'none', letterSpacing: '0.5px' }}>
              📄 DESCARGAR FICHA TÉCNICA
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: productos page with grid, filters, search, and detail page"
```

---

## Task 7: Páginas estáticas (Empresa, Servicios, Concesionarios, Financiación, Contacto)

**Files:**
- Create: `app/(public)/empresa/page.tsx`
- Create: `app/(public)/servicios/page.tsx`
- Create: `app/(public)/concesionarios/page.tsx`
- Create: `app/(public)/financiacion/page.tsx`
- Create: `app/(public)/contacto/page.tsx`

- [ ] **Step 1: Create /empresa page**

```typescript
// app/(public)/empresa/page.tsx
export default function EmpresaPage() {
  return (
    <div>
      {/* Hero section */}
      <div style={{ background: 'linear-gradient(135deg, #1B273D 0%, #0d1829 100%)', padding: '80px 20px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <p style={{ color: '#e3000c', fontSize: '10px', letterSpacing: '4px', fontWeight: 700, fontFamily: 'Montserrat, sans-serif', marginBottom: '8px' }}>NUESTRA HISTORIA</p>
          <h1 style={{ color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(28px, 4vw, 52px)', margin: 0 }}>La empresa</h1>
        </div>
      </div>

      {/* Contenido */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '80px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '48px', marginBottom: '80px' }}>
          <div>
            <h2 style={{ color: '#1B273D', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '28px', marginBottom: '16px' }}>Más de 35 años fabricando para el campo argentino</h2>
            <p style={{ color: '#4a5568', lineHeight: 1.8, fontSize: '15px' }}>
              GEA Gergolet Agrícola nació en Morteros, Córdoba, con la misión de diseñar y fabricar maquinaria de alta calidad para el sector agropecuario argentino. A lo largo de los años, nos hemos consolidado como referentes en la fabricación de mezcladoras, tanques, homogeneizadores y equipos especiales.
            </p>
          </div>
          <div style={{ background: '#f0f4f9', borderRadius: '12px', padding: '32px' }}>
            <h3 style={{ color: '#1B273D', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '20px', marginBottom: '20px' }}>Nuestros valores</h3>
            {[['🔧 Calidad', 'Fabricación con los más altos estándares técnicos.'],['🤝 Compromiso', 'Acompañamos al cliente antes, durante y después de la venta.'],['💡 Innovación', 'Desarrollo constante de nuevas soluciones para el campo.'],['🌱 Sustentabilidad', 'Equipos diseñados para durar y maximizar la eficiencia.']].map(([titulo, desc]) => (
              <div key={titulo} style={{ marginBottom: '16px' }}>
                <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '14px', color: '#1B273D', marginBottom: '4px' }}>{titulo}</div>
                <div style={{ fontSize: '13px', color: '#666', lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '20px', background: '#1B273D', borderRadius: '16px', padding: '40px' }}>
          {[['35+', 'Años de experiencia'], ['47', 'Productos en catálogo'], ['500+', 'Clientes activos'], ['15+', 'Provincias con presencia']].map(([num, label]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ color: '#e3000c', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '40px' }}>{num}</div>
              <div style={{ color: '#aec6e8', fontSize: '12px', lineHeight: 1.4, marginTop: '6px' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create /servicios page**

```typescript
// app/(public)/servicios/page.tsx
export default function ServiciosPage() {
  const servicios = [
    { icon: '🔧', titulo: 'Servicio técnico', desc: 'Equipo de técnicos especializados disponible para asistencia en campo y taller. Diagnóstico y reparación de todos nuestros equipos.' },
    { icon: '⚙️', titulo: 'Repuestos originales', desc: 'Stock permanente de repuestos originales para todos los modelos fabricados. Envíos a todo el país.' },
    { icon: '📞', titulo: 'Postventa', desc: 'Seguimiento personalizado después de la compra. Garantía en todos nuestros productos y soporte técnico permanente.' },
    { icon: '📚', titulo: 'Capacitación', desc: 'Capacitamos a los operarios en el uso correcto de cada equipo para maximizar su rendimiento y vida útil.' },
  ]
  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #1B273D 0%, #0d1829 100%)', padding: '80px 20px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <p style={{ color: '#e3000c', fontSize: '10px', letterSpacing: '4px', fontWeight: 700, fontFamily: 'Montserrat, sans-serif', marginBottom: '8px' }}>SOPORTE</p>
          <h1 style={{ color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(28px, 4vw, 52px)', margin: 0 }}>Servicios</h1>
        </div>
      </div>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '80px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px' }}>
          {servicios.map(s => (
            <div key={s.titulo} style={{ border: '1px solid #eee', borderRadius: '12px', padding: '28px' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>{s.icon}</div>
              <h3 style={{ color: '#1B273D', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '18px', marginBottom: '10px' }}>{s.titulo}</h3>
              <p style={{ color: '#4a5568', fontSize: '14px', lineHeight: 1.7, margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '60px', background: '#f0f4f9', borderRadius: '12px', padding: '32px', textAlign: 'center' }}>
          <h3 style={{ color: '#1B273D', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '22px', marginBottom: '8px' }}>Servicio técnico</h3>
          <p style={{ color: '#4a5568', marginBottom: '0' }}>📞 3562515968 — Lunes a Viernes 7:00–18:00</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create /concesionarios page**

```typescript
// app/(public)/concesionarios/page.tsx
export default function ConcesionariosPage() {
  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #1B273D 0%, #0d1829 100%)', padding: '80px 20px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <p style={{ color: '#e3000c', fontSize: '10px', letterSpacing: '4px', fontWeight: 700, fontFamily: 'Montserrat, sans-serif', marginBottom: '8px' }}>RED DE DISTRIBUCIÓN</p>
          <h1 style={{ color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(28px, 4vw, 52px)', margin: 0 }}>Concesionarios</h1>
        </div>
      </div>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '80px 20px' }}>
        <p style={{ color: '#4a5568', fontSize: '16px', marginBottom: '40px', lineHeight: 1.7 }}>
          Contamos con una red de concesionarios oficiales en todo el país. Encontrá tu distribuidor más cercano.
        </p>
        <div style={{ borderRadius: '12px', overflow: 'hidden', marginBottom: '40px' }}>
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3408.5!2d-62.0!3d-30.7!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2sMorteros%2C+C%C3%B3rdoba!5e0!3m2!1ses!2sar!4v1"
            width="100%"
            height="400"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
          />
        </div>
        <p style={{ color: '#666', fontSize: '14px', textAlign: 'center' }}>
          Para información sobre concesionarios, contactanos al <strong>(03562) 404141</strong> o escribinos a <strong>consultas@gergolet.com.ar</strong>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create /financiacion page**

```typescript
// app/(public)/financiacion/page.tsx
import { createClient } from '@/lib/supabase/server'

export default async function FinanciacionPage() {
  const supabase = await createClient()
  const [{ data: bancos }, { data: configRow }] = await Promise.all([
    supabase.from('bancos').select('*').eq('activo', true).order('orden'),
    supabase.from('config').select('*').eq('clave', 'financiacion_texto').single(),
  ])
  const texto = (configRow as any)?.valor ?? ''

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #1B273D 0%, #0d1829 100%)', padding: '80px 20px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <p style={{ color: '#e3000c', fontSize: '10px', letterSpacing: '4px', fontWeight: 700, fontFamily: 'Montserrat, sans-serif', marginBottom: '8px' }}>OPCIONES DE PAGO</p>
          <h1 style={{ color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(28px, 4vw, 52px)', margin: 0 }}>Financiación</h1>
        </div>
      </div>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '80px 20px', textAlign: 'center' }}>
        {texto && <p style={{ color: '#4a5568', fontSize: '17px', lineHeight: 1.8, marginBottom: '56px' }}>{texto}</p>}
        {bancos && bancos.length > 0 ? (
          <>
            <h2 style={{ color: '#1B273D', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '24px', marginBottom: '32px' }}>Bancos disponibles</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', justifyContent: 'center' }}>
              {bancos.map(b => (
                <div key={b.id} style={{ background: '#f0f4f9', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 24px', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '14px', color: '#1B273D' }}>
                  {b.nombre}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p style={{ color: '#999' }}>Consultanos por las opciones de financiación disponibles.</p>
        )}
        <div style={{ marginTop: '60px', background: '#1B273D', borderRadius: '12px', padding: '32px' }}>
          <p style={{ color: '#aec6e8', fontSize: '15px', margin: '0 0 8px' }}>¿Necesitás más información sobre financiación?</p>
          <p style={{ color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '18px', margin: 0 }}>📞 (03562) 404141 | 3562509167</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create /contacto page**

```typescript
// app/(public)/contacto/page.tsx
'use client'
import { useState } from 'react'

export default function ContactoPage() {
  const [form, setForm] = useState({ nombre: '', email: '', mensaje: '' })
  const [enviado, setEnviado] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    // TODO: connect to /api/contacto route with Resend
    await new Promise(r => setTimeout(r, 800))
    setEnviado(true)
    setLoading(false)
  }

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #1B273D 0%, #0d1829 100%)', padding: '80px 20px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <p style={{ color: '#e3000c', fontSize: '10px', letterSpacing: '4px', fontWeight: 700, fontFamily: 'Montserrat, sans-serif', marginBottom: '8px' }}>COMUNICATE</p>
          <h1 style={{ color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(28px, 4vw, 52px)', margin: 0 }}>Contacto</h1>
        </div>
      </div>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '80px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '60px' }}>
        <div>
          <h2 style={{ color: '#1B273D', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '24px', marginBottom: '24px' }}>Información de contacto</h2>
          {[['📍', 'Dirección', 'Blvd. Eva Perón 1257, Morteros, Córdoba'],['📞', 'Teléfono', '(03562) 404141'],['📱', 'Ventas', '3562509167 | 3562560496 | 3562453253'],['🔧', 'Servicio técnico', '3562515968'],['✉️', 'Email', 'consultas@gergolet.com.ar'],['🕐', 'Horario', 'Lun–Vie 7:00–12:00 / 14:00–18:00']].map(([icon, label, value]) => (
            <div key={label} style={{ display: 'flex', gap: '14px', marginBottom: '20px' }}>
              <span style={{ fontSize: '20px', marginTop: '2px' }}>{icon}</span>
              <div>
                <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '12px', color: '#999', letterSpacing: '1px', marginBottom: '2px' }}>{label}</div>
                <div style={{ color: '#1B273D', fontSize: '14px' }}>{value}</div>
              </div>
            </div>
          ))}
        </div>
        <div>
          <h2 style={{ color: '#1B273D', fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '24px', marginBottom: '24px' }}>Envianos un mensaje</h2>
          {enviado ? (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '20px', color: '#166534', textAlign: 'center' }}>
              ✓ Mensaje enviado. Te contactaremos a la brevedad.
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[['Nombre completo', 'nombre', 'text'], ['Email', 'email', 'email']].map(([label, field, type]) => (
                <input key={field} type={type} placeholder={label} required value={form[field as keyof typeof form]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '12px 14px', fontSize: '14px' }} />
              ))}
              <textarea placeholder="Mensaje" required rows={5} value={form.mensaje} onChange={e => setForm(f => ({ ...f, mensaje: e.target.value }))} style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '12px 14px', fontSize: '14px', resize: 'none' }} />
              <button type="submit" disabled={loading} style={{ background: '#e3000c', color: '#fff', border: 'none', borderRadius: '6px', padding: '14px', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '13px', letterSpacing: '1px', cursor: 'pointer' }}>
                {loading ? 'ENVIANDO...' : 'ENVIAR MENSAJE'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: empresa, servicios, concesionarios, financiacion, contacto pages"
```

---

## Task 8: Admin layout + panel marketing (productos)

**Files:**
- Create: `app/admin/layout.tsx`
- Create: `app/admin/marketing/page.tsx`
- Create: `app/admin/marketing/productos/page.tsx`
- Create: `app/admin/marketing/categorias/page.tsx`
- Create: `components/admin/AdminSidebar.tsx`
- Create: `components/admin/ProductoForm.tsx`

- [ ] **Step 1: Create admin layout**

```typescript
// app/admin/layout.tsx
export const dynamic = 'force-dynamic'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <AdminSidebar />
      <main style={{ flex: 1, padding: '32px', overflow: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Create AdminSidebar**

```typescript
// components/admin/AdminSidebar.tsx
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const isMarketing = pathname.startsWith('/admin/marketing')
  const isOwner = pathname.startsWith('/admin/owner')

  const links = isMarketing
    ? [{ href: '/admin/marketing', label: '📊 Dashboard' }, { href: '/admin/marketing/productos', label: '⚙️ Productos' }, { href: '/admin/marketing/categorias', label: '🏷️ Categorías' }]
    : [{ href: '/admin/owner', label: '📊 Dashboard' }, { href: '/admin/owner/bancos', label: '🏦 Bancos' }]

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside style={{ width: '220px', background: '#1B273D', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '24px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <img src="/logo.png" alt="GEA Gergolet" style={{ height: '36px' }} />
        <p style={{ color: '#7a9cc4', fontSize: '10px', margin: '6px 0 0', letterSpacing: '1px' }}>
          {isMarketing ? 'MARKETING' : 'ADMINISTRACIÓN'}
        </p>
      </div>
      <nav style={{ flex: 1, padding: '16px 12px' }}>
        {links.map(link => (
          <Link key={link.href} href={link.href} style={{ display: 'block', padding: '10px 12px', borderRadius: '6px', color: pathname === link.href ? '#fff' : '#aec6e8', background: pathname === link.href ? '#e3000c' : 'transparent', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: '13px', textDecoration: 'none', marginBottom: '4px' }}>
            {link.label}
          </Link>
        ))}
      </nav>
      <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={handleLogout} style={{ width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: '#aec6e8', borderRadius: '6px', padding: '9px', fontSize: '12px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' }}>
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Create ProductoForm component**

```typescript
// components/admin/ProductoForm.tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { slugify } from '@/lib/utils'
import type { Producto, Categoria } from '@/lib/supabase/types'

interface Props {
  initial?: Partial<Producto>
  categorias: Categoria[]
  onSuccess: () => void
  onCancel: () => void
}

export function ProductoForm({ initial, categorias, onSuccess, onCancel }: Props) {
  const supabase = createClient()
  const [form, setForm] = useState({
    nombre: initial?.nombre ?? '',
    slug: initial?.slug ?? '',
    descripcion_corta: initial?.descripcion_corta ?? '',
    descripcion_completa: initial?.descripcion_completa ?? '',
    categoria_id: initial?.categoria_id ?? '',
    activo: initial?.activo ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handleNombreChange(nombre: string) {
    setForm(f => ({ ...f, nombre, slug: initial ? f.slug : slugify(nombre) }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = { ...form, categoria_id: form.categoria_id || null }
    const { error: err } = initial?.id
      ? await supabase.from('productos').update(payload).eq('id', initial.id)
      : await supabase.from('productos').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    onSuccess()
  }

  const inputStyle = { border: '1px solid #ddd', borderRadius: '6px', padding: '9px 12px', fontSize: '14px', width: '100%', boxSizing: 'border-box' as const }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label style={{ fontSize: '12px', fontWeight: 700, color: '#555', display: 'block', marginBottom: '4px' }}>Nombre *</label>
        <input value={form.nombre} onChange={e => handleNombreChange(e.target.value)} required style={inputStyle} />
      </div>
      <div>
        <label style={{ fontSize: '12px', fontWeight: 700, color: '#555', display: 'block', marginBottom: '4px' }}>Slug (URL)</label>
        <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} style={inputStyle} />
      </div>
      <div>
        <label style={{ fontSize: '12px', fontWeight: 700, color: '#555', display: 'block', marginBottom: '4px' }}>Categoría</label>
        <select value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))} style={inputStyle}>
          <option value="">— Sin categoría —</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: '12px', fontWeight: 700, color: '#555', display: 'block', marginBottom: '4px' }}>Descripción corta</label>
        <input value={form.descripcion_corta} onChange={e => setForm(f => ({ ...f, descripcion_corta: e.target.value }))} style={inputStyle} />
      </div>
      <div>
        <label style={{ fontSize: '12px', fontWeight: 700, color: '#555', display: 'block', marginBottom: '4px' }}>Descripción completa</label>
        <textarea value={form.descripcion_completa} onChange={e => setForm(f => ({ ...f, descripcion_completa: e.target.value }))} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} id="activo" />
        <label htmlFor="activo" style={{ fontSize: '14px', color: '#333' }}>Visible en el sitio</label>
      </div>
      {error && <p style={{ color: '#e3000c', fontSize: '13px', margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="submit" disabled={saving} style={{ flex: 1, background: '#e3000c', color: '#fff', border: 'none', borderRadius: '6px', padding: '11px', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancel} style={{ flex: 1, background: '#f0f4f9', color: '#1B273D', border: 'none', borderRadius: '6px', padding: '11px', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Create marketing productos admin page**

```typescript
// app/admin/marketing/productos/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ProductoForm } from '@/components/admin/ProductoForm'
import type { Producto, Categoria } from '@/lib/supabase/types'

export default function AdminProductosPage() {
  const supabase = createClient()
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Producto | null>(null)

  async function fetchAll() {
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase.from('productos').select('*').order('created_at', { ascending: false }),
      supabase.from('categorias').select('*').order('orden'),
    ])
    setProductos(prods ?? [])
    setCategorias(cats ?? [])
  }

  useEffect(() => { fetchAll() }, [])

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este producto?')) return
    await supabase.from('productos').delete().eq('id', id)
    fetchAll()
  }

  const thStyle = { padding: '10px 14px', textAlign: 'left' as const, fontFamily: 'Montserrat, sans-serif', fontSize: '11px', fontWeight: 700, color: '#666', letterSpacing: '1px', borderBottom: '2px solid #eee' }
  const tdStyle = { padding: '12px 14px', borderBottom: '1px solid #f0f4f9', fontSize: '14px', color: '#333' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '24px', color: '#1B273D', margin: 0 }}>Productos</h1>
        <button onClick={() => { setEditing(null); setShowForm(true) }} style={{ background: '#e3000c', color: '#fff', border: 'none', borderRadius: '6px', padding: '10px 20px', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
          + Nuevo producto
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '10px', padding: '24px', marginBottom: '28px' }}>
          <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, marginBottom: '20px' }}>{editing ? 'Editar producto' : 'Nuevo producto'}</h3>
          <ProductoForm initial={editing ?? undefined} categorias={categorias} onSuccess={() => { setShowForm(false); setEditing(null); fetchAll() }} onCancel={() => { setShowForm(false); setEditing(null) }} />
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #eee', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr><th style={thStyle}>Nombre</th><th style={thStyle}>Categoría</th><th style={thStyle}>Estado</th><th style={thStyle}>Acciones</th></tr>
          </thead>
          <tbody>
            {productos.map(p => (
              <tr key={p.id}>
                <td style={tdStyle}><div style={{ fontWeight: 600 }}>{p.nombre}</div><div style={{ color: '#999', fontSize: '12px' }}>/productos/{p.slug}</div></td>
                <td style={tdStyle}>{categorias.find(c => c.id === p.categoria_id)?.nombre ?? '—'}</td>
                <td style={tdStyle}><span style={{ background: p.activo ? '#dcfce7' : '#fee2e2', color: p.activo ? '#166534' : '#991b1b', padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>{p.activo ? 'Visible' : 'Oculto'}</span></td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => { setEditing(p); setShowForm(true) }} style={{ color: '#1B273D', background: 'none', border: 'none', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>Editar</button>
                    <button onClick={() => handleDelete(p.id)} style={{ color: '#e3000c', background: 'none', border: 'none', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
            {productos.length === 0 && <tr><td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: '#999', padding: '40px' }}>No hay productos aún</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create marketing categorias admin page**

```typescript
// app/admin/marketing/categorias/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { slugify } from '@/lib/utils'
import type { Categoria } from '@/lib/supabase/types'

export default function AdminCategoriasPage() {
  const supabase = createClient()
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [nombre, setNombre] = useState('')
  const [saving, setSaving] = useState(false)

  async function fetchCategorias() {
    const { data } = await supabase.from('categorias').select('*').order('orden')
    setCategorias(data ?? [])
  }

  useEffect(() => { fetchCategorias() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    await supabase.from('categorias').insert({ nombre: nombre.trim(), slug: slugify(nombre), orden: categorias.length + 1 })
    setNombre('')
    setSaving(false)
    fetchCategorias()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar categoría?')) return
    await supabase.from('categorias').delete().eq('id', id)
    fetchCategorias()
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '24px', color: '#1B273D', marginBottom: '28px' }}>Categorías</h1>
      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '10px', padding: '24px', marginBottom: '24px' }}>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px' }}>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nueva categoría..." style={{ flex: 1, border: '1px solid #ddd', borderRadius: '6px', padding: '9px 12px', fontSize: '14px' }} />
          <button type="submit" disabled={saving} style={{ background: '#e3000c', color: '#fff', border: 'none', borderRadius: '6px', padding: '9px 20px', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
            Agregar
          </button>
        </form>
      </div>
      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '10px', overflow: 'hidden' }}>
        {categorias.map((c, i) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: i < categorias.length - 1 ? '1px solid #f0f4f9' : 'none' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px', color: '#1B273D' }}>{c.nombre}</div>
              <div style={{ fontSize: '11px', color: '#999' }}>/{c.slug}</div>
            </div>
            <button onClick={() => handleDelete(c.id)} style={{ color: '#e3000c', background: 'none', border: 'none', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>Eliminar</button>
          </div>
        ))}
        {categorias.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>No hay categorías</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create marketing dashboard (index)**

```typescript
// app/admin/marketing/page.tsx
import Link from 'next/link'

export default function MarketingDashboard() {
  return (
    <div>
      <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '28px', color: '#1B273D', marginBottom: '8px' }}>Panel de Marketing</h1>
      <p style={{ color: '#666', marginBottom: '40px' }}>Gestión de productos y categorías del sitio web</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {[{ href: '/admin/marketing/productos', icon: '⚙️', title: 'Productos', desc: 'Crear, editar y gestionar el catálogo' }, { href: '/admin/marketing/categorias', icon: '🏷️', title: 'Categorías', desc: 'Organizar las líneas de productos' }].map(card => (
          <Link key={card.href} href={card.href} style={{ background: '#fff', border: '1px solid #eee', borderRadius: '12px', padding: '24px', textDecoration: 'none', display: 'block' }}>
            <div style={{ fontSize: '28px', marginBottom: '12px' }}>{card.icon}</div>
            <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '16px', color: '#1B273D', marginBottom: '4px' }}>{card.title}</h3>
            <p style={{ color: '#666', fontSize: '13px', margin: 0 }}>{card.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: admin marketing panel — products and categories CRUD"
```

---

## Task 9: Admin panel de dueños (bancos + config)

**Files:**
- Create: `app/admin/owner/page.tsx`
- Create: `app/admin/owner/bancos/page.tsx`

- [ ] **Step 1: Create owner bancos page**

```typescript
// app/admin/owner/bancos/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Banco } from '@/lib/supabase/types'

export default function AdminBancosPage() {
  const supabase = createClient()
  const [bancos, setBancos] = useState<Banco[]>([])
  const [texto, setTexto] = useState('')
  const [savingTexto, setSavingTexto] = useState(false)

  async function fetchAll() {
    const [{ data: b }, { data: c }] = await Promise.all([
      supabase.from('bancos').select('*').order('orden'),
      supabase.from('config').select('*').eq('clave', 'financiacion_texto').single(),
    ])
    setBancos(b ?? [])
    setTexto((c as any)?.valor ?? '')
  }

  useEffect(() => { fetchAll() }, [])

  async function toggleBanco(id: string, activo: boolean) {
    await supabase.from('bancos').update({ activo }).eq('id', id)
    setBancos(bs => bs.map(b => b.id === id ? { ...b, activo } : b))
  }

  async function saveTexto(e: React.FormEvent) {
    e.preventDefault()
    setSavingTexto(true)
    await supabase.from('config').upsert({ clave: 'financiacion_texto', valor: texto })
    setSavingTexto(false)
  }

  const activos = bancos.filter(b => b.activo).length

  return (
    <div>
      <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '24px', color: '#1B273D', marginBottom: '28px' }}>Financiación</h1>

      {/* Texto introductorio */}
      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '10px', padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '16px', marginBottom: '12px', color: '#1B273D' }}>Texto introductorio</h3>
        <form onSubmit={saveTexto} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '10px 12px', fontSize: '14px', resize: 'vertical' }} />
          <div>
            <button type="submit" disabled={savingTexto} style={{ background: '#1B273D', color: '#fff', border: 'none', borderRadius: '6px', padding: '9px 20px', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
              {savingTexto ? 'Guardando...' : 'Guardar texto'}
            </button>
          </div>
        </form>
      </div>

      {/* Lista de bancos */}
      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '16px', margin: 0, color: '#1B273D' }}>Bancos</h3>
          <span style={{ background: '#f0f4f9', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '12px', padding: '4px 10px', borderRadius: '10px', color: '#1B273D' }}>{activos} activos</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1px', background: '#f0f4f9' }}>
          {bancos.map(b => (
            <label key={b.id} style={{ background: '#fff', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={b.activo}
                onChange={e => toggleBanco(b.id, e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: '#e3000c', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '14px', color: '#1B273D', fontWeight: b.activo ? 600 : 400 }}>{b.nombre}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create owner dashboard**

```typescript
// app/admin/owner/page.tsx
import Link from 'next/link'

export default function OwnerDashboard() {
  return (
    <div>
      <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '28px', color: '#1B273D', marginBottom: '8px' }}>Administración</h1>
      <p style={{ color: '#666', marginBottom: '40px' }}>Panel de control del sitio web</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <Link href="/admin/owner/bancos" style={{ background: '#fff', border: '1px solid #eee', borderRadius: '12px', padding: '24px', textDecoration: 'none', display: 'block' }}>
          <div style={{ fontSize: '28px', marginBottom: '12px' }}>🏦</div>
          <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '16px', color: '#1B273D', marginBottom: '4px' }}>Bancos y Financiación</h3>
          <p style={{ color: '#666', fontSize: '13px', margin: 0 }}>Activar/desactivar bancos y editar el texto de la sección</p>
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: admin owner panel — banks toggle and financing text"
```

---

## Task 10: Build verification + deploy

**Files:**
- Modify: `package.json` (already has `--webpack`)

- [ ] **Step 1: Run production build**

```bash
npm run build
```
Expected: `✓ Compiled successfully` with no TypeScript errors. If errors, fix them before proceeding.

- [ ] **Step 2: Push to GitHub**

```bash
git remote add origin https://github.com/orvexaiii-hash/gergolet-web.git
git push -u origin master
```

- [ ] **Step 3: Deploy on Vercel**

1. Go to vercel.com → New Project → Import `gergolet-web`
2. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Click Deploy

- [ ] **Step 4: Create admin users in Supabase**

In Supabase → Authentication → Users → Add user:
- Email: `marketing@gergolet.com.ar`, password: (share with agency), then in user metadata add: `{ "role": "marketing" }`
- Email: `admin@gergolet.com.ar`, password: (share with owner), metadata: `{ "role": "owner" }`

To set metadata: after creating user, go to user detail → Edit user → User Metadata → paste `{"role":"marketing"}` (or `owner`).

- [ ] **Step 5: Final smoke test**

Visit the deployed URL and verify:
- [ ] Home page loads with products and bank previews
- [ ] `/productos` shows grid with category filters
- [ ] `/financiacion` shows active banks
- [ ] `/login` redirects marketing user → `/admin/marketing`
- [ ] `/login` redirects owner user → `/admin/owner`
- [ ] Marketing user can create/edit/delete a product
- [ ] Owner user can toggle banks on/off and they update on `/financiacion`

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: production build verified and deployed"
```
