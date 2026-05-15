# VENVIS Wake Word — Setup

## Qué necesitás (una sola vez, 10 minutos)

---

### Paso 1 — Crear cuenta gratuita en Picovoice

1. Ir a **https://console.picovoice.ai** → Sign Up (gratis)
2. Una vez dentro, ir a **AccessKey** (menú lateral)
3. Copiar el Access Key (es una cadena larga de caracteres)

---

### Paso 2 — Crear el modelo de wake word "Venvis"

1. En el mismo console, ir a **Porcupine** → **Train**
2. Escribir el nombre: `Venvis`
3. Seleccionar plataforma: **Windows**
4. Hacer click en **Train** (tarda ~1 minuto)
5. Descargar el archivo `.ppn` generado
6. Renombrarlo a `venvis_windows.ppn`
7. Copiarlo a esta carpeta (`venvis/wake-word/`)

---

### Paso 3 — Crear el archivo .env

Crear un archivo llamado `.env` en esta misma carpeta con el contenido:

```
PORCUPINE_KEY=pegar_aqui_tu_access_key
```

---

### Paso 4 — Instalar dependencias

Ejecutar `instalar.bat` (si no lo hiciste antes, o para agregar pvporcupine)

---

### Paso 5 — Probar

Ejecutar `iniciar.bat`. Deberías ver:

```
VENVIS listo — decí 'Venvis' para activar
[esperando 'Venvis'...]
```

Decí "Venvis" → escucharás dos beeps → VENVIS está escuchando → hablá tu pregunta.

---

### Paso 6 — Arranque automático con Windows (opcional)

Ejecutar `autostart.bat` como administrador.
VENVIS arrancará automáticamente cada vez que iniciés sesión en Windows.

---

## Comandos de voz

| Decís | Efecto |
|-------|--------|
| `Venvis` | Activa el modo escucha |
| `Venvis, [pregunta]` | VENVIS responde |
| `Venvis chau` / `Venvis para` | Vuelve a esperar wake word |
| `Apagar Venvis` | Cierra el programa |
| Enter / Espacio | Interrumpe mientras VENVIS habla |

## Notas

- El modo activo dura 15 segundos de silencio. Si no hablás en ese tiempo, vuelve a esperar el wake word.
- Si VENVIS está hablando podés interrumpirlo con Enter o Espacio.
- El cliente funciona 100% offline (Whisper local) excepto para mandar el texto al servidor.
