# VENVIS Wake Word — Setup

## Sin cuentas, sin dependencias nuevas

El wake word usa Whisper directamente — el mismo modelo que ya está instalado.

---

## Instalación (primera vez)

1. Ejecutar `instalar.bat`
2. Ejecutar `iniciar.bat`

Eso es todo.

---

## Uso

```
VENVIS listo — decí 'Venvis' para activar
[esperando 'Venvis'...]
```

1. Decí **"Venvis"** → dos beeps → VENVIS está escuchando
2. Hablá tu pregunta o comando
3. VENVIS responde con voz

Después de responder, VENVIS queda activo 15 segundos esperando seguimiento.
Si no hablás, vuelve a esperar el wake word solo.

---

## Comandos de voz

| Decís | Efecto |
|-------|--------|
| `Venvis` | Activa el modo escucha |
| `Venvis, [pregunta]` | VENVIS responde |
| `Venvis chau` / `Venvis para` | Vuelve a esperar wake word |
| `Apagar Venvis` | Cierra el programa |
| Enter / Espacio | Interrumpe mientras VENVIS habla |

---

## Arranque automático con Windows

Ejecutar `autostart.bat` como administrador (una sola vez).
VENVIS arrancará automáticamente al iniciar sesión.

Para desactivarlo:
```
schtasks /delete /tn "VENVIS Wake Word" /f
```
