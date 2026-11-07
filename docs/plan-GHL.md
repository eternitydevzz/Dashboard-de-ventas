# Plan · Leads al dashboard primero (sin webhooks de GHL)

> Versión 9 (7 nov 2026). Cada punto se explica solo, sin depender del chat. **Solo lo que falta.** Lo hecho (fases 0, 1 y 2, con sus pruebas) está en git:
> `git show a924227:docs/plan-GHL.md`.

## Dónde estamos

| Fase | Estado |
|---|---|
| 0 · Leer la API y los workflows de GHL | Hecha |
| 1 · El dashboard hace en GHL lo que hacía el workflow | Hecha y publicada (PR #9 y #10) |
| 2 · Registro de la Biblioteca | Hecha y publicada (biblioteca-maestria PR #1). Falta el seguimiento |
| 3 · Agenda de la Biblioteca | Publicada (6 nov, 20:23 UTC). Falta ponerla en «0. Agendas General» (A) y sus 2 oportunidades en GHL (B) |
| 4 · Workflows visuales | Diseño decidido por Cristian (lienzo como GHL, sin emails). Falta su plan propio |
| 5 · Skill «conectar-web-al-dashboard» (el manual de landings) | Después de A, B y C (decisión de Cristian) |
| 6 · Resto de webs | Pendiente. La primera, la landing de agenda de `codigomaestria.com` (después de la skill) |

**Objetivo:** web → dashboard.eternity.llc → el dashboard hace en GHL, por la API, contacto, campos, etiqueta y oportunidad. Sin «Inbound Webhook» de pago (en octubre: $66,60, el 28 % del monedero).

## Cómo se trabaja
- **Navegador: siempre Playwright** (GHL, dashboard, Vercel, Resend), con la sesión de Cristian.
- **Solo la cuenta de Eternity** (`eternitydevzz` en GitHub, `info-79696548` en Vercel). Nunca `cristianortiz33`.
- Tests primero. `npm test` y los tests de GitHub en verde antes de publicar.
- **Sin Docker en el Mac** (Cristian: ocupa mucha RAM). En local solo tipos, lint y unitarios; **los tests de integración corren en GitHub** al abrir un PR.
- **Se publica siempre con PR**: rama → PR → tests de GitHub en verde → fusionar en `main` (Vercel publica solo).
- **Permisos dados por Cristian (6 y 7 nov):** subir y publicar el dashboard y la Biblioteca, aplicar migraciones en producción (con `supabase db push --dry-run` antes), poner variables en Vercel, crear y cambiar Entradas, apagar workflows de GHL con Playwright y hacer pruebas reales con leads y citas de prueba (después se cancelan y Cristian borra los contactos).
- Si algo falla, se para y se pregunta. Las dudas se apuntan en «Para decidir» y se ven al final, sin interrumpir a Cristian.
- Claude no borra datos, no toca permisos de seguridad ni mete contraseñas: eso va en «Lo que hace Cristian».
- Cada punto del plan se explica solo (qué es, para qué sirve, qué se decidió); nunca «explicado en el chat».

## Decisiones de Cristian (siguen valiendo)
| Tema | Decisión |
|---|---|
| Quién hace el trabajo en GHL | El dashboard por la API. Cero workflows de GHL para esto |
| Etiquetas | Las mismas en la web, el dashboard y GHL: `<web>-<form>-completo/-incompleto`, **en minúsculas** (GHL las guarda así). Registro `biblioteca-form-…`, agenda `biblioteca-agenda-…` |
| Un envío por lead | Espera de 1 min y un solo envío; si el cuestionario llega tarde, se actualiza y pasa de `-incompleto` a `-completo` (nunca al revés) |
| Qué es «completo» | Que algún envío del lead traiga `quiz_completed` = true (lo manda la Biblioteca al terminar el cuestionario). Se puede cambiar por Entrada («Completo si llega a true») |
| Oportunidad en GHL | Buscar si el contacto ya tiene una en ese pipeline y crearla solo si no (el upsert de oportunidades de GHL no lleva `contactId`) |
| Etiquetas viejas | Se siguen poniendo en GHL además de las nuevas, por si algún workflow o lista las usa: registro `biblioteca recursos`, agenda `agenda biblioteca` |
| Agendas en el dashboard | Todas en «0. Agendas General» (decisión del 17 oct): antes de reservar en «Form», al reservar la cita las pasa a «Agendan». Con la etiqueta «Canal: …» desde el formulario |
| Agendas en GHL | Oportunidad en «0. Agendas Biblioteca» y en «0. Agendas General» (en General tienen que estar todas), en la primera columna. Al reservar, GHL las mueve. La de «0. Agendas Orgánico» que crea el calendario está bien |
| Registro en GHL | Oportunidad en «1. Biblioteca Recursos → Registrados»; ahí se queda aunque la persona agende |
| Leads duplicados (mismo teléfono, otro email) | Se quedan los 2; hay que hacer un plan para unirlos (sección «Plan para unir leads duplicados») |
| Manual para landings | Una skill (fase 5), no un documento. Va antes de pasar más landings |
| Workflows visuales (fase 4) | Lienzo como GHL; los emails de las secuencias siguen fuera; el primero tras la Biblioteca es la landing de agenda |
| Cambios de Cristian sin subir en el repo (3 docs borrados y `manual-branding-rojo.md`) | Claude no los toca |
| Si falla | 5 reintentos, después email a info@eternity.llc y aviso en rojo con «Reintentar» (Administración → Entradas) |
| Emails de la Biblioteca y Meta | Fuera del plan |
| Alcance | Solo Maestria |

---

## Lo que falta, en orden

### 0 · La Biblioteca sin webhooks de GHL — hecho el 6 nov; revisión del 7 nov
**Cómo viajan los datos hoy (los dos formularios ya no usan webhooks de GHL):**
- **Registro:** formulario → `biblioteca.codigomaestria.com/api/signup` (función de Vercel) → desde el servidor, POST al endpoint del dashboard `dashboard.eternity.llc/api/webhooks/entrada/<clave>` (Entrada «Web · Biblioteca registro», 2 intentos de 5 s). Publicado a las 19:40 UTC; probado en producción (bib4).
- **Agenda:** navegador → POST directo al mismo tipo de endpoint (Entrada «Web · Biblioteca agenda», 3 intentos). Publicado a las 20:23 UTC (biblioteca-maestria PR #2); probado en producción (bib5: `agenda_datos` 200, `cuestionario` 200, reserva y cancelación).
- En los dos casos el dashboard guarda el lead **al momento** y, al minuto, hace en GHL por la API: contacto, campos, etiqueta y oportunidad.
- Los leads que se perdían eran de **antes del cambio** (con el webhook viejo), según Cristian.

**Revisión del 7 nov (05:10 UTC), con datos de producción:**
- Registro: **21 envíos reales** desde las 20:19 UTC del 6 nov (último 04:53 UTC). Todos guardados en el dashboard; **20 en `ok` en GHL y 1 en `error`** (es el caso C: misma persona con dos emails).
- Agenda: **0 envíos reales** todavía (solo la prueba bib5).
- Monedero de GHL: **sin comprobar** (la página de facturación de GHL salía en blanco en Playwright).

**Orden decidido por Cristian (7 nov):** 1) A, B y C (la agenda está ahora en el pipeline equivocado en producción); 2) la skill de la fase 5, que es el manual para conectar landings; 3) la landing de agenda de `codigomaestria.com`.

**Queda, de más a menos importante (decisiones de Cristian del 7 nov, 06 h):**

**A · Agenda de la Biblioteca en el sitio correcto** (Claude, tests primero)
- *Qué está mal:* la Entrada «Web · Biblioteca agenda» mete los leads nuevos en «1. Biblioteca Recursos» del dashboard (decisión de Claude, equivocada). Y las agendas de la Biblioteca salen con «Canal: Otro» en vez de «Canal: Biblioteca» (**ya pasaba antes del cambio**: cita real del 28 oct con `canal = otro`), porque la agenda manda `utm_source=agenda-biblioteca` y `src/lib/canal.ts` solo reconoce `biblioteca`.
- *Decisión de Cristian:* en el dashboard, todas las agendas van a **«0. Agendas General»** (como se decidió el 17 oct, `canal.ts`), con su etiqueta **«Canal: Biblioteca»**. Antes de reservar, en la columna **«Form»**; al reservar, la cita la pasa a «Agendan» (como hoy).
- *Arreglo:*
  1. Entrada «Web · Biblioteca agenda» → pipeline del dashboard «0. Agendas General», columna «Form». Los leads que ya existen (de la Biblioteca) ganan su tarjeta en General, como hoy.
  2. **«Canal: Biblioteca» desde el formulario** (Cristian: sí, aunque no reserve), con una regla de la Entrada (`utm_source` igual a `agenda-biblioteca` → etiqueta «Canal: Biblioteca»). Sin código.
  3. `canal.ts`: `agenda-biblioteca` → canal Biblioteca, con test (para la cita).
  4. Corregir a «Biblioteca» el canal de la cita real del 28 oct y su etiqueta «Canal: Otro» → «Canal: Biblioteca» (Cristian: sí).

**B · Oportunidades de la agenda en GHL** (Claude, tests primero)
- *Decisión de Cristian:* en GHL, quien agenda desde la Biblioteca tiene oportunidad en **«0. Agendas Biblioteca»** (`wym2Ue4VUqkhsFoQJ5PK`) **y** en **«0. Agendas General»** (`zuQjPVJNbPpRlL0voy6d`): «en General tienen que aparecer siempre todas». Deja de usarse «1. Biblioteca Recursos → Form Agenda». La oportunidad extra que crean los workflows del calendario en «0. Agendas Orgánico» **está bien así** (no se toca).
- *Arreglo:* hoy una Entrada solo admite **un** pipeline de GHL. Cambio:
  1. Migración: `entradas.ghl_oportunidades jsonb` = lista de `{ pipeline_id, etapa_id }` (si está vacía, se usa el pipeline de siempre: compatible con lo que hay).
  2. `entrada-ghl.ts` y `ghl-envios.ts`: una oportunidad por cada pipeline de la lista (buscar → crear o mover a su columna).
  3. Administración → Entradas: «Oportunidades en GHL» como lista con «Añadir pipeline».
  4. Configurar la Entrada de la agenda con los 2 pipelines, **en la primera columna de cada uno** (Cristian). Para no depender de cómo elige GHL, el código busca el id de la primera columna con `GET /opportunities/pipelines`.
  5. **Al reservar, GHL ya mueve las oportunidades a «Agendan»** (Cristian): el dashboard no hace nada más.
  6. La oportunidad del registro en «1. Biblioteca Recursos → Registrados» **se queda ahí** cuando la persona agenda (Cristian).
  7. **Etiquetas viejas también en GHL** (Cristian, por si algún workflow o lista las usa): el registro pone además `biblioteca recursos` y la agenda `agenda biblioteca`. Migración: `entradas.ghl_etiquetas_extra text[]` (fijas, se añaden siempre; nunca se quitan).
- *Comprobar:* con el primer lead real de la agenda, 1 oportunidad en «0. Agendas Biblioteca» y 1 en «0. Agendas General» (más la de «Orgánico» del calendario), y ninguna nueva en «1. Biblioteca Recursos».

**C · La misma persona con dos emails y el mismo teléfono** (Claude, tests primero)
- *Qué pasó:* 6 nov, 23:06 y 23:07 UTC, teléfono …7112, emails `jmf…@gmail.com` y `jos…@gmail.com`. El dashboard creó 2 leads (`e7cc481b…` y `c407dcf9…`; los reconoce por email). GHL tiene 1 contacto (`oIEMl9RNaQEANZQnLWEb`; lo reconoce también por teléfono). Al guardar el contacto en el segundo lead chocó con el primero (`leads_proyecto_id_ghl_contact_id_key`) → 5 intentos → rojo y email. En GHL no se perdió nada.
- *Arreglo:* en `ghl-envios.ts`, si ese contacto de GHL ya es de otro lead del proyecto, no fallar: el envío queda `ok`, el segundo lead no guarda el id y en su historial se apunta «mismo contacto de GHL que el lead …». Después, «Reintentar» el envío en rojo (`0b087aa6…`).
- *Decisión de Cristian:* los 2 leads se quedan. **Pendiente: hacer un plan para unir duplicados** (ver «Plan para unir leads duplicados» abajo).

**Cómo se hacen A, B y C, paso a paso** (para no equivocarse):
1. **Tests primero (deben fallar):**
   - `canal.ts`: `agenda-biblioteca` → `biblioteca`.
   - `entrada-ghl.ts`: con una lista de pipelines salen varias oportunidades; con la lista vacía, la de siempre (compatible). Las etiquetas extra salen en el envío y en las del lead.
   - `ghl-envios.ts` (integración): 2 oportunidades en 2 pipelines; primera columna buscada con `GET /opportunities/pipelines`; una que ya existe **no se mueve** si la Entrada no fija columna (si no, al reenviar el cuestionario la sacaría de «Agendan», donde la puso GHL al reservar); etiquetas extra en GHL; el caso C (contacto de GHL de otro lead → `ok` + nota en el historial).
2. **Código:** `canal.ts`, `entrada-ghl.ts`, `ghl.ts` (mover solo si se pide), `ghl-envios.ts`, acción `guardarGhlEntrada` (valida la lista y las etiquetas) y formulario «Qué hacer en GHL» (lista de pipelines con «Añadir pipeline» y campo «Etiquetas fijas»).
3. **Migración** `entradas.ghl_oportunidades jsonb not null default '[]'` y `entradas.ghl_etiquetas_extra text[] not null default '{}'`. **Se aplica en producción antes de publicar el código**: el código nuevo lee esas columnas.
4. **PR, tests de GitHub en verde y publicar.**
5. **Configurar en producción:**
   - «Web · Biblioteca registro»: etiquetas fijas `biblioteca recursos`.
   - «Web · Biblioteca agenda»: pipeline del dashboard «0. Agendas General» (`7bf529f6…`), columna «Form» (`4a0469a9…`); regla `utm_source` igual a `agenda-biblioteca` → etiqueta «Canal: Biblioteca»; oportunidades en GHL «0. Agendas Biblioteca» (`wym2Ue4VUqkhsFoQJ5PK`) y «0. Agendas General» (`zuQjPVJNbPpRlL0voy6d`), primera columna; sin el pipeline viejo «1. Biblioteca Recursos»; etiquetas fijas `agenda biblioteca`.
6. **Datos:** cita real del 28 oct → canal `biblioteca` y su lead «Canal: Otro» → «Canal: Biblioteca». «Reintentar» el envío en rojo del caso C (`0b087aa6…`).
7. **Prueba real** con `info+bib6@eternity.llc` y teléfono de ficción 555-01xx: formulario de la agenda, reserva **comprobando el día elegido antes de confirmar** (el 6 nov una reserva de prueba cayó al día siguiente por un clic mal dado) y cancelación. Comprobar dashboard («0. Agendas General → Form», «Canal: Biblioteca», `ok`) y GHL (2 oportunidades en primera columna, etiquetas `biblioteca-agenda-…` y `agenda biblioteca`).

**D · Vigilar** (Claude, 7 nov por la tarde)
- [ ] Primeras agendas reales: dashboard (`ok`, «0. Agendas General», «Canal: Biblioteca») y GHL (oportunidades de B).
- [ ] Monedero de GHL sin `inbound_webhook` de la Biblioteca desde el 6 nov 19:40 UTC (el 7 nov la página salía en blanco en Playwright).
- [ ] El webhook `2f05f800…` y su workflow «2 . WH - FORM AGENDA GENERAL» **no se apagan**: los usa `codigomaestria.com/agenda` (fase 6).
- **Para volver atrás:** registro → volver a publicar `6041cce` de la Biblioteca, poner en Publish «0. AP - Biblioteca de recursos» y activar la Entrada «GHL · Biblioteca». Agenda → volver a publicar `bfcb006`.

### 1 · Lo que hace Cristian (Claude no puede)
- [ ] Borrar en GHL los contactos de prueba y sus oportunidades: «Prueba GHL Claude» (`info+pruebaghl@eternity.llc`) y «Prueba Biblioteca 1» a «5» (`info+bib1@` … `info+bib5@eternity.llc`). Sus citas (bib1 el 12 nov y bib5 el 7 nov) ya están canceladas.
- [ ] Decidir si se borran también en el dashboard los mismos leads de prueba (están en «1. Biblioteca Recursos» y alguno con tarjeta en «0. Agendas General»; no se repartieron a ningún caller). Si se borran, lo hace Cristian.
- [ ] Quitar `cristianortiz33` de colaborador en GitHub (`Dashboard-de-ventas` y `biblioteca-maestria` → Settings → Collaborators) y `cristianortizking33-7483` del equipo de Vercel si es miembro (Settings → Members).
- [ ] Poner otra vez la descripción de la integración «App Eternity (dashboard)» en GHL (quedó vacía; ya no es «solo lectura»).
- [ ] Gestionar tus cambios sin subir en el repo del dashboard: 3 docs borrados (`Arreglar-dashboard.md`, `plan-historial-10oct.md`, `plan-historial-11oct.md`) y `manual-branding-rojo.md` nuevo. Claude no los toca.

### 2 · Para decidir (Cristian)
- [ ] **¿Cuándo van los workflows visuales (fase 4): antes o después de pasar las demás landings (fase 6)?** Decidido hasta ahora: primero A, B y C; después la skill de la fase 5; después la landing de agenda de `codigomaestria.com`. Falta saber dónde encaja la fase 4.
- [ ] **Entrada «Prueba GHL»** (`e5a2bfa9…`): ¿se queda o se borra? *Qué es:* una Entrada que Claude creó el 6 nov en la fase 1 solo para probar el envío a GHL con un contacto de prueba (`info+pruebaghl@eternity.llc`), incluida la prueba de fallo con un pipeline de GHL inválido (5 intentos, rojo, email y «Reintentar»). *Estado:* apagada (no acepta envíos y no manda nada a GHL); guarda el historial de esas pruebas y su lead de prueba. *Para qué sirve:* repetir pruebas sin tocar las Entradas reales. No molesta; si no se quiere, la borra Cristian en Administración → Entradas (Claude no borra datos).

### 3 · Seguimiento (Claude)
- [ ] Hasta el 13 nov: medir con las horas de los envíos cuánto tarda la gente en el cuestionario y ajustar la espera (hoy 60 s) si hace falta.

### 4 · Mejoras pequeñas apuntadas (Claude, cuando Cristian diga)
- [ ] Los reintentos van cada 2 min, no cada 1: programar el siguiente a +50 s.
- [ ] El aviso rojo de arriba del formulario («N envíos no llegaron a GHL») no se vio en la prueba; la fila roja con «Reintentar» sí. Revisarlo.
- [ ] La lectura de 60 s solo se lanza en proyectos con calendarios (`20261017120000_leer_ghl_cada_30s.sql`). Un proyecto sin calendarios nunca mandaría a GHL.
- [ ] Bloquear el bucle: no dejar encender «Mandar a GHL» en una Entrada que alimenta un workflow de GHL.
- [ ] `BIBLIOTECA/build.py` rehace `index.html` desde una fuente vieja (vuelve «AI» y quita `CM_HAS_ACCESS`): arreglar su fuente antes de volver a usarlo.

### 5 · Fase 5 · Skill «conectar-web-al-dashboard» = el manual para landings (Claude, después de A, B y C)
*Por qué:* Cristian quiere que conectar una landing nueva sea fácil y siempre igual. Decidió que el manual sea una **skill** (instrucciones que Claude sigue paso a paso cada vez), no un documento para leer.
- [ ] Con el caso real de la Biblioteca y `kit-creador-maestria:crear-skills`. Contenido: los 7 pasos de «Plan para conectar futuras landings» (abajo) y lo aprendido con la Biblioteca: etiquetas `<web>-<form>-completo/-incompleto` en minúsculas; etiquetas viejas fijas por compatibilidad; varios pipelines de GHL por Entrada en su primera columna; agendas en «0. Agendas General → Form» con «Canal: …» desde el formulario; el `utm_source` de la landing tiene que existir en `canal.ts`; el contacto de GHL puede ser de otro lead (mismo teléfono); pruebas con `info+…@eternity.llc` y teléfonos 555-01xx; comprobar el día antes de reservar y cancelar la cita; aplicar migraciones antes de publicar; cómo volver atrás.
- [ ] En `app/.claude/skills/conectar-web-al-dashboard/`, con copia en `PROYECTOS/GENERAL/VENTAS/` y en `~/.claude/skills/`. Se prueba con la primera web de la fase 6.

### 6 · Fase 6 · El resto de webs de Maestria, una a una
Con la skill de la fase 5, una web cada vez, con preview y prueba, y Cristian la ve. En este orden:
- [ ] **1.º · Landing de agenda** `codigomaestria.com/agenda` (`LANDINGS/Landing agenda/Landing-agendar.html`, webhook `2f05f800…`; decisión de Cristian: la primera). Replicar sus ramas por `utm_source` (ver «Datos»). Cuando ya no la use ninguna web, se apaga el workflow «2 . WH - FORM AGENDA GENERAL».
- [ ] Regalos 1 a 7 y `regalos-maestria` (webhook `37e6bc4c…`; antes, leer el workflow `AP - Regalos` `c3bd1ba2…`).
- [ ] Optin `LANDINGS/landing-codigomaestria/landing-ghl.html` (webhook `83c32b0a…`).
- [ ] Apagar cada «Inbound Webhook» cuando todas sus webs estén cambiadas (Claude con Playwright, con permiso de Cristian).
- [ ] A final de mes, `inbound_webhook` cerca de $0 en el monedero.
- [ ] Actualizar `docs/GUIA-GHL.md` y `docs/plan.md`.

### 7 · Fase 4 · Workflows visuales en el dashboard (su plan propio antes de programar; cuándo, lo decide Cristian)
*Qué es:* un apartado del dashboard para crear workflows como los de GHL (disparador → pasos), para dejar de depender de los workflows de GHL.
**Decidido por Cristian (7 nov):** **lienzo como GHL** (cajas y flechas), no una lista; **los emails de las secuencias siguen fuera** (no hay acción de email).
**Propuesta de Claude (base para su plan propio):**
- **Workflow** = un disparador + pasos, dibujado en el lienzo. Tabla `workflows` (pasos en JSON, versión, encendido).
- **Disparadores v1:** llega a una Entrada · se añade una etiqueta · cambia de columna en el dashboard · se agenda / cancela una cita.
- **Acciones v1:** crear/actualizar contacto en GHL · añadir/quitar etiqueta · crear o mover oportunidad (en uno o varios pipelines) · mover de columna en el dashboard · esperar · rama «si el campo…».
- **Motor:** cada lead crea una ejecución (`workflow_ejecuciones`: paso, hora del siguiente, intentos, error); la lectura de 60 s la avanza, con los mismos reintentos, aviso en rojo, email de aviso a Cristian y «Reintentar» de hoy.
- **Pantalla:** Administración → Workflows: el lienzo, el historial de cada lead (qué paso hizo y cuándo) y el interruptor.
- **Migración:** «Qué hacer en GHL» de cada Entrada pasa a ser su workflow; las reglas de pipeline, ramas.
- **Subfases:** 4a motor sin pantalla rehaciendo la Biblioteca (mismo resultado que hoy) · 4b lienzo de solo lectura · 4c edición en el lienzo · 4d disparadores de etiqueta, columna y cita.
- [ ] Hacer el plan propio de la fase 4 con estas decisiones y enseñárselo a Cristian antes de programar.

---

## Datos que hacen falta

**API de GHL** (especificación oficial `highlevel-api-docs`, todo Version `2021-07-28`):
- `POST /contacts/upsert`: **nunca mandar `tags`** (borra todas). Etiquetas con `POST`/`DELETE /contacts/{id}/tags`. Campos: `customFields: [{ id, field_value }]`.
- Oportunidades: `GET /opportunities/search?location_id&contact_id&pipeline_id`, `POST /opportunities/`, `PUT /opportunities/{id}` (`opportunities.write`). El upsert de oportunidades no lleva `contactId`: no se usa.
- Maestria: `allowDuplicateContact: false` y `allowDuplicateOpportunity: false`. GHL guarda las etiquetas en minúsculas.

**Entradas del dashboard (Maestria):**
| Entrada | Id | Estado |
|---|---|---|
| Web · Biblioteca registro | `087b86d1…` | Activa, GHL encendido. Recibe de biblioteca.codigomaestria.com (`DASHBOARD_ENTRADA_URL` en Vercel) |
| Web · Biblioteca agenda | `bc00a154…` | Activa, GHL encendido. Recibe de la agenda de biblioteca.codigomaestria.com (dirección en `web/programa.js`). **Mal configurada hasta hacer A y B** (hoy: dashboard «1. Biblioteca Recursos» y GHL «1. Biblioteca Recursos → Form Agenda») |
| GHL · Biblioteca | `b173a67a…` | Desactivada. La alimentaba el workflow de GHL «0. AP - Biblioteca», que ya no existe en GHL (Cristian no sabe si se borró a propósito); no recibía nada desde el 16 oct |
| Prueba GHL | `e5a2bfa9…` | Apagada |

**Pipelines de GHL** (leídos el 7 nov con la API a través del dashboard):
- «1. Biblioteca Recursos» `dE7go9T3Mi2zbIT4sGME`: «Registrados» `9cb965ae-6b38-4a7d-a86b-3d2e9f45bb8d` (registro), «Form Agenda» `77b3ce38-39b2-446d-b734-f38bc29c88e2` (la usaba la agenda; deja de usarse), «Agendado» `f0c80531-c23f-4af5-b0a2-03c4095b432a`.
- «0. Agendas Biblioteca» `wym2Ue4VUqkhsFoQJ5PK` y «0. Agendas General» `zuQjPVJNbPpRlL0voy6d`: sus columnas **no se pudieron leer** el 7 nov (GHL salía en blanco en Playwright); el código usará la primera de cada una.
- Otros: «0. Agendas Orgánico» `3mtxrCYH…`, DFY, Email, P1, Webinar, IG, Callers, Triage YT, «2. Webinar 1», «3. DFY AI Services».

**Pipelines del dashboard (Maestria):** «0. Agendas General» `7bf529f6-a5e9-44e8-9a3a-25be6d9f9ac0` (columnas: Form `4a0469a9-edbc-41ca-999a-7aab1694dab6`, Agendan `598b75d0-5a95-4241-b61a-387ef3b75aa1`, Confirman, No confirman, No show, Cerrados, No cualifican, Seguimiento), «1. Biblioteca Recursos» `eb300c25-406e-45d0-9d43-5285f988233e`, «2. Webinar 1», «3. DFY AI Services», «4. Leads WhatsApp».

**Canales de las agendas** (`src/lib/canal.ts`): el canal sale del `utm_source` de la página donde se reserva; los que no están en la lista salen como «Otro». La agenda de la Biblioteca manda `agenda-biblioteca`.

**Campos de la agenda** (los unió la Entrada de la agenda): situación `ILrgHLZsc1TX8lBYWzfM`, ingresos `IWPSlOz1dKbkwg8SvK9p`, relación con la IA `jvsMaWoh9FSMzuZ5pLHk`, objetivo a 12 meses `oYaZveSEzoLWPZ7hoM1M`, inversión `7I9zm2KGljAr1X4l6xmR`, «Lead cualificado?» `tYv72lGm4gMaK2l7eujl` ← `qualified`, `utm_source` `BPs2vrG7eqH7D3d5zJEf`, urgencia `pLkktkvmSexGPkZpyW8J`, decisor `9MtM6cI7dArWZx725GuI`.

**Workflow «2 . WH - FORM AGENDA GENERAL»** (`6dd710da…`, webhook `2f05f800…`): ramas por `utm_source` (YouTube, BIBLIOTECA, Instagram, P1, Callers, Email, Webinar, DFY y «otro»); cada una crea la oportunidad en su pipeline y pone su etiqueta. Rama BIBLIOTECA: pipeline `dE7go…`, columna `77b3ce38…`, etiqueta `agenda biblioteca`. Hace falta para la fase 6 (landing de agenda).

## Riesgos
- **Si el dashboard no responde**, el lead no llega a GHL hasta que vuelva: lo cubren los reintentos, el email y el aviso.
- **Permisos de escritura en uso** (`contacts.write`, `opportunities.write`): si la clave se filtrara, se podrían cambiar contactos y oportunidades.
- **La dirección de la Entrada de la agenda va en el navegador**, como antes el webhook: la frenan el límite de 300 por minuto y el filtro de email/teléfono.
- **Límite de la API de GHL:** 100 llamadas cada 10 s; hasta 4 por lead. En un lanzamiento con picos, vigilarlo.
- **Las citas reales mandan email y SMS** desde los workflows del calendario de GHL: en las pruebas, usar teléfonos de ficción (555-01xx) y cancelar la cita.

---

## Plan para conectar futuras landings (sin webhooks de GHL)
Lo mismo que se hizo con la Biblioteca, en 7 pasos. Una landing cada vez; hasta que funciona en producción no se pasa a la siguiente.

1. **Leer lo de hoy:** qué manda la landing (abrir el código y ver el JSON) y qué hace su workflow de GHL (con Playwright): campos, etiqueta, pipeline, columna y ramas.
2. **Crear su Entrada** en Administración → Entradas: nombre `Web · <landing> <form>`, pipeline del dashboard y, en «Qué hacer en GHL», los campos unidos (UTM incluidos), pipeline y columna de GHL, etiqueta base `<web>-<form>` (en minúsculas) y espera (60 s si hay cuestionario después; si no, 0). Dejar «Mandar a GHL» apagado hasta la prueba.
3. **Cambiar la landing:**
   - si manda **desde el servidor** (como `api/signup.js`): variable `DASHBOARD_ENTRADA_URL` en Vercel (Production y Preview) y POST con 2 intentos y 5 s;
   - si manda **desde el navegador** (como `programa.js`): la dirección de la Entrada en el código, con 3 intentos; el dashboard ya acepta CORS.
   - En los dos casos, el mismo JSON de antes con la etiqueta nueva; fuera la URL del webhook de GHL.
4. **Probar en el preview de Vercel** con leads de prueba (`info+<landing>N@eternity.llc` y teléfonos de ficción 555-01xx): completo, incompleto y tardío. Comprobar en el dashboard (1 lead, su pipeline, `ok`) y en GHL (contacto, campos, etiqueta y oportunidad). Si hay calendario, reservar y cancelar.
5. **Encender** «Mandar a GHL», **publicar** la landing y **apagar** su workflow de GHL (o solo su rama, si el webhook lo comparten otras webs).
6. **Probar una vez en producción** y vigilar 24 h (Administración → Entradas sin rojos; monedero de GHL).
7. **Apuntar** cómo volver atrás (commit anterior de la landing + encender el workflow) y pasar los contactos de prueba a Cristian para borrarlos.

Cuando exista la skill «conectar-web-al-dashboard» (fase 5), estos pasos van en ella; cuando existan los workflows del dashboard (fase 4), el paso 2 será crear el workflow.

## Plan para unir leads duplicados (pendiente de hacer; Cristian, 7 nov)
**Contexto para no olvidarlo:** el dashboard reconoce a una persona por su contacto de GHL, por su email o, si no tiene email, por su teléfono (`src/lib/leads.ts`). GHL la reconoce por email **o** teléfono (`allowDuplicateContact: false`). Así, quien se registra dos veces con emails distintos y el mismo teléfono queda como **2 leads en el dashboard y 1 contacto en GHL**. Caso real: 6 nov, 23:06 y 23:07 UTC, teléfono …7112 (leads `e7cc481b…` y `c407dcf9…`, contacto `oIEMl9RNaQEANZQnLWEb`). Desde el arreglo C el envío ya no falla, pero los 2 leads siguen separados.

**Qué hay que decidir y diseñar (con Cristian, antes de programar):**
- Cuándo se consideran el mismo: ¿mismo teléfono (normalizado con `telefonoClave`)? ¿mismo contacto de GHL?
- Cuál se queda (¿el más antiguo?) y qué se junta: emails (¿un campo de emails secundarios?), respuestas, etiquetas, citas, ventas, actividades, tarjetas, reparto/caller.
- Automático al entrar o un botón «Unir» en la ficha del lead (Cristian revisa antes). Unir implica **borrar** un lead: lo confirma Cristian.
- Buscar cuántos duplicados hay hoy (por teléfono) antes de elegir.
