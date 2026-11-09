# Template de landings → dashboard

> Para el equipo. Cómo conectar cualquier web (página de GHL o web propia en Vercel) al dashboard de ventas (dashboard.eternity.llc). Puesto al día el 9 nov 2026 con el paso rápido de 1 minuto (A4, Cristian).
> Para Claude hay una skill que hace estos pasos: `Team/skills/conectar-web-al-dashboard`.

## Qué es
Todas las webs mandan **el mismo JSON** (el «JSON v1») a **su propia dirección** del dashboard. **La web solo manda datos**: las etiquetas, el pipeline y lo que se hace en GHL los decide el dashboard (la Entrada de esa web y su workflow). Así no hacen falta los «Inbound Webhook» de pago de GHL.

```
Web (formulario) → POST con el JSON v1 → Dashboard (guarda el lead al momento) → tras la espera de la Entrada (1 min por defecto), GHL (contacto, campos, etiquetas, oportunidades)
```

## Conectar una web nueva en 1 minuto
Para una web **nueva** (no tiene nada montado en GHL). Si la web ya mandaba a un webhook de GHL, ver «Pasar una web que ya existe» más abajo.

**Antes:** ¿la web es una **página de GHL** o una **web propia en Vercel**? Cambia solo el paso 3.

1. **Crear su Entrada** — dashboard → Administración → Entradas → «Conectar una landing nueva». 5 preguntas:
   nombre `Web · <web> <formulario>` · landing (p. ej. `codigomaestria`) · formulario (p. ej. `registro`) · desde dónde manda («Desde la página» en GHL o si el formulario manda desde el navegador; «Desde un servidor» si va por una función de Vercel) · pipeline del dashboard → «Crear y ver su dirección».
2. **Decir qué hace en GHL** — en su tarjeta, «Cambiar ajustes» → «Qué hacer en GHL»: los campos (lo que llega → campo de GHL), el pipeline (y columna) de GHL, la etiqueta base (`<web>-<formulario>` en minúsculas) y **«Mandar a GHL» encendido** → Guardar. Después, en la tarjeta, **«Probar como workflow»** (el botón solo sale con «Mandar a GHL» encendido).
3. **Poner el código en la web** (sección «Código listo para copiar»), con la dirección de «Copiar dirección»:
   - **Página de GHL:** el formulario tiene que ser **código propio** (un elemento HTML/código personalizado de la página, como `/agenda`). En ese código, al enviar, se llama a `enviarAlDashboard(DIRECCION, datos, { source: "<web>" })`. Publicar la página. *(Sin comprobar: un formulario nativo de GHL no puede mandar a una dirección de fuera sin un workflow de GHL.)*
   - **Web propia en Vercel:** desde el navegador, igual que arriba; desde una función de Vercel, `enviarAlDashboardServidor(process.env.DASHBOARD_ENTRADA_URL, datos, req)` y la variable `DASHBOARD_ENTRADA_URL` en Vercel (Production y Preview).
4. **1 lead de prueba** (`info+<web>1@eternity.llc`, teléfono 555-01xx): en la tarjeta de la Entrada sale el envío en verde y 1 lead en su pipeline; a los ~2 min, en GHL, el contacto con sus campos, la etiqueta `<base>-completo` (o `-incompleto`) y la oportunidad.
5. **Pasar a real** (Cristian, cuando lo vea bien): en la línea del workflow de la tarjeta, «Pasar a real». La app apaga sola «Mandar a GHL» y desde ese momento lo manda el workflow.

Mientras el workflow está en prueba, el lead ya llega a GHL por «Qué hacer en GHL»: la web está conectada desde el paso 4.

## Pasar una web que ya existe (tenía webhook de GHL)
Igual que arriba, más:
- **Antes del paso 1:** leer qué manda hoy la web y qué hace su workflow de GHL (campos, etiquetas, pipeline, columna y ramas), para copiarlo en «Qué hacer en GHL» y en el workflow (Administración → Workflows → «Editar»: ramas por `utm_source`, más pasos…).
- **Paso 3:** quitar de la web la dirección del webhook de GHL (apuntarla para volver atrás).
- **Después del paso 5:** apagar el workflow de GHL que recibía el webhook (o solo su rama, si lo comparten otras webs) y vigilar 24 h que la Entrada no tenga envíos en rojo.

## La dirección
```
https://dashboard.eternity.llc/api/webhooks/entrada/<clave>
```
- Se copia con **«Copiar dirección»** en la tarjeta de la Entrada.
- **La clave es secreta.** No la pegues en documentos ni en chats del equipo. En un servidor va en una variable de entorno (`DASHBOARD_ENTRADA_URL`). Si la web manda desde el navegador, la dirección se ve en el código de la página (igual que pasaba con los webhooks de GHL): por eso cada web tiene la suya.
- Si una clave se filtra: en la Entrada, «Cambiar ajustes» → «Cambiar la dirección», y se pone la nueva en la web. La vieja deja de funcionar al momento.

## El JSON v1 (ejemplo)
Es el mismo que da el botón **«Para el programador» → «Copiar ejemplo de lo que tiene que mandar»** de cada Entrada, con su landing y su formulario ya puestos.

```json
{
  "template": "v1",
  "source": "codigomaestria",
  "form": "agenda",
  "step": "completo",
  "event_id": "id-unico-de-esta-persona",
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
| `source` | Nombre de la web (p. ej. `codigomaestria`, `biblioteca`) | Sí |
| `form` | Qué formulario (p. ej. `registro`, `agenda`) | Sí |
| `step` | En qué paso va (p. ej. `datos`, `cuestionario`, `completo`) | No |
| `event_id` | El mismo en todos los envíos de la misma persona (datos y, después, cuestionario). El dashboard los junta en 1 lead por el email; si los primeros envíos solo traen el teléfono, el primero que trae email completa el lead de ese `event_id` en la misma Entrada | **Sí**, si algún paso va sin email |
| `submitted_at` | Fecha y hora del envío (ISO) | No |
| `name`, `first_name`, `last_name` | Nombre | Recomendado |
| `email`, `phone` | Email y teléfono (con prefijo, p. ej. `+1…`) | **Al menos uno** (si no, 422: se guarda el envío pero no crea lead) |
| `quiz` | Respuestas: `{ "id_pregunta": "respuesta" }` | No |
| `quiz_completed` | `true` si terminó el cuestionario (decide la etiqueta `-completo` / `-incompleto` en GHL) | No |
| `quiz_answered`, `quiz_score` | Cuántas contestó y su puntuación | No |
| `page_url`, `referrer` | Página del formulario y de dónde venía | No |
| `utm_*`, `fbclid`, `gclid`, `ttclid` | Seguimiento de la campaña (de la URL). El workflow puede ir por una rama u otra según `utm_source` | No |
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
| **429** | Demasiados envíos (más de 300 por minuto en esa dirección): esperar y reintentar |
| **500** | Error del dashboard: reintentar |

Acepta envíos desde cualquier web (CORS abierto, solo `POST`), así que funciona desde el navegador sin nada más.

## Código listo para copiar
`Team/templates/enviar-al-dashboard.js`, con dos versiones:
- **Navegador** (`enviarAlDashboard`): la página manda desde el navegador. 3 intentos de 5 s; lee los UTM de la URL.
- **Servidor** (`enviarAlDashboardServidor`, Node 18+ / Vercel): 2 intentos de 5 s; manda la IP de la persona en `ip`.

Ejemplo en una página (GHL o Vercel), al enviar el formulario:
```js
enviarAlDashboard("https://dashboard.eternity.llc/api/webhooks/entrada/<clave>", {
  form: "registro", step: "completo",
  name: nombre, email: email, phone: telefono,
}, { source: "mi-web" });
```

## Si algo falla
| Síntoma | Qué mirar |
|---|---|
| No aparece nada en la Entrada | La dirección de la web (que sea la de «Copiar dirección») y que la Entrada esté encendida. En la consola del navegador sale `[dashboard] no se pudo enviar`. |
| El envío sale en rojo | Abrirlo en «Ver los últimos leads»: dice el motivo (p. ej. «no trae email ni teléfono»). |
| El lead está en el dashboard pero no en GHL | Que «Mandar a GHL» esté encendido (o su workflow en real) y que haya pasado la espera. Si GHL falla, se reintenta solo (hasta 5 veces, 1 por minuto); después sale en rojo con «Reintentar» y llega un email a info@eternity.llc. |
| Una Entrada «Desde un workflow de GHL» no deja mandar a GHL | Es a propósito: sería un círculo sin fin. |
