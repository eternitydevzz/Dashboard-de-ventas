# Plan · Leads al dashboard primero (sin webhooks de GHL)

> 6 nov 2026 (versión 3, con la fase 0 hecha). Al empezar la fase 1 se copia este plan a `app/docs/plan-GHL.md`, sustituyendo el borrador.

## Contexto

**Hoy:** web → «Inbound Webhook» de GHL (premium, $0,01 por uso) → workflow → dashboard. En octubre costó **$66,60** (6.672 usos, el 28 % del monedero).

**Queremos:** web → **dashboard.eternity.llc** → el dashboard hace en GHL, por la API, lo que hoy hace el workflow (contacto, campos, etiqueta y oportunidad). **Sin workflows de GHL en medio.** Después, un apartado de workflows visual dentro del dashboard.

## Decisiones de Cristian (6 nov)

| Tema | Decisión |
|---|---|
| Primera web | **Biblioteca**: primero el registro (`api/signup.js`) y después la agenda (`web/programa.js`) |
| Quién hace el trabajo en GHL | **Todo el dashboard por la API**: contacto, campos, etiqueta y oportunidad. Cero workflows de GHL para esto |
| Etiquetas | Las mismas en la web, el dashboard y GHL. Regla: `<Web>-<form>-completo/incompleto`. Registro: `Biblioteca-form-completo` / `Biblioteca-form-incompleto`. Agenda: `Biblioteca-agenda-completo` / `-incompleto`. Fuera `recursos-ia` |
| Un envío por lead | El dashboard espera **1 minuto** y manda a GHL **un solo envío**: `completo` si llegaron los datos y el cuestionario completo, `incompleto` si solo llegaron los datos |
| Cuestionario que llega tarde | Se actualiza en el dashboard y en GHL: respuestas, se quita `-incompleto` y se pone `-completo` |
| Si falla | La web solo manda al dashboard. El dashboard reintenta; si no lo consigue, **email a Cristian (Resend) y aviso en rojo** en Administración → Entradas, con botón «Reintentar» |
| Respuestas | También a GHL, en sus campos personalizados |
| Emails de la Biblioteca | Las 2 secuencias están en borrador y se quedan así (Cristian). Fuera del plan |
| Meta | La Biblioteca no manda píxel ni conversiones. Este plan no toca Meta |
| Workflows visuales | **Entran en este plan** como fase propia, después de la Biblioteca |
| Skill | En `app/.claude/skills/`, con una copia en `PROYECTOS/GENERAL/VENTAS/` y otra instalada en `~/.claude/skills/` |
| Alcance | Solo Maestria |

## Fase 0 · Hecha (6 nov). Lo comprobado

**API de GHL** (especificación oficial `highlevel-api-docs`, `apps/contacts.json`):
- `POST /contacts/upsert`, versión `2021-07-28`, permiso `contacts.write`. Devuelve `{ new, contact }`.
- **Su campo `tags` borra todas las etiquetas** del contacto. Las etiquetas se añaden con `POST /contacts/{id}/tags` y se quitan con `DELETE /contacts/{id}/tags`.
- Los campos personalizados van como `customFields: [{ id, field_value }]`.
- El upsert sigue el ajuste de la subcuenta. **Maestria tiene `allowDuplicateContact: false` y `allowDuplicateOpportunity: false`** (leído en GHL), así que reconoce al contacto existente por email o teléfono.
- `GET /workflows/` solo da nombre y estado; para ver qué hace un workflow no sirve.

**Workflows de GHL** (leídos con Playwright desde la web de GHL, sin tocar nada):
- **«0. AP - Biblioteca de recursos»** (`9e73fb97…`, publicado, 5.126 contactos en la espera, re-entrada encendida). Disparador: Inbound Webhook (es el destino de `GHL_WEBHOOK_URL`). Pasos:
  1. Crear contacto: nombre, email, teléfono, `source`; `utm_source` (`BPs2vrG7eqH7D3d5zJEf`) y `utm_campaign` (`q5wycj0YpQt8SVlLxXbQ`) los saca de la atribución de GHL.
  2. Campos:
     - ¿En qué situación estás hoy? `EsY9HSZfP5L1FT6h4nX2` ← `quiz.situacion`
     - ¿Qué experiencia tienes con IA? `aURzYuU0eAGE5rzVBwVa` ← `quiz.experiencia_ia`
     - ¿Qué quieres lograr en los próximos 90 días? `M4SywOWvbRFGltMoytwY` ← `quiz.objetivo_90_dias`
     - ¿Cuánto tiempo por semana le puedes dedicar? `r1RfHNKugO9dAP9ypflT` ← `quiz.tiempo_semanal`
     - …¿estás en condiciones de invertir en tu formación? `gQwpNPCXkU1wSvGCO99n` ← `quiz.inversion`
     - ¿Cuándo quieres empezar? `lORdzKid69t1PAN2ylEH` ← `quiz_inicio`
  3. Etiqueta `biblioteca recursos`.
  4. Oportunidad: pipeline `dE7go9T3Mi2zbIT4sGME`, columna `9cb965ae-6b38-4a7d-a86b-3d2e9f45bb8d`, abierta.
  5. Espera de 9.999 días.
  - **No manda SMS ni email.**
- **«2 . WH - FORM AGENDA GENERAL»** (`6dd710da…`, publicado, re-entrada encendida). Disparador: Inbound Webhook `2f05f800…`. Pasos:
  1. Crear contacto: nombre, email, teléfono.
  2. Campos:
     - situación `ILrgHLZsc1TX8lBYWzfM`
     - ingresos `IWPSlOz1dKbkwg8SvK9p`
     - relación con la IA `jvsMaWoh9FSMzuZ5pLHk`
     - objetivo a 12 meses `oYaZveSEzoLWPZ7hoM1M`
     - inversión `7I9zm2KGljAr1X4l6xmR`
     - «Lead cualificado?» `tYv72lGm4gMaK2l7eujl` ← `qualified`
     - `utm_source` `BPs2vrG7eqH7D3d5zJEf` ← `source`
     - urgencia `pLkktkvmSexGPkZpyW8J`
     - decisor `9MtM6cI7dArWZx725GuI`
  3. Ramas según `utm_source`: YouTube, **BIBLIOTECA**, Instagram, P1, Callers, Email, Webinar, DFY y «otro». Cada una crea la oportunidad en su pipeline y pone su etiqueta.
     - Rama BIBLIOTECA: pipeline `dE7go9T3Mi2zbIT4sGME`, columna `77b3ce38-39b2-446d-b734-f38bc29c88e2`, etiqueta `agenda biblioteca`.
  - No manda SMS ni email. Las citas las gestiona el calendario de GHL con sus propios workflows («2. Agendan llamada…»), que no usan webhook y no se tocan.
- **Carpeta «4. Biblioteca de recursos»:** «1. Email secuence» y «SECUENCIA EMAILS NUEVA» están en **borrador**.
- `AP - Regalos` (`c3bd1ba2…`): sin leer (la página no cargó). Se lee en la fase 7.

**No se pudo comprobar:**
- **El valor de `GHL_WEBHOOK_URL`:** en Vercel es una variable «sensitive» y no se puede leer. Por el workflow se sabe que es el de «0. AP - Biblioteca de recursos»; su id `/hooks/…` no se ve.
- **Si el proyecto «Test» tiene GHL conectado y qué Entradas hay:** la lectura de Supabase de producción quedó bloqueada por permisos. Se mira en la fase 1 en el dashboard, con Playwright.

## Cómo se trabaja (Cristian, 6 nov)
- **Navegador: siempre Playwright** (GHL, el dashboard, Vercel…), con la sesión de Cristian. No el navegador integrado de la app.

## Fases (en orden; cada una se comprueba antes de pasar a la siguiente)

### Fase 1 · El dashboard hace en GHL lo que hacía el workflow (Claude, primero los tests)
- [ ] **Antes de empezar:**
  - Cristian añade el permiso **«Edit Opportunities»** (`opportunities.write`) a la integración privada «App Eternity (dashboard)», con el mismo token.
  - Claude mira en el dashboard, con Playwright, las Entradas que hay y si «Test» tiene GHL conectado.
- [ ] **Base de datos** (migración nueva):
  - en `entradas`: `ghl_activo`, `ghl_campos` (`{campo del envío: id de GHL}`), `ghl_pipeline_id`, `ghl_etapa_id`, `ghl_etiqueta_base` (p. ej. `Biblioteca-form`) y `ghl_espera_seg` (por defecto 60);
  - en `webhook_eventos`: `ghl_estado` (`esperando` / `ok` / `error`), `ghl_enviar_en`, `ghl_intentos` y `ghl_error`.
- [ ] **`src/lib/ghl.ts`**, funciones nuevas: `crearOActualizarContactoGhl` (upsert **sin `tags`**), `anadirEtiquetasGhl`, `quitarEtiquetasGhl` y `crearOportunidadGhl` (antes, comprobar en `apps/opportunities.json` la ruta, la versión y el upsert).
- [ ] **Nueva `src/lib/entrada-ghl.ts`** (sin base de datos, con tests unitarios). Junta los envíos de un mismo lead en uno solo:
  - datos;
  - campos con su id de GHL;
  - UTM del envío (`utm_source` y `utm_campaign` a sus campos);
  - etiqueta final `<base>-completo` o `<base>-incompleto`.
- [ ] **Entrada (`route.ts`):** el lead se guarda en el dashboard al momento, como hoy. Lo de GHL queda en `esperando`, con `ghl_enviar_en` = ahora + espera.
- [ ] **El envío a GHL lo hace la lectura de cada 60 s** (`/api/ghl/leer`), **de uno en uno por lead**. Pasos: upsert del contacto → añadir la etiqueta → crear la oportunidad (si la Entrada tiene pipeline) → guardar el `ghl_contact_id` en el lead → `ok`. La espera real queda entre 1 y 2 min.
- [ ] **Cuestionario tardío:** se actualizan los campos; si ahora está completo, se quita `-incompleto` y se añade `-completo`.
- [ ] **Reintentos y avisos:** hasta 5 intentos. Después, `error`, aviso en rojo con «Reintentar» y email a Cristian (`src/lib/email.ts`).
- [ ] **Sin duplicados con la lectura de 60 s** (test de integración): el contacto que crea el dashboard vuelve en la lectura como nuevo y tiene que quedar 1 lead, en su pipeline y sin pasar por «General».
- [ ] **Administración → Entradas** (`src/app/(panel)/admin/entradas.tsx`), formulario «Qué hacer en GHL»:
  - interruptor;
  - unir cada campo con su campo de GHL (desplegable con `camposGhl`);
  - pipeline y columna de GHL (con `pipelinesGhl`);
  - etiqueta base y espera;
  - lista de envíos con su estado.
- [ ] Tests unitarios y de integración (`tests/integracion/entrada.test.ts`) en verde, y prueba de fallo con un token malo en «Test».
- [ ] **Para volver atrás:** apagar el interruptor de la Entrada.

### Fase 2 · Punta a punta: registro de la Biblioteca
- [ ] Entrada «Web · Biblioteca registro»:
  - pipeline del dashboard «1. Biblioteca Recursos»;
  - en GHL: pipeline `dE7go9T3Mi2zbIT4sGME` y columna `9cb965ae…`;
  - los 6 campos y los 2 UTM unidos;
  - etiqueta base `Biblioteca-form`.
- [ ] En `BIBLIOTECA/api/signup.js`:
  - manda a la variable nueva `DASHBOARD_ENTRADA_URL` (Claude la pone en Vercel, con permiso de Cristian);
  - etiquetas `Biblioteca-form-incompleto` (registro) y `Biblioteca-form-completo` (cuestionario completo); fuera `recursos-ia`.
- [ ] Prueba primero en un **preview de Vercel**.
- [ ] **El cambio, todo junto:**
  - publicar la Biblioteca;
  - Cristian apaga «0. AP - Biblioteca de recursos» (y con él su webhook) y «0. AP - Biblioteca» (el que manda a la Entrada «GHL · Biblioteca»);
  - se desactiva esa Entrada.
- [ ] Con 3 leads de prueba (uno completo, uno incompleto y uno que termina tarde), comprobar:
  - en el dashboard: 1 vez cada uno, en su pipeline y con su etiqueta;
  - en GHL: contacto, etiqueta, los 6 campos, los UTM y la oportunidad en su columna;
  - al día siguiente, el monedero sin `inbound_webhook` de la Biblioteca.
- [ ] **Para volver atrás:** la versión anterior de la Biblioteca en Vercel y volver a encender los 2 workflows.
- [ ] **Cristian lo ve. Hasta entonces no se pasa a la fase 3.**
- [ ] La primera semana, medir con la hora de los envíos cuánto tarda la gente en el cuestionario y ajustar la espera si hace falta.

### Fase 3 · Agenda de la Biblioteca
- [ ] Entrada «Web · Biblioteca agenda»:
  - en GHL: pipeline `dE7go9T3Mi2zbIT4sGME` y columna `77b3ce38…`;
  - sus 9 campos unidos;
  - etiqueta base `Biblioteca-agenda`.
- [ ] En `programa.js`, la dirección de la Entrada en lugar del webhook `2f05f800…`. Va en el navegador, como hoy. Se mantienen los 3 intentos.
- [ ] El webhook `2f05f800…` y su workflow **no se apagan**: los sigue usando `codigomaestria.com/agenda`. Solo deja de llegarle la rama BIBLIOTECA.
- [ ] Preview, prueba con un lead (datos, respuestas y reserva), plan para volver atrás, y Cristian lo ve.

### Fase 4 · Workflows visuales en el dashboard (estilo GHL)
- [ ] **Diseño primero, con Cristian, antes de programar.** Qué disparadores (llega a una Entrada, etiqueta, cambio de columna…), qué acciones (crear/actualizar en GHL, etiqueta, oportunidad, esperar, ramas por campo, email) y cómo se ve. Sale un plan propio por subfases.
- [ ] Punto de partida: el formulario «Qué hacer en GHL» de la fase 1 pasa a ser el primer workflow (disparador «Entrada» → acciones). Las reglas de pipeline (`aplicarReglas`) pasan a ser ramas.
- [ ] Primera pasada de punta a punta con datos reales: rehacer la Biblioteca como workflow visual y que dé lo mismo que en la fase 2.

### Fase 5 · Skill «conectar-web-al-dashboard» (Claude)
- [ ] Con el caso real de la Biblioteca, usando `kit-creador-maestria:crear-skills`. Incluye:
  - la regla de etiquetas;
  - crear la Entrada (o el workflow) y unir los campos;
  - el código para mandar desde el servidor y desde el navegador;
  - la lista de pruebas y cómo volver atrás.
- [ ] Se guarda en `app/.claude/skills/conectar-web-al-dashboard/`, con una copia en `PROYECTOS/GENERAL/VENTAS/` y otra en `~/.claude/skills/`. Se prueba de verdad con la primera web de la fase 6.

### Fase 6 · El resto de webs de Maestria, una a una, con la skill
- [ ] Regalos 1 a 7 y `regalos-maestria` (webhook `37e6bc4c…`; antes, leer `AP - Regalos`), landing de agenda (`2f05f800…`; replicar sus ramas por `utm_source`) y optin (`83c32b0a…`). Cada una con preview y prueba, y Cristian la ve.
- [ ] Cristian apaga cada «Inbound Webhook» cuando todas sus webs están cambiadas.
- [ ] A final de mes, `inbound_webhook` cerca de $0 en el monedero.
- [ ] Actualizar `docs/GUIA-GHL.md` y `docs/plan.md`.

## Riesgos
- **Si el dashboard no responde**, el lead no llega a GHL hasta que vuelva. Lo cubren los reintentos, el email y el aviso. Hoy eso no afecta a SMS ni emails, porque la Biblioteca no manda ninguno.
- **Se empiezan a usar permisos de escritura** (`contacts.write` y `opportunities.write`). Si la clave se filtrara, se podrían cambiar contactos y oportunidades.
- **La dirección de la Entrada de la agenda va en el navegador**, como hoy el webhook. La frenan el límite de 300 por minuto y el filtro de email/teléfono.
- **Límite de la API de GHL:** 100 llamadas cada 10 s; hasta 4 llamadas por lead. Sobra; en un lanzamiento con picos, vigilarlo.
- **La fase 4 es grande:** tiene su propio diseño y plan antes de empezar.

## Comprobación
- `npm test` y los tests de GitHub en verde antes de cada publicación.
- Fases 2 y 3: leads de prueba revisados en el dashboard y en GHL (contacto, etiqueta, campos y oportunidad), en Administración → Entradas (`ok`) y en el monedero.
- Prueba de fallo con un token malo en «Test»: reintenta, queda en rojo, manda el email y, con «Reintentar», termina en `ok`.
