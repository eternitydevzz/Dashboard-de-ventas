# Plan · Leads al dashboard primero (sin webhooks de GHL)

> Versión 11 (7 nov 2026). **Solo lo que falta**, en orden. Cada punto se explica solo, sin depender del chat.
> Lo hecho (fases 0 a 3 y A, B y C, con todas sus pruebas) está en git: `git show fe672d9:docs/plan-GHL.md`.

**Objetivo:** web → dashboard.eternity.llc → el dashboard hace en GHL, por la API, contacto, campos, etiquetas y oportunidades. Sin «Inbound Webhook» de pago (en octubre: $66,60, el 28 % del monedero).

## Dónde estamos

| Fase | Estado |
|---|---|
| 0 · Leer la API y los workflows de GHL | Hecha |
| 1 · El dashboard hace en GHL lo que hacía el workflow | Hecha (PR #9 y #10) |
| 2 · Registro de la Biblioteca sin webhook | Hecha (biblioteca-maestria PR #1) |
| 3 · Agenda de la Biblioteca sin webhook, con A, B y C | Hecha (biblioteca-maestria PR #2 y dashboard PR #21). Probada en producción con bib6 el 7 nov |
| **Mejoras pequeñas** | **← Siguiente** |
| 5 · Skill «conectar-web-al-dashboard» (el manual de landings) | Pendiente |
| 6 · Landing de agenda de `codigomaestria.com` | Pendiente |
| 4 · Workflows visuales | Pendiente. Diseño decidido; falta su plan propio |
| 6 · Optin | Pendiente, después de la fase 4 |
| Unir leads duplicados | Al final de todo |

**Orden (Cristian, 7 nov):** mejoras pequeñas → skill (fase 5) → landing de agenda (fase 6) → workflows visuales (fase 4) → optin (fase 6) → unir duplicados. Regalos: de momento no.

## Cómo funciona hoy (la Biblioteca)
- **Registro:** formulario → `biblioteca.codigomaestria.com/api/signup` (función de Vercel) → desde el servidor, POST a la Entrada «Web · Biblioteca registro» del dashboard (2 intentos de 5 s).
- **Agenda:** navegador (`web/programa.js`) → POST directo a la Entrada «Web · Biblioteca agenda» (3 intentos): `agenda_datos` al terminar los datos y `cuestionario` al terminar las preguntas. Después, el calendario de GHL.
- El dashboard guarda el lead **al momento**. Pasados **5 min**, la lectura de cada 60 s manda a GHL un solo envío por lead: contacto, campos, etiquetas y oportunidades. Como mucho 10 leads por lectura.
- Si falla: 5 reintentos, después email a info@eternity.llc y aviso en rojo con «Reintentar» (Administración → Entradas).

## Cómo se trabaja
- **Navegador: siempre Playwright** (GHL, dashboard, Vercel, Resend), con la sesión de Cristian. En el dashboard los clics normales fallan (la página se refresca y vuelve el formulario a su estado inicial): hacer cada cambio y su «Guardar» en una sola ejecución. GHL a veces sale en blanco: anotarlo y seguir.
- **Solo la cuenta de Eternity** (`eternitydevzz` en GitHub, `info-79696548` en Vercel). Nunca `cristianortiz33`.
- **Tests primero.** En local solo `npx next typegen`, `npx tsc --noEmit`, `npx eslint .` y `npx vitest run tests/unit` (**sin Docker en el Mac**: ocupa mucha RAM). Los tests de integración corren en GitHub al abrir un PR.
- **Se publica siempre con PR**: rama → PR → tests de GitHub en verde → fusionar en `main` (Vercel publica solo). Las migraciones se aplican en producción **antes** de publicar el código que las usa (`supabase db push --dry-run` y después `supabase db push`).
- **Lecturas de producción:** con `app/.env.produccion` por la API REST. Nunca imprimir claves.
- **Permisos dados por Cristian (6 y 7 nov):** subir y publicar el dashboard y la Biblioteca, aplicar migraciones en producción, poner variables en Vercel, crear y cambiar Entradas, apagar workflows de GHL con Playwright y hacer pruebas reales con leads y citas de prueba (después se cancelan y Cristian borra los contactos).
- **Pruebas reales:** `info+…@eternity.llc` y teléfonos de ficción 555-01xx. Comprobar el día en pantalla **antes** de confirmar la reserva y cancelar la cita al terminar (las citas mandan email y SMS).
- Si algo falla o sale algo fuera del plan, se para, se apunta en «Para decidir» y se pregunta a Cristian.
- Claude no borra datos, no toca permisos de seguridad ni mete contraseñas: eso va en «Lo que hace Cristian».
- Cada punto del plan se explica solo (qué es, para qué sirve, qué se decidió); nunca «explicado en el chat».

## Decisiones de Cristian (siguen valiendo)
| Tema | Decisión |
|---|---|
| Quién hace el trabajo en GHL | El dashboard por la API. Cero workflows de GHL para esto |
| Etiquetas | Las mismas en la web, el dashboard y GHL: `<web>-<form>-completo/-incompleto`, **en minúsculas** (GHL las guarda así). Registro `biblioteca-form-…`, agenda `biblioteca-agenda-…` |
| Etiquetas viejas | Se siguen poniendo como «etiquetas fijas» de la Entrada, por si algún workflow o lista de GHL las usa: registro `biblioteca recursos`, agenda `agenda biblioteca`. Se añaden siempre y nunca se quitan |
| Un envío por lead | Espera de **5 min** en todas las Entradas y un solo envío; si el cuestionario llega tarde, se actualiza y pasa de `-incompleto` a `-completo` (nunca al revés) |
| Qué es «completo» | Que algún envío del lead traiga `quiz_completed` = true. Se puede cambiar por Entrada («Completo si llega a true») |
| Oportunidad en GHL | Una por cada pipeline de la Entrada. Se busca si el contacto ya la tiene y se crea solo si no (el upsert de oportunidades de GHL no lleva `contactId`). Con «Primera columna», la que ya existe no se mueve; con una columna elegida, se mueve a esa |
| Agendas en el dashboard | **En los dos sitios**: el lead sigue en su pipeline (p. ej. «1. Biblioteca Recursos») y además tiene tarjeta en «0. Agendas General». Antes de reservar en «Form»; al reservar, la cita lo pasa a «Agendan». Etiqueta «Canal: …» desde el formulario (decisión del 17 oct, no volver a preguntar) |
| Agendas en GHL | Oportunidad en «0. Agendas Biblioteca» y en «0. Agendas General» (en General tienen que estar todas), en su primera columna («Form»). La de «0. Agendas Orgánico» que crea el calendario está bien. Con la espera de 5 min, si la persona reserva antes, las oportunidades se crean después y **se quedan en «Form»**: se deja así (Cristian, 7 nov) |
| Registro en GHL | Oportunidad en «1. Biblioteca Recursos → Registrados»; ahí se queda aunque la persona agende |
| Leads por lectura de 60 s | **10** (Cristian, 7 nov; antes 15). Un lead hace hasta 8 llamadas a GHL: 10 × 8 = 80, por debajo del límite de GHL (100 cada 10 s) |
| Leads duplicados (mismo teléfono, otro email) | Se quedan los 2; el envío ya no falla y el historial lo apunta. Plan para unirlos al final de todo |
| Manual para landings | Una skill (fase 5), no un documento |
| Workflows visuales (fase 4) | Lienzo como GHL; los emails de las secuencias siguen fuera |
| Vigilar | Lo revisa Cristian (agendas reales y monedero de GHL); no está en el plan de Claude |
| Entrada «Prueba GHL» | Se queda apagada para pruebas futuras |
| Leads de prueba | Los borra Cristian (en GHL y en el dashboard) |
| Cambios sin subir en el repo que no son de Claude | Claude no los toca (ver «Lo que hace Cristian») |
| Emails de la Biblioteca y Meta | Fuera del plan |
| Alcance | Solo Maestria |

---

## Lo que falta, en orden

### 1 · Mejoras pequeñas (Claude) ← siguiente
Una cada vez, con tests primero, PR y comprobación.
- [ ] **IMPORTANTE · Menos llamadas a GHL por lead** (Cristian, 7 nov). Hoy un lead hace hasta 8 llamadas; juntando, 3 a 5 (las columnas de GHL una vez por lectura y una sola búsqueda de oportunidades por contacto). Detalle en `docs/mejora-llamadas-ghl.md`. **Primero, revisar en la especificación de GHL** (`apps/opportunities.json`) **si hay una forma de crear varias oportunidades en una sola llamada** (no está comprobado).
- [ ] **Envíos en rojo siempre visibles y «Ver más»** (Cristian, 7 nov). *Qué pasa:* en Administración → Entradas (landings) → cada Entrada → «Últimos envíos recibidos» solo salen los 15 últimos (`page.tsx`, `evs.slice(0, 15)`), y la página carga como mucho los 200 últimos envíos de todas las Entradas juntas (`.limit(200)`). El 7 nov el envío en rojo del caso C quedó fuera de los 15 y no se veía su «Reintentar», aunque el aviso de arriba decía «Están en rojo abajo». Con más de 200 envíos, un rojo antiguo ni se cargaría ni se contaría en el aviso. *Decidido:* (1) los envíos en rojo de cada Entrada se buscan aparte, sin límite, y salen siempre arriba con su «Reintentar», y el aviso los cuenta bien; (2) debajo, los 15 últimos; (3) botón «Ver más» que carga 50 más cada vez. No se cargan todos de golpe (ya hay 39 envíos en el registro desde el 6 nov y cada uno lleva el formulario entero). *Tests primero:* un rojo más antiguo que los 200 últimos sale con su botón; «Ver más» trae los siguientes.
- [ ] **Reintentos cada 1 min de verdad.** Se vio el 6 nov que van cada 2 min, no cada 1. Arreglo apuntado entonces: programar el siguiente intento a +50 s (hoy +60 s, `REINTENTAR_EN` en `src/lib/ghl-envios.ts`). Comprobar la causa con un test antes de cambiarlo.
- [ ] **Proyectos sin calendarios.** La lectura de 60 s solo se lanza en proyectos con calendarios (`20261017120000_leer_ghl_cada_30s.sql`): un proyecto sin calendarios nunca mandaría a GHL.
- [ ] **Bloquear el bucle.** No dejar encender «Mandar a GHL» en una Entrada que alimenta un workflow de GHL (GHL → dashboard → GHL).
- [ ] **`BIBLIOTECA/build.py`** rehace `index.html` desde una fuente vieja (vuelve «AI» y quita `CM_HAS_ACCESS`): arreglar su fuente antes de volver a usarlo. Mientras tanto, no ejecutarlo.

### 2 · Fase 5 · Skill «conectar-web-al-dashboard» = el manual para landings (Claude)
*Por qué:* Cristian quiere que conectar una landing nueva sea fácil y siempre igual. Decidió que el manual sea una **skill** (instrucciones que Claude sigue paso a paso cada vez), no un documento para leer.
- [ ] Con el caso real de la Biblioteca y `kit-creador-maestria:crear-skills`. Contenido: los 7 pasos de «Cómo conectar una landing» (abajo) y lo aprendido con la Biblioteca: etiquetas `<web>-<form>-completo/-incompleto` en minúsculas; etiquetas viejas como etiquetas fijas; varios pipelines de GHL por Entrada en su primera columna (leer su nombre en el formulario antes de guardar); agendas en los dos sitios (su pipeline y «0. Agendas General → Form») con «Canal: …» desde una regla de la Entrada; espera de 5 min en todas las Entradas; el `utm_source` de la landing tiene que existir en `src/lib/canal.ts`; el contacto de GHL puede ser de otro lead (mismo teléfono); pruebas con `info+…@eternity.llc` y teléfonos 555-01xx; comprobar el día antes de reservar y cancelar la cita; aplicar migraciones antes de publicar; cómo volver atrás.
- [ ] En `app/.claude/skills/conectar-web-al-dashboard/`, con copia en `PROYECTOS/GENERAL/VENTAS/` y en `~/.claude/skills/`. Se prueba con la landing de agenda (punto 3).

### 3 · Fase 6 · Landing de agenda de `codigomaestria.com` (Claude, con la skill)
- [ ] `codigomaestria.com/agenda` (`LANDINGS/Landing agenda/Landing-agendar.html`, hoy manda al webhook `2f05f800…`), **con una Entrada**. Replicar las ramas por `utm_source` de su workflow (ver «Datos»). Con preview, prueba y Cristian la ve.
- [ ] Cuando ya no la use ninguna web, apagar el workflow «2 . WH - FORM AGENDA GENERAL» y su webhook (con permiso de Cristian).

### 4 · Fase 4 · Workflows visuales en el dashboard (plan propio antes de programar)
*Qué es:* un apartado del dashboard para crear workflows como los de GHL (disparador → pasos), para dejar de depender de los workflows de GHL.
**Decidido por Cristian (7 nov):** **lienzo como GHL** (cajas y flechas), no una lista; **los emails de las secuencias siguen fuera** (no hay acción de email).
**Propuesta de Claude (base para su plan propio):**
- **Workflow** = un disparador + pasos, dibujado en el lienzo. Tabla `workflows` (pasos en JSON, versión, encendido).
- **Disparadores v1:** llega a una Entrada · se añade una etiqueta · cambia de columna en el dashboard · se agenda / cancela una cita.
- **Acciones v1:** crear/actualizar contacto en GHL · añadir/quitar etiqueta · crear o mover oportunidad (en uno o varios pipelines) · mover de columna en el dashboard · esperar · rama «si el campo…».
- **Motor:** cada lead crea una ejecución (`workflow_ejecuciones`: paso, hora del siguiente, intentos, error); la lectura de 60 s la avanza, con los mismos reintentos, aviso en rojo, email de aviso y «Reintentar» de hoy.
- **Pantalla:** Administración → Workflows: el lienzo, el historial de cada lead (qué paso hizo y cuándo) y el interruptor.
- **Migración:** «Qué hacer en GHL» de cada Entrada pasa a ser su workflow; las reglas de pipeline, ramas.
- **Subfases:** 4a motor sin pantalla rehaciendo la Biblioteca (mismo resultado que hoy) · 4b lienzo de solo lectura · 4c edición en el lienzo · 4d disparadores de etiqueta, columna y cita.
- [ ] Hacer el plan propio de la fase 4 con estas decisiones y enseñárselo a Cristian antes de programar.

### 5 · Fase 6 · Optin y cierre de webhooks (después de la fase 4)
- [ ] **Optin** `LANDINGS/landing-codigomaestria/landing-ghl.html` (webhook `83c32b0a…`), con la skill.
- Regalos 1 a 7 y `regalos-maestria` (webhook `37e6bc4c…`, workflow `AP - Regalos` `c3bd1ba2…`): **de momento no** (Cristian, 7 nov).
- [ ] Apagar cada «Inbound Webhook» cuando todas sus webs estén cambiadas (Claude con Playwright, con permiso de Cristian).
- [ ] A final de mes, `inbound_webhook` cerca de $0 en el monedero.
- [ ] Actualizar `docs/GUIA-GHL.md` y `docs/plan.md`.

### 6 · Unir leads duplicados (al final de todo; Cristian, 7 nov)
**Contexto:** el dashboard reconoce a una persona por su contacto de GHL, por su email o, si no tiene email, por su teléfono (`src/lib/leads.ts`). GHL la reconoce por email **o** teléfono (`allowDuplicateContact: false`). Así, quien se registra dos veces con emails distintos y el mismo teléfono queda como **2 leads en el dashboard y 1 contacto en GHL**. Caso real: 6 nov, 23:06 y 23:07 UTC, teléfono …7112 (leads `e7cc481b…` y `c407dcf9…`, contacto `oIEMl9RNaQEANZQnLWEb`). Desde el 7 nov el envío ya no falla: el segundo lead no guarda el id de GHL y su historial dice «Es el mismo contacto de GHL que el lead …», pero los 2 leads siguen separados.
**Qué hay que decidir y diseñar (con Cristian, antes de programar):**
- Cuándo se consideran el mismo: ¿mismo teléfono (normalizado con `telefonoClave`)? ¿mismo contacto de GHL?
- Cuál se queda (¿el más antiguo?) y qué se junta: emails (¿un campo de emails secundarios?), respuestas, etiquetas, citas, ventas, actividades, tarjetas, reparto/caller.
- Automático al entrar o un botón «Unir» en la ficha del lead (Cristian revisa antes). Unir implica **borrar** un lead: lo confirma Cristian.
- Buscar cuántos duplicados hay hoy (por teléfono) antes de elegir.

---

## Lo que hace Cristian (Claude no puede)
- [ ] Borrar en GHL los contactos de prueba y sus oportunidades: «Prueba GHL Claude» (`info+pruebaghl@eternity.llc`) y «Prueba Biblioteca 1» a «6» (`info+bib1@` … `info+bib6@eternity.llc`). Sus citas (bib1 y bib6 el 12 nov, bib5 el 7 nov) ya están canceladas.
- [ ] Borrar también en el dashboard esos leads de prueba (están en «1. Biblioteca Recursos» y alguno con tarjeta en «0. Agendas General»; no se repartieron a ningún caller).
- [ ] Vigilar las primeras agendas reales (dashboard y GHL) y que el monedero de GHL ya no cobre `inbound_webhook` de la Biblioteca desde el 6 nov 19:40 UTC.
- [ ] Quitar `cristianortiz33` de colaborador en GitHub (`Dashboard-de-ventas` y `biblioteca-maestria` → Settings → Collaborators) y `cristianortizking33-7483` del equipo de Vercel si es miembro (Settings → Members).
- [ ] Poner otra vez la descripción de la integración «App Eternity (dashboard)» en GHL (quedó vacía; ya no es «solo lectura»).
- [ ] Rellenar o descartar el aviso de GHL que pide el **Tax ID** de la cuenta (sale al abrir fichas de contacto; Claude lo cierra sin guardar nada).
- [ ] Gestionar los cambios sin subir en el repo del dashboard que no son de Claude: 3 docs borrados (`Arreglar-dashboard.md`, `plan-historial-10oct.md`, `plan-historial-11oct.md`), `manual-branding-rojo.md` y `plan-callers.md` (este apareció el 7 nov). Claude no los toca.

## Para decidir (Cristian)
Nada pendiente a 7 nov.

---

## Datos que hacen falta

**API de GHL** (especificación oficial `github.com/GoHighLevel/highlevel-api-docs`, todo Version `2021-07-28`):
- `POST /contacts/upsert`: **nunca mandar `tags`** (borra todas). Etiquetas con `POST`/`DELETE /contacts/{id}/tags`. Campos: `customFields: [{ id, field_value }]`.
- Oportunidades: `GET /opportunities/search?location_id&contact_id&pipeline_id`, `POST /opportunities/`, `PUT /opportunities/{id}` (`opportunities.write`). Columnas: `GET /opportunities/pipelines` (la primera es la de menor `position`). El upsert de oportunidades no lleva `contactId`: no se usa.
- Límite: 100 llamadas cada 10 s.
- Maestria: `allowDuplicateContact: false` y `allowDuplicateOpportunity: false`. GHL guarda las etiquetas en minúsculas.

**Entradas del dashboard (Maestria)** (leídas en la base el 7 nov):
| Entrada | Id | Configuración |
|---|---|---|
| Web · Biblioteca registro | `087b86d1…` | Activa, GHL encendido, espera 300 s. Dashboard «1. Biblioteca Recursos». GHL «1. Biblioteca Recursos → Registrados». Etiqueta base `Biblioteca-form`, fija `biblioteca recursos`. Recibe de `api/signup.js` (`DASHBOARD_ENTRADA_URL` en Vercel) |
| Web · Biblioteca agenda | `bc00a154…` | Activa, GHL encendido, espera 300 s. Dashboard «0. Agendas General → Form» y regla `utm_source` igual a `agenda-biblioteca` → «Canal: Biblioteca». GHL «0. Agendas Biblioteca» y «0. Agendas General», primera columna («Form»). Etiqueta base `Biblioteca-agenda`, fija `agenda biblioteca`. Recibe de `web/programa.js` |
| GHL · Biblioteca | `b173a67a…` | Desactivada. La alimentaba el workflow «0. AP - Biblioteca», que ya no existe en GHL; no recibe nada desde el 16 oct |
| Prueba GHL | `e5a2bfa9…` | Apagada. Para repetir pruebas sin tocar las Entradas reales |

**Pipelines de GHL:**
- «1. Biblioteca Recursos» `dE7go9T3Mi2zbIT4sGME`: «Registrados» `9cb965ae-6b38-4a7d-a86b-3d2e9f45bb8d`, «Form Agenda» `77b3ce38-39b2-446d-b734-f38bc29c88e2` (ya no se usa), «Agendado» `f0c80531-c23f-4af5-b0a2-03c4095b432a`.
- «0. Agendas Biblioteca» `wym2Ue4VUqkhsFoQJ5PK` y «0. Agendas General» `zuQjPVJNbPpRlL0voy6d`: columnas Form, Agendan, Confirman, No confirman, No show, Cerrados, No cualifican, Seguimiento (leídas en el formulario de Entradas el 7 nov).
- Otros: «0. Agendas Orgánico» `3mtxrCYHQSnl1M701qeZ`, DFY `Gp15d7oeZFAMn1VHbcs1`, Email `Z956WNVUXKaHC98WZqfc`, P1 `FMcP2ukfTLiRab8OVAyL`, Webinar `1Vp4tJwZyUcRV3MWXVzg`, IG `5GyZUNh3NO2T2W6EU1No`, Callers `VLYV8BXsw7OyUWoJ14va`, Triage YT `oekHKZXhsaYBayDgeTAn`, «2. Webinar 1» `VOdw0hGaASMezASsh4Le`, «3. DFY AI Services» `gH0QEXRNnaR759F7TvxJ`.

**Pipelines del dashboard (Maestria):** «0. Agendas General» `7bf529f6-a5e9-44e8-9a3a-25be6d9f9ac0` (columnas: Form `4a0469a9-edbc-41ca-999a-7aab1694dab6`, Agendan `598b75d0-5a95-4241-b61a-387ef3b75aa1`, Confirman, No confirman, No show, Cerrados, No cualifican, Seguimiento), «1. Biblioteca Recursos» `eb300c25-406e-45d0-9d43-5285f988233e`, «2. Webinar 1», «3. DFY AI Services», «4. Leads WhatsApp».

**Canales de las agendas** (`src/lib/canal.ts`): el canal sale del `utm_source` de la página donde se reserva; los que no están en la lista salen como «Otro». `agenda-biblioteca` → Biblioteca (desde el 7 nov).

**Campos de la agenda** (los unió la Entrada de la agenda): situación `ILrgHLZsc1TX8lBYWzfM`, ingresos `IWPSlOz1dKbkwg8SvK9p`, relación con la IA `jvsMaWoh9FSMzuZ5pLHk`, objetivo a 12 meses `oYaZveSEzoLWPZ7hoM1M`, inversión `7I9zm2KGljAr1X4l6xmR`, «Lead cualificado?» `tYv72lGm4gMaK2l7eujl` ← `qualified`, `utm_source` `BPs2vrG7eqH7D3d5zJEf`, urgencia `pLkktkvmSexGPkZpyW8J`, decisor `9MtM6cI7dArWZx725GuI`.

**Workflow «2 . WH - FORM AGENDA GENERAL»** (`6dd710da…`, webhook `2f05f800…`): ramas por `utm_source` (YouTube, BIBLIOTECA, Instagram, P1, Callers, Email, Webinar, DFY y «otro»); cada una crea la oportunidad en su pipeline y pone su etiqueta. Rama BIBLIOTECA: pipeline `dE7go…`, columna `77b3ce38…`, etiqueta `agenda biblioteca`. Hace falta para la landing de agenda.

## Riesgos
- **Si el dashboard no responde**, el lead no llega a GHL hasta que vuelva: lo cubren los reintentos, el email y el aviso.
- **Permisos de escritura en uso** (`contacts.write`, `opportunities.write`): si la clave se filtrara, se podrían cambiar contactos y oportunidades.
- **La dirección de la Entrada de la agenda va en el navegador**, como antes el webhook: la frenan el límite de 300 por minuto y el filtro de email/teléfono.
- **Límite de la API de GHL:** 100 llamadas cada 10 s; hoy hasta 8 por lead y 10 leads por lectura (80). La mejora «Menos llamadas a GHL» lo baja.
- **Las citas reales mandan email y SMS** desde los workflows del calendario de GHL: en las pruebas, teléfonos de ficción (555-01xx) y cancelar la cita.

## Cómo volver atrás
- **Registro de la Biblioteca:** volver a publicar `6041cce` de la Biblioteca, poner en Publish «0. AP - Biblioteca de recursos» y activar la Entrada «GHL · Biblioteca».
- **Agenda de la Biblioteca:** volver a publicar `bfcb006` de la Biblioteca. El webhook `2f05f800…` y su workflow «2 . WH - FORM AGENDA GENERAL» **no se apagan**: los usa `codigomaestria.com/agenda`.
- **A, B y C (dashboard):** revertir el PR #21 en GitHub (las 2 columnas nuevas, `ghl_oportunidades` y `ghl_etiquetas_extra`, se pueden quedar: el código de antes no las lee) y volver a poner en la Entrada de la agenda el pipeline de GHL «1. Biblioteca Recursos → Form Agenda» y el del dashboard «1. Biblioteca Recursos».

---

## Cómo conectar una landing (sin webhooks de GHL)
Lo mismo que se hizo con la Biblioteca, en 7 pasos. Una landing cada vez; hasta que funciona en producción no se pasa a la siguiente. Cuando exista la skill (fase 5), estos pasos van en ella; cuando existan los workflows del dashboard (fase 4), el paso 2 será crear el workflow.

1. **Leer lo de hoy:** qué manda la landing (abrir el código y ver el JSON) y qué hace su workflow de GHL (con Playwright): campos, etiqueta, pipeline, columna y ramas.
2. **Crear su Entrada** en Administración → Entradas: nombre `Web · <landing> <form>`, pipeline del dashboard y, en «Qué hacer en GHL», los campos unidos (UTM incluidos), sus pipelines de GHL («Añadir pipeline»), etiqueta base `<web>-<form>` (en minúsculas), etiquetas fijas si hacen falta y espera de 5 min. Dejar «Mandar a GHL» apagado hasta la prueba.
3. **Cambiar la landing:**
   - si manda **desde el servidor** (como `api/signup.js`): variable `DASHBOARD_ENTRADA_URL` en Vercel (Production y Preview) y POST con 2 intentos y 5 s;
   - si manda **desde el navegador** (como `programa.js`): la dirección de la Entrada en el código, con 3 intentos; el dashboard ya acepta CORS.
   - En los dos casos, el mismo JSON de antes con la etiqueta nueva; fuera la URL del webhook de GHL.
4. **Probar en el preview de Vercel** con leads de prueba (`info+<landing>N@eternity.llc` y teléfonos de ficción 555-01xx): completo, incompleto y tardío. Comprobar en el dashboard (1 lead, su pipeline, `ok`) y en GHL (contacto, campos, etiquetas y oportunidades). Si hay calendario, reservar (comprobando el día) y cancelar.
5. **Encender** «Mandar a GHL», **publicar** la landing y **apagar** su workflow de GHL (o solo su rama, si el webhook lo comparten otras webs).
6. **Probar una vez en producción** y vigilar 24 h (Administración → Entradas sin rojos; monedero de GHL).
7. **Apuntar** cómo volver atrás (commit anterior de la landing + encender el workflow) y pasar los contactos de prueba a Cristian para borrarlos.
