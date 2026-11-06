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
- **Deep work fases 2 y 3 (Cristian, 6 nov, 19 h):** de seguido, sin interrumpirle. Permisos: subir y publicar la Biblioteca y el dashboard, poner variables en Vercel, crear/apagar Entradas, apagar con Playwright los workflows de GHL del cambio y crear leads de prueba reales (luego los borra él). Se salta la revisión entre fase 2 y 3 **si todo sale bien**; si algo falla, se para. En la agenda, reserva real de prueba y después se cancela. Al acabar, propuesta de diseño de la fase 4 (no se programa). **Dudas: se apuntan en «Dudas para Cristian» y se ven al final.**
- Claude no borra datos ni toca permisos de seguridad aunque tenga permiso: eso queda en la lista de limpieza.

## Dudas para Cristian (se ven al final)
- **Cuentas viejas (Cristian, 6 nov: «solo Eternity»).** En el Mac ya solo queda Eternity: `gh` con `eternitydevzz` (cristianortiz33 desconectado), git global y de cada repo como `eternitydevzz`, git usa `gh` para las claves y el CLI de Vercel es `info-79696548`. **Falta y lo hace Cristian** (son permisos de cuentas, Claude no puede): quitar `cristianortiz33` de colaborador en GitHub (repos `Dashboard-de-ventas` y `biblioteca-maestria`, Settings → Collaborators) y `cristianortizking33-7483` del equipo de Vercel si es miembro (Settings → Members). Lo que firmó antes esa cuenta (commits y despliegues viejos) no se puede borrar del historial sin reescribirlo.
- **`BIBLIOTECA/build.py` es peligroso hoy:** al ejecutarlo rehace `index.html` desde una fuente vieja (vuelve «AI» donde ya se cambió a «IA» y quita el script `CM_HAS_ACCESS`). Lo ejecuté el 6 nov, lo vi en el diff y lo deshice sin subir nada. Hay que arreglar su fuente antes de volver a usarlo. (Para la fase 3 no hacía falta: `web/*.js` se sirve con `max-age=0, must-revalidate`.)
- El workflow «0. AP - Biblioteca» (el que mandaba a la Entrada «GHL · Biblioteca») **no existe** en GHL ni en su carpeta; la Entrada no recibía nada desde el 16 oct. Se desactivó la Entrada igualmente.
- Decisión de Claude: la Entrada «Web · Biblioteca agenda» mete los leads nuevos en «1. Biblioteca Recursos» del dashboard (los que ya están no se mueven). ¿Otro pipeline?
- ¿Algún workflow o lista de GHL depende de la etiqueta `biblioteca recursos`? Con la fase 2 los leads nuevos de la Biblioteca ya no la llevan (llevan `biblioteca-form-…`). No comprobado.

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

#### Fase 1 · Estado (6 nov)
- [x] Código, migración aplicada en producción y publicado (PR #9). Tests de GitHub en verde (302 unitarios, 289 de integración).
- [x] Prueba real con la Entrada «Prueba GHL» y el contacto `info+pruebaghl@eternity.llc`: contacto, UTM, campo de situación, etiqueta, oportunidad en «1. Biblioteca Recursos» y cuestionario tardío (de `-incompleto` a `-completo`) bien en GHL. Sin duplicados ni «General».
- [x] **Arreglo de etiquetas** (PR #10, publicado): GHL guarda las etiquetas en minúsculas y la lectura de 60 s le devolvía al lead la `-incompleto` vieja. Comprobado con el lead de prueba: queda `recursos-ia`, `biblioteca-form-completo` tras la lectura.
- [x] Prueba de fallo con un **pipeline inválido** en «Prueba GHL» (decisión de Cristian: no tocar el token de Maestria): 5 intentos (`404: Pipeline not found`), fila roja, email «GHL: un lead de «Prueba GHL» no ha llegado» entregado a info@ (Resend) y «Reintentar» → `ok`, con 1 sola oportunidad en GHL.
- [x] Informe final de la fase 1 (6 nov).
- [ ] Los reintentos van cada **2 min**, no cada 1 (el siguiente se programa a +60 s y la lectura llega unos ms antes). Mejora: programarlo a +50 s.
- [ ] El aviso rojo de arriba del formulario («N envíos no llegaron a GHL») no lo vi en la prueba; la fila roja con «Reintentar» sí. Revisarlo.
- [ ] **Limpieza (Cristian):** borrar en GHL el contacto «Prueba GHL Claude» y su oportunidad. Decidir si se apaga o se borra la Entrada «Prueba GHL» y el lead de prueba del dashboard (no se repartió a ningún caller).

#### Pendientes apuntados (fuera de la fase 1; Cristian decide cuándo)
- [ ] La lectura de 60 s solo se lanza en proyectos con calendarios (`20261017120000_leer_ghl_cada_30s.sql`). Maestria los tiene; un proyecto sin calendarios nunca mandaría a GHL.
- [ ] Riesgo de bucle: si se enciende «Mandar a GHL» en la Entrada «GHL · Biblioteca» (la que alimenta un workflow de GHL), los leads irían y volverían. No está bloqueado.
- [ ] El llavero de macOS guarda una clave de GitHub de una cuenta sin identificar (`274756235`): un `git push` normal puede fallar con 403. Arreglo posible: `gh auth setup-git` (cambia la configuración global de git; con permiso de Cristian).
- [ ] En el repo hay cambios de Cristian sin commit: 3 docs borrados (`Arreglar-dashboard.md`, `plan-historial-10oct.md`, `plan-historial-11oct.md`) y `manual-branding-rojo.md` nuevo.
- [ ] La descripción de la integración «App Eternity (dashboard)» en GHL quedó vacía al añadir «Edit Opportunities» (antes decía «Solo lectura…», que ya no es verdad).

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

#### Fase 2 · Estado (6 nov, deep work)
- [x] Entrada «Web · Biblioteca registro» (`087b86d1…`): pipeline del dashboard «1. Biblioteca Recursos»; GHL `dE7go…` columna «Registrados» (`9cb965ae…`); 6 campos + 2 UTM; base `Biblioteca-form`; GHL encendido.
- [x] `BIBLIOTECA/api/signup.js` → `DASHBOARD_ENTRADA_URL` (puesta en Vercel, Production y Preview). Etiquetas `biblioteca-form-incompleto/-completo` en minúsculas (como GHL); fuera `recursos-ia`. Tests `node --test tests/` 4/4. PR eternitydevzz/biblioteca-maestria#1, publicado el 6 nov a las 19:40 UTC.
- [x] Preview con 3 leads reales (bib1 completo, bib2 incompleto, bib3 cuestionario tardío) y 1 en producción (bib4): en el dashboard 1 vez cada uno, en «1. Biblioteca Recursos», con su etiqueta y respuestas; en GHL contacto, 6 campos, UTM, etiqueta y oportunidad en «Registrados» (1 sola aunque haya varios envíos). Todos los envíos en `ok`.
- [x] Cambio: «0. AP - Biblioteca de recursos» → Draft (Playwright, 19:48 UTC). Entrada «GHL · Biblioteca» desactivada. «0. AP - Biblioteca» no existe (ver dudas).
- [x] Comprobado que los leads reales de la Biblioteca tampoco se reparten a callers hoy: sin cambio de comportamiento.
- [ ] **7 nov:** mirar en el monedero de GHL que ya no hay `inbound_webhook` de la Biblioteca.
- [ ] La primera semana: medir cuánto tardan en el cuestionario y ajustar la espera.
- **Para volver atrás:** volver a publicar el commit `6041cce` de la Biblioteca en Vercel, poner en Publish «0. AP - Biblioteca de recursos» y activar la Entrada «GHL · Biblioteca».

#### Fase 3 · Estado (6 nov): probada en preview, **NO publicada** (algo falló → se para)
- [x] Entrada «Web · Biblioteca agenda» (`bc00a154…`): 9 campos, GHL `dE7go…` columna `77b3ce38…`, base `Biblioteca-agenda`, completo con `quiz_completed`. Recibe solo del preview.
- [x] `web/programa.js` → la Entrada (rama `agenda-dashboard`, sin fusionar). En el preview, desde el navegador: `agenda_datos` 200 y `cuestionario` 200 (`quiz_completed=true`, `qualified=true`); reserva real el 12 nov 15:00 (Madrid), cita en el dashboard con closer y `confirmada`; cancelada en GHL a las 20:03 UTC.
- [x] En GHL: contacto con `biblioteca-agenda-completo`, campos de la agenda y la cita.
- [ ] **Fallo 1 (nuevo):** la oportunidad de la Biblioteca se queda en «Registrados». La rama BIBLIOTECA del workflow viejo la llevaba a `77b3ce38…`; el dashboard busca y, si ya hay una en ese pipeline, no hace nada. **Arreglo propuesto:** si ya existe y la Entrada tiene columna, moverla (`PUT /opportunities/{id}` con `pipelineStageId`, `opportunities.write`, ya en la especificación oficial). Con test.
- [ ] **Fallo 2:** los workflows del calendario de GHL crearon además una oportunidad en «0. Agendas Orgánico - Agendan», y la cita le dio al lead una tarjeta en «0. Agendas General» del dashboard. **Ya pasaba a veces con el sistema viejo** (2 de los 4 leads reales con `agenda biblioteca` tienen tarjeta en General). Hipótesis sin comprobar: el workflow del calendario mira la etiqueta `agenda biblioteca` (que ponía la rama BIBLIOTECA). Hay que leer «2. Agendan llamada…» en GHL antes de decidir (¿poner también `agenda biblioteca`?).
- **Para volver atrás:** no hace falta; producción sigue con el webhook `2f05f800…`.

### Fase 4 · Workflows visuales en el dashboard (estilo GHL)
#### Propuesta de diseño (Claude, 6 nov) — para revisar con Cristian, no se programa hasta su visto bueno
- **Qué es un workflow:** un disparador + una lista de pasos en orden (como GHL, pero en lista vertical, sin lienzo libre en la primera versión). Se guarda en una tabla `workflows` (JSON de pasos, versión, encendido/apagado).
- **Disparadores (v1):** llega a una Entrada · se añade una etiqueta · cambia de columna en el dashboard · se agenda / cancela una cita.
- **Acciones (v1):** crear/actualizar contacto en GHL (con campos unidos) · añadir/quitar etiqueta (GHL y dashboard) · crear o mover oportunidad en GHL · mover de columna en el dashboard · esperar X minutos · rama «si el campo… entonces…» (las reglas de hoy) · email con Resend.
- **Motor:** cada lead que entra crea una ejecución (`workflow_ejecuciones`: paso actual, hora del siguiente paso, intentos, error). La lectura de cada 60 s avanza las que tocan, como hoy los envíos a GHL: mismos reintentos, aviso en rojo, email y «Reintentar».
- **Pantalla:** Administración → Workflows: lista de workflows; dentro, tarjetas una debajo de otra con «+» entre pasos, el historial de cada lead (qué paso hizo y cuándo) y el interruptor.
- **Migración:** «Qué hacer en GHL» de cada Entrada se convierte en su workflow (Entrada → esperar 1 min → contacto → etiqueta → oportunidad); las reglas de pipeline pasan a ramas.
- **Subfases:** 4a motor + tabla, sin pantalla, rehaciendo la Biblioteca (mismo resultado que la fase 2) · 4b pantalla de solo lectura e historial · 4c edición · 4d disparadores de etiqueta, columna y cita.
- **Preguntas para Cristian:** ¿lista vertical vale o quieres lienzo como GHL desde el principio? ¿Qué workflow de GHL quieres pasar primero después de la Biblioteca? ¿Los emails de las secuencias entran aquí o siguen fuera?
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
