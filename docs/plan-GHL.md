# Plan · Leads al dashboard primero (sin webhooks de GHL)

> Versión 7 (7 nov 2026, con las respuestas de Cristian antes de A, B y C). **Solo lo que falta.** Lo hecho (fases 0, 1 y 2, con sus pruebas) está en git:
> `git show a924227:docs/plan-GHL.md`.

## Dónde estamos

| Fase | Estado |
|---|---|
| 0 · Leer la API y los workflows de GHL | Hecha |
| 1 · El dashboard hace en GHL lo que hacía el workflow | Hecha y publicada (PR #9 y #10) |
| 2 · Registro de la Biblioteca | Hecha y publicada (biblioteca-maestria PR #1). Falta el seguimiento |
| 3 · Agenda de la Biblioteca | Publicada (6 nov, 20:23 UTC). Falta ponerla en «0. Agendas General» (A) y sus 2 oportunidades en GHL (B) |
| 4 · Workflows visuales | Diseño propuesto, esperando a Cristian |
| 5 · Skill | Pendiente |
| 6 · Resto de webs | Pendiente |

**Objetivo:** web → dashboard.eternity.llc → el dashboard hace en GHL, por la API, contacto, campos, etiqueta y oportunidad. Sin «Inbound Webhook» de pago (en octubre: $66,60, el 28 % del monedero).

## Cómo se trabaja
- **Navegador: siempre Playwright** (GHL, dashboard, Vercel, Resend), con la sesión de Cristian.
- **Solo la cuenta de Eternity** (`eternitydevzz` en GitHub, `info-79696548` en Vercel). Nunca `cristianortiz33`.
- Tests primero. `npm test` y los tests de GitHub en verde antes de publicar.
- Si algo falla, se para y se pregunta. Las dudas se apuntan abajo, en «Para decidir».
- Claude no borra datos ni toca permisos de seguridad: eso va en «Lo que hace Cristian».

## Decisiones de Cristian (siguen valiendo)
| Tema | Decisión |
|---|---|
| Quién hace el trabajo en GHL | El dashboard por la API. Cero workflows de GHL para esto |
| Etiquetas | Las mismas en la web, el dashboard y GHL: `<web>-<form>-completo/-incompleto`, **en minúsculas** (GHL las guarda así). Registro `biblioteca-form-…`, agenda `biblioteca-agenda-…` |
| Un envío por lead | Espera de 1 min y un solo envío; si el cuestionario llega tarde, se actualiza y pasa de `-incompleto` a `-completo` (nunca al revés) |
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
- Registro: **21 envíos reales** desde las 20:19 UTC del 6 nov (último 04:53 UTC). Todos guardados en el dashboard; **20 en `ok` en GHL y 1 en `error`** (abajo).
- Agenda: **0 envíos reales** todavía (solo la prueba bib5).
- Monedero de GHL: **sin comprobar** (la página de facturación de GHL salía en blanco en Playwright).

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

**D · Vigilar** (Claude, 7 nov por la tarde)
- [ ] Primeras agendas reales: dashboard (`ok`, «0. Agendas General», «Canal: Biblioteca») y GHL (oportunidades de B).
- [ ] Monedero de GHL sin `inbound_webhook` de la Biblioteca desde el 6 nov 19:40 UTC (el 7 nov la página salía en blanco en Playwright).
- [ ] El webhook `2f05f800…` y su workflow «2 . WH - FORM AGENDA GENERAL» **no se apagan**: los usa `codigomaestria.com/agenda` (fase 6).
- **Para volver atrás:** registro → volver a publicar `6041cce` de la Biblioteca, poner en Publish «0. AP - Biblioteca de recursos» y activar la Entrada «GHL · Biblioteca». Agenda → volver a publicar `bfcb006`.

### 1 · Lo que hace Cristian (Claude no puede)
- [ ] Borrar en GHL los contactos de prueba y sus oportunidades: «Prueba GHL Claude» (`info+pruebaghl@`), «Prueba Biblioteca 1» a «5» (`info+bib1@` … `info+bib5@eternity.llc`). Las citas de bib1 y bib5 ya están canceladas.
- [ ] Quitar `cristianortiz33` de colaborador en GitHub (`Dashboard-de-ventas` y `biblioteca-maestria` → Settings → Collaborators) y `cristianortizking33-7483` del equipo de Vercel si es miembro (Settings → Members).
- [ ] Poner otra vez la descripción de la integración «App Eternity (dashboard)» en GHL (quedó vacía; ya no es «solo lectura»).
- [ ] Tus cambios sin commit en el repo del dashboard (3 docs borrados y `manual-branding-rojo.md`): **Claude no los toca** (Cristian, 7 nov).

### 2 · Para decidir (Cristian)
- [ ] Entrada «Prueba GHL»: Cristian pregunta qué hace y para qué sirve (explicado el 7 nov) → decide si se queda o se borra.
- [x] Etiqueta `biblioteca recursos`: se vuelve a poner en GHL (ver B.7).
- [ ] El workflow «0. AP - Biblioteca» no existe en GHL; Cristian no sabe si se borró a propósito. La Entrada «GHL · Biblioteca» no recibía nada desde el 16 oct y está desactivada: no se hace nada.
- [x] Fase 4: respuestas abajo.

### 3 · Seguimiento (Claude)
- [ ] Hasta el 13 nov: medir con las horas de los envíos cuánto tarda la gente en el cuestionario y ajustar la espera (hoy 60 s) si hace falta.

### 4 · Mejoras pequeñas apuntadas (Claude, cuando Cristian diga)
- [ ] Los reintentos van cada 2 min, no cada 1: programar el siguiente a +50 s.
- [ ] El aviso rojo de arriba del formulario («N envíos no llegaron a GHL») no se vio en la prueba; la fila roja con «Reintentar» sí. Revisarlo.
- [ ] La lectura de 60 s solo se lanza en proyectos con calendarios (`20261017120000_leer_ghl_cada_30s.sql`). Un proyecto sin calendarios nunca mandaría a GHL.
- [ ] Bloquear el bucle: no dejar encender «Mandar a GHL» en una Entrada que alimenta un workflow de GHL.
- [ ] `BIBLIOTECA/build.py` rehace `index.html` desde una fuente vieja (vuelve «AI» y quita `CM_HAS_ACCESS`): arreglar su fuente antes de volver a usarlo.

### 5 · Fase 4 · Workflows visuales en el dashboard (diseño con Cristian antes de programar)
**Propuesta (Claude, 6 nov):**
- **Workflow** = un disparador + pasos en orden, dibujado en un lienzo como GHL. Tabla `workflows` (pasos en JSON, versión, encendido).
- **Disparadores v1:** llega a una Entrada · se añade una etiqueta · cambia de columna en el dashboard · se agenda / cancela una cita.
- **Acciones v1:** crear/actualizar contacto en GHL · añadir/quitar etiqueta · crear o mover oportunidad · mover de columna en el dashboard · esperar · rama «si el campo…» · email con Resend.
- **Motor:** cada lead crea una ejecución (`workflow_ejecuciones`: paso, hora del siguiente, intentos, error); la lectura de 60 s la avanza, con los mismos reintentos, aviso y «Reintentar» de hoy.
- **Pantalla:** Administración → Workflows, en **lienzo como GHL** (decisión de Cristian), con historial por lead e interruptor.
- **Migración:** «Qué hacer en GHL» de cada Entrada pasa a ser su workflow; las reglas de pipeline, ramas.
- **Subfases:** 4a motor sin pantalla rehaciendo la Biblioteca (mismo resultado que la fase 2) · 4b pantalla de solo lectura · 4c edición · 4d disparadores de etiqueta, columna y cita.

**Respuestas de Cristian (7 nov):**
- **Lienzo como GHL** (cajas y flechas), no lista vertical. Cambia la pantalla de la propuesta y es más trabajo: su plan propio lo tiene en cuenta.
- **Emails de las secuencias: siguen fuera.**
- Primer workflow después de la Biblioteca: **la landing de agenda** (`codigomaestria.com/agenda`, webhook `2f05f800…`). **Antes de pasar más landings, un manual para todas las landings** (ver «Manual para landings»).

Con sus respuestas sale el plan propio de la fase 4. Primera pasada de punta a punta: la Biblioteca como workflow, con el mismo resultado que hoy.

### 6 · Fase 5 · Skill «conectar-web-al-dashboard» (Claude)
- [ ] Con el caso real de la Biblioteca y `kit-creador-maestria:crear-skills`: regla de etiquetas, crear la Entrada (o el workflow) y unir campos, código para mandar desde el servidor y desde el navegador, lista de pruebas y cómo volver atrás.
- [ ] En `app/.claude/skills/conectar-web-al-dashboard/`, con copia en `PROYECTOS/GENERAL/VENTAS/` y en `~/.claude/skills/`. Se prueba con la primera web de la fase 6.

### 7 · Fase 6 · El resto de webs de Maestria, una a una
- [ ] Regalos 1 a 7 y `regalos-maestria` (webhook `37e6bc4c…`; antes, leer el workflow `AP - Regalos` `c3bd1ba2…`), landing de agenda (`2f05f800…`; replicar sus ramas por `utm_source`) y optin (`83c32b0a…`). Cada una con preview y prueba, y Cristian la ve.
- [ ] Cristian apaga cada «Inbound Webhook» cuando todas sus webs están cambiadas.
- [ ] A final de mes, `inbound_webhook` cerca de $0 en el monedero.
- [ ] Actualizar `docs/GUIA-GHL.md` y `docs/plan.md`.

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
| Web · Biblioteca agenda | `bc00a154…` | Activa, GHL encendido. Recibe de la agenda de biblioteca.codigomaestria.com (dirección en `web/programa.js`) |
| GHL · Biblioteca | `b173a67a…` | Desactivada |
| Prueba GHL | `e5a2bfa9…` | Apagada |

**GHL · pipeline «1. Biblioteca Recursos»** `dE7go9T3Mi2zbIT4sGME`: columna «Registrados» `9cb965ae-6b38-4a7d-a86b-3d2e9f45bb8d` (registro) y `77b3ce38-39b2-446d-b734-f38bc29c88e2` (agenda).

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

## Manual para landings (Cristian, 7 nov: antes de pasar más landings)
- [ ] Hacer un manual para conectar cualquier landing al dashboard sin webhooks de GHL, fácil de seguir. Base: «Plan para conectar futuras landings» (arriba) y lo aprendido con la Biblioteca (etiquetas en minúsculas, etiquetas viejas por compatibilidad, varios pipelines de GHL, `Canal: …`, pruebas con 555-01xx y cancelar citas). Pendiente de que Cristian confirme formato y sitio.

