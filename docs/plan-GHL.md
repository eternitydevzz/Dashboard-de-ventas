# Plan · Leads al dashboard primero (sin webhooks de GHL)

> Versión 4 (6 nov 2026, noche). **Solo lo que falta.** Lo hecho (fases 0, 1 y 2, con sus pruebas) está en git:
> `git show a924227:docs/plan-GHL.md`.

## Dónde estamos

| Fase | Estado |
|---|---|
| 0 · Leer la API y los workflows de GHL | Hecha |
| 1 · El dashboard hace en GHL lo que hacía el workflow | Hecha y publicada (PR #9 y #10) |
| 2 · Registro de la Biblioteca | Hecha y publicada (biblioteca-maestria PR #1). Falta el seguimiento |
| 3 · Agenda de la Biblioteca | **Parada**: probada en preview, 2 fallos, sin publicar |
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

### 1 · Lo que hace Cristian (Claude no puede)
- [ ] Borrar en GHL los contactos de prueba y sus oportunidades: «Prueba GHL Claude» (`info+pruebaghl@`), «Prueba Biblioteca 1» a «4» (`info+bib1@` … `info+bib4@eternity.llc`). La cita de bib1 ya está cancelada.
- [ ] Quitar `cristianortiz33` de colaborador en GitHub (`Dashboard-de-ventas` y `biblioteca-maestria` → Settings → Collaborators) y `cristianortizking33-7483` del equipo de Vercel si es miembro (Settings → Members).
- [ ] Poner otra vez la descripción de la integración «App Eternity (dashboard)» en GHL (quedó vacía; ya no es «solo lectura»).
- [ ] Tus cambios sin commit en el repo del dashboard: 3 docs borrados (`Arreglar-dashboard.md`, `plan-historial-10oct.md`, `plan-historial-11oct.md`) y `manual-branding-rojo.md` nuevo. ¿Se suben o se descartan?

### 2 · Para decidir (Cristian)
- [ ] Entrada «Prueba GHL»: está apagada. ¿Se queda o se borra (con su lead de prueba)?
- [ ] La agenda mete los leads nuevos en «1. Biblioteca Recursos» del dashboard (decisión de Claude). ¿Otro pipeline?
- [ ] ¿Algún workflow o lista de GHL depende de la etiqueta `biblioteca recursos`? Los leads nuevos de la Biblioteca ya no la llevan.
- [ ] El workflow «0. AP - Biblioteca» (mandaba a la Entrada «GHL · Biblioteca») no existe en GHL; la Entrada no recibía nada desde el 16 oct y está desactivada. ¿Se borró a propósito?
- [ ] Las 3 preguntas de la fase 4 (abajo).

### 3 · Fase 3 · Terminar la agenda de la Biblioteca (Claude)
Hecho y probado en preview: Entrada «Web · Biblioteca agenda» (`bc00a154…`, recibe solo del preview) y `web/programa.js` en la rama `agenda-dashboard` de biblioteca-maestria (sin fusionar). Producción sigue con el webhook `2f05f800…`.
- [ ] **Fallo 1:** la oportunidad de la Biblioteca se queda en «Registrados»; la rama BIBLIOTECA del workflow viejo la llevaba a la columna `77b3ce38…`. Arreglo: si ya existe en ese pipeline y la Entrada tiene columna, moverla (`PUT /opportunities/{id}` con `pipelineStageId`, `opportunities.write`). Tests primero, PR y publicar el dashboard.
- [ ] **Fallo 2:** los workflows del calendario de GHL crean otra oportunidad en «0. Agendas Orgánico - Agendan» y la cita le da al lead una tarjeta en «0. Agendas General». Ya pasaba a veces antes (2 de 4 leads reales). Leer con Playwright el workflow «2. Agendan llamada…» (carpeta «2. Agendas») y proponer el arreglo (¿añadir también la etiqueta `agenda biblioteca`?).
- [ ] Repetir la prueba en preview (datos, respuestas, reserva y cancelar), sin «Orgánico» ni «General».
- [ ] Publicar: fusionar `agenda-dashboard`. **Para volver atrás:** volver a publicar el commit anterior de la Biblioteca.
- [ ] El webhook `2f05f800…` y su workflow «2 . WH - FORM AGENDA GENERAL» **no se apagan**: los usa `codigomaestria.com/agenda`.

### 4 · Seguimiento de la fase 2 (Claude)
- [ ] **7 nov:** mirar con Playwright en el monedero de GHL que ya no hay `inbound_webhook` de la Biblioteca.
- [ ] Hasta el 13 nov: medir con las horas de los envíos cuánto tarda la gente en el cuestionario y ajustar la espera (hoy 60 s) si hace falta.
- **Para volver atrás (fase 2):** volver a publicar el commit `6041cce` de la Biblioteca en Vercel, poner en Publish «0. AP - Biblioteca de recursos» y activar la Entrada «GHL · Biblioteca».

### 5 · Mejoras pequeñas apuntadas (Claude, cuando Cristian diga)
- [ ] Los reintentos van cada 2 min, no cada 1: programar el siguiente a +50 s.
- [ ] El aviso rojo de arriba del formulario («N envíos no llegaron a GHL») no se vio en la prueba; la fila roja con «Reintentar» sí. Revisarlo.
- [ ] La lectura de 60 s solo se lanza en proyectos con calendarios (`20261017120000_leer_ghl_cada_30s.sql`). Un proyecto sin calendarios nunca mandaría a GHL.
- [ ] Bloquear el bucle: no dejar encender «Mandar a GHL» en una Entrada que alimenta un workflow de GHL.
- [ ] `BIBLIOTECA/build.py` rehace `index.html` desde una fuente vieja (vuelve «AI» y quita `CM_HAS_ACCESS`): arreglar su fuente antes de volver a usarlo.

### 6 · Fase 4 · Workflows visuales en el dashboard (diseño con Cristian antes de programar)
**Propuesta (Claude, 6 nov):**
- **Workflow** = un disparador + pasos en orden, en lista vertical (sin lienzo libre en la v1). Tabla `workflows` (pasos en JSON, versión, encendido).
- **Disparadores v1:** llega a una Entrada · se añade una etiqueta · cambia de columna en el dashboard · se agenda / cancela una cita.
- **Acciones v1:** crear/actualizar contacto en GHL · añadir/quitar etiqueta · crear o mover oportunidad · mover de columna en el dashboard · esperar · rama «si el campo…» · email con Resend.
- **Motor:** cada lead crea una ejecución (`workflow_ejecuciones`: paso, hora del siguiente, intentos, error); la lectura de 60 s la avanza, con los mismos reintentos, aviso y «Reintentar» de hoy.
- **Pantalla:** Administración → Workflows, con tarjetas, «+» entre pasos, historial por lead e interruptor.
- **Migración:** «Qué hacer en GHL» de cada Entrada pasa a ser su workflow; las reglas de pipeline, ramas.
- **Subfases:** 4a motor sin pantalla rehaciendo la Biblioteca (mismo resultado que la fase 2) · 4b pantalla de solo lectura · 4c edición · 4d disparadores de etiqueta, columna y cita.

**Preguntas para Cristian:**
- [ ] ¿Lista vertical vale, o lienzo como GHL desde el principio?
- [ ] ¿Qué workflow de GHL pasamos primero después de la Biblioteca?
- [ ] ¿Los emails de las secuencias entran aquí o siguen fuera?

Con sus respuestas sale el plan propio de la fase 4. Primera pasada de punta a punta: la Biblioteca como workflow, con el mismo resultado que hoy.

### 7 · Fase 5 · Skill «conectar-web-al-dashboard» (Claude)
- [ ] Con el caso real de la Biblioteca y `kit-creador-maestria:crear-skills`: regla de etiquetas, crear la Entrada (o el workflow) y unir campos, código para mandar desde el servidor y desde el navegador, lista de pruebas y cómo volver atrás.
- [ ] En `app/.claude/skills/conectar-web-al-dashboard/`, con copia en `PROYECTOS/GENERAL/VENTAS/` y en `~/.claude/skills/`. Se prueba con la primera web de la fase 6.

### 8 · Fase 6 · El resto de webs de Maestria, una a una
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
| Web · Biblioteca agenda | `bc00a154…` | Activa, GHL encendido. Solo la usa el preview de la agenda |
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
