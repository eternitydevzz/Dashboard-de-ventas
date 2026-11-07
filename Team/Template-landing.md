# Template de landings → dashboard

> Para el equipo. Cómo conectar cualquier landing al dashboard de ventas (dashboard.eternity.llc). Plan GHL, punto 3 (Cristian, 7 nov 2026).

## Qué es
Todas las landings mandan **el mismo JSON** (el «JSON v1») a **su propia dirección** del dashboard. **La landing solo manda datos**: las etiquetas, el pipeline y lo que se hace en GHL los decide el dashboard (la Entrada de esa landing y su workflow). Así no hacen falta los «Inbound Webhook» de pago de GHL.

```
Landing (formulario) → POST con el JSON v1 → Dashboard (guarda el lead al momento) → a los 5 min, GHL (contacto, etiquetas, oportunidades)
```

## La dirección
Cada landing tiene su **Entrada** en el dashboard (Administración → Entradas). Su dirección es:

```
https://dashboard.eternity.llc/api/webhooks/entrada/<clave>
```

- Se copia con **«Copiar dirección»** en la tarjeta de la Entrada.
- **La clave es secreta.** No la pegues en este documento ni en chats del equipo. En un servidor va en una variable de entorno (p. ej. `DASHBOARD_ENTRADA_URL` en Vercel).
- Si una clave se filtra, se cambia solo esa (en la Entrada: «Cambiar ajustes» → «Cambiar la dirección») y se pone la nueva en la landing.

## El JSON v1 (ejemplo)
Es el mismo que da el botón **«Para el programador» → «Copiar ejemplo de lo que tiene que mandar»** de cada Entrada, con su landing y su formulario ya puestos.

```json
{
  "template": "v1",
  "source": "codigomaestria",
  "form": "agenda",
  "step": "completo",
  "event_id": "id-unico-de-este-envio",
  "submitted_at": "2026-11-07T13:00:00.000Z",
  "name": "Ana Prueba",
  "first_name": "Ana",
  "last_name": "Prueba",
  "email": "ana@ejemplo.com",
  "phone": "+15550100000",
  "quiz": { "pregunta_1": "respuesta 1", "pregunta_2": "respuesta 2" },
  "quiz_completed": true,
  "quiz_answered": 2,
  "quiz_score": 10,
  "page_url": "https://ejemplo.com/landing",
  "referrer": "",
  "utm_source": "", "utm_medium": "", "utm_campaign": "", "utm_content": "", "utm_term": "", "utm_id": "",
  "fbclid": "", "gclid": "", "ttclid": "",
  "ip": "",
  "user_agent": "",
  "language": "es",
  "timezone": "America/New_York"
}
```

## Los campos
| Campo | Qué es | ¿Obligatorio? |
|---|---|---|
| `template` | Siempre `"v1"` | Sí |
| `source` | Nombre de la landing (p. ej. `codigomaestria`, `biblioteca`) | Sí |
| `form` | Qué formulario (p. ej. `registro`, `agenda`) | Sí |
| `step` | En qué paso va (p. ej. `datos`, `cuestionario`, `completo`) | No |
| `event_id` | El mismo en todos los envíos de la misma persona (datos y, después, cuestionario). El dashboard los junta en 1 lead por el email; si los primeros envíos solo traen el teléfono, el primero que trae email completa el lead de ese `event_id` en la misma Entrada | **Sí**, si algún paso va sin email |
| `submitted_at` | Fecha y hora del envío (ISO) | No |
| `name`, `first_name`, `last_name` | Nombre | Recomendado |
| `email`, `phone` | Email y teléfono (con prefijo, p. ej. `+1…`) | **Al menos uno** (si no, 422: se guarda el envío pero no crea lead) |
| `quiz` | Respuestas: `{ "id_pregunta": "respuesta" }` | No |
| `quiz_completed` | `true` si terminó el cuestionario (decide la etiqueta `-completo` / `-incompleto`) | No |
| `quiz_answered`, `quiz_score` | Cuántas contestó y su puntuación | No |
| `page_url`, `referrer` | Página del formulario y de dónde venía | No |
| `utm_*`, `fbclid`, `gclid`, `ttclid` | Seguimiento de la campaña (de la URL) | No |
| `ip` | IP de la persona. **Solo si se manda desde un servidor** (desde el navegador la pone el dashboard) | No |
| `user_agent`, `language`, `timezone` | Navegador, idioma y zona horaria | No |

**No mandar:** `tags` (las etiquetas las pone el dashboard), los `quiz_*` repetidos sueltos ni `headers`. El dashboard guarda **todo** lo que llega, así que un campo de más no rompe nada.

## Qué responde el dashboard
| | |
|---|---|
| **200** | Guardado |
| **400** | El JSON está mal escrito |
| **404** | La dirección no existe o la Entrada está apagada |
| **413** | Demasiado grande (más de 500 KB) |
| **422** | No trae email ni teléfono: el envío se guarda con el motivo, pero no crea lead |
| **429** | Demasiados envíos (más de 300 por minuto): esperar y reintentar |
| **500** | Error del dashboard: reintentar |

## Código listo para copiar
`Team/templates/enviar-al-dashboard.js`, con dos versiones:
- **Navegador** (`enviarAlDashboard`): la página manda desde el navegador. 3 intentos de 5 s; lee los UTM de la URL.
- **Servidor** (`enviarAlDashboardServidor`, Node 18+ / Vercel): 2 intentos de 5 s; manda la IP de la persona en `ip`.

## Pasos para conectar una landing nueva
1. **Leer lo de hoy:** qué manda la landing y qué hace su workflow de GHL (campos, etiqueta, pipeline, columna y ramas).
2. **Crear su Entrada y su workflow** (siempre con workflow, decisión de Cristian del 7 nov). En Administración → Entradas → «Conectar una landing nueva» (nombre, landing, formulario, desde dónde envía y pipeline). En «Cambiar ajustes» → «Qué hacer en GHL»: campos, pipelines de GHL, etiqueta base y espera de 5 min, **con «Mandar a GHL» apagado**. Después, **«Probar como workflow»** en su tarjeta, y en Administración → Workflows se ajusta (ramas, más pasos) hasta que haga lo mismo que su workflow de GHL.
3. **Cambiar la landing** para que mande el JSON v1 a su dirección con `enviar-al-dashboard.js` (navegador o servidor). Fuera la URL del webhook de GHL.
4. **Probar** con leads de prueba (`info+<landing>N@eternity.llc`, teléfonos 555-01xx): en el dashboard (1 lead, su pipeline, envío en verde) y en GHL (contacto, campos, etiquetas, oportunidades).
5. Con las pruebas bien (el workflow en prueba «coincide»), **«Pasar a real»** el workflow, **publicar** la landing y **apagar** su workflow de GHL (o solo su rama).
6. **Vigilar 24 h**: Administración → Entradas sin envíos en rojo.
7. **Apuntar cómo volver atrás** y pasar los contactos de prueba a Cristian para borrarlos.

Para Claude hay una skill que hace estos pasos: `Team/skills/conectar-web-al-dashboard`.
