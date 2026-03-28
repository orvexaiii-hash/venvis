# Gergolet Agrícola — Rediseño Web
**Fecha:** 2026-03-28
**Cliente:** GEA Gergolet Agrícola (cliente de Orweb)
**Tipo:** Rediseño completo — estética + estructura + paneles de administración

---

## Objetivo

Renovar el sitio web de Gergolet Agrícola (gergolet.com.ar) con un diseño moderno Premium, manteniendo la identidad de marca actual, y agregar dos paneles de administración: uno para la agencia de marketing (gestión de productos) y otro para los dueños (gestión de bancos en financiación).

---

## Stack Técnico

- **Framework:** Next.js 16 (App Router, `force-dynamic`)
- **Base de datos:** Supabase (PostgreSQL + Storage para imágenes)
- **Estilos:** Tailwind CSS v4
- **Deploy:** Vercel
- **Autenticación:** Supabase Auth (2 roles: `marketing`, `owner`)

---

## Identidad Visual

- **Logo:** GEA Gergolet Agrícola (pinwheel rojo + texto "GEA" bold + "GERGOLET AGRÍCOLA") — mantener el actual
- **Color primario:** Rojo `#e3000c`
- **Color secundario:** Azul profundo `#1B273D`
- **Fondo:** Blanco `#ffffff` y gris claro `#f0f4f9`
- **Estilo:** Bold & Premium — hero oscuro, secciones alternadas blanco/gris azulado, tipografía grande y bold
- **Tipografía:** Montserrat (headings weight 900), Lato (body)

---

## Sitio Público — Páginas

### `/` Inicio
- Hero oscuro con logo, headline bold, CTA "Ver productos" y "Financiación", estadísticas (35+ años, 47 productos)
- Sección de productos destacados (grid 3 columnas, fondo blanco)
- Sección financiación (preview de bancos, fondo gris azulado)
- Sección contacto rápido (teléfonos + formulario básico)
- Footer con redes sociales, dirección, horarios

### `/empresa`
- Historia de la empresa
- Valores / pilares
- Instalaciones (galería de fotos)

### `/productos`
- Grid de productos con filtros por categoría
- Búsqueda por nombre
- Cada producto: foto, nombre, descripción corta, botón "Ver ficha"
- Página de detalle (`/productos/[slug]`): fotos, descripción completa, ficha técnica (PDF descargable)

### `/servicios`
- Servicio técnico
- Repuestos
- Postventa / garantía

### `/concesionarios`
- Lista de distribuidores por provincia
- Mapa embebido (Google Maps)

### `/financiacion`
- Texto introductorio (editable por dueños)
- Grid de logos de bancos activos (configurados desde el panel de dueños)

### `/contacto`
- Formulario (nombre, email, mensaje) — envía email via Resend o similar
- Mapa Google Maps (Morteros, Córdoba)
- Teléfonos y horarios
- Email: consultas@gergolet.com.ar

---

## Panel Admin — Agencia de Marketing (`/admin/marketing`)

Acceso restringido al rol `marketing`.

### Funcionalidades
- **Productos:** Crear / editar / eliminar productos
  - Campos: nombre, slug, categoría, descripción corta, descripción completa, fotos (upload múltiple a Supabase Storage), ficha técnica PDF (upload)
  - Vista en lista con búsqueda y filtro por categoría
- **Categorías:** Crear / editar / eliminar / reordenar categorías

### Restricciones
- No puede acceder al panel de dueños
- No puede modificar bancos ni textos de financiación

---

## Panel Admin — Dueños (`/admin/owner`)

Acceso restringido al rol `owner`.

### Funcionalidades
- **Bancos activos:** Lista completa de bancos argentinos con checkbox — tildar/destildar cuáles aparecen en `/financiacion`
  - Bancos precargados: Banco Nación, Provincia, Santander, Galicia, BBVA, HSBC, Macro, Supervielle, Credicoop, Patagonia, Ciudad, Córdoba, Entre Ríos, Itaú, ICBC, Brubank, Naranja X, Uala, Mercado Pago, Personal Pay
- **Texto de financiación:** Editor de texto simple para el párrafo introductorio de `/financiacion`

### Restricciones
- Puede ver productos pero no editarlos
- Acceso total solo a sección de financiación

---

## Base de Datos (Supabase)

```sql
-- Categorías de productos
categorias (id, nombre, slug, orden, created_at)

-- Productos
productos (
  id, nombre, slug, descripcion_corta, descripcion_completa,
  categoria_id → categorias,
  pdf_url, activo, orden, created_at
)

-- Imágenes de productos
producto_imagenes (id, producto_id → productos, url, orden, created_at)

-- Bancos
bancos (id, nombre, logo_url, activo, orden)

-- Configuración general (texto financiación, etc.)
config (clave TEXT PRIMARY KEY, valor TEXT)
```

### Row Level Security
- Público: solo lectura en `productos`, `categorias`, `producto_imagenes`, `bancos` (activo=true), `config`
- Rol `marketing`: CRUD en `productos`, `categorias`, `producto_imagenes`
- Rol `owner`: CRUD en `bancos`, `config`

---

## Estructura de Carpetas

```
gergolet-web/
├── app/
│   ├── (public)/          # Sitio público
│   │   ├── page.tsx       # Inicio
│   │   ├── empresa/
│   │   ├── productos/
│   │   │   └── [slug]/
│   │   ├── servicios/
│   │   ├── concesionarios/
│   │   ├── financiacion/
│   │   └── contacto/
│   ├── (auth)/
│   │   └── login/
│   └── admin/
│       ├── marketing/     # Panel agencia
│       └── owner/         # Panel dueños
├── components/
│   ├── layout/            # Nav, Footer
│   ├── productos/         # Grid, Card, Filtros
│   ├── finanzas/          # BancosList, BancosAdmin
│   └── ui/                # Button, Modal, Badge
├── lib/
│   ├── supabase/          # client.ts, server.ts, types.ts
│   └── utils.ts
└── supabase/
    └── schema.sql
```

---

## Decisiones de Diseño

1. **Sin Turbopack** — `next build --webpack` para compatibilidad con plugins
2. **`force-dynamic`** en layout raíz para evitar prerendering estático con Supabase
3. **Supabase Storage** para imágenes — bucket público `productos`
4. **Roles via Supabase Auth metadata** — `user_metadata.role: 'marketing' | 'owner'`
5. **Logos de bancos** — imágenes precargadas en el bucket, los dueños solo activan/desactivan
