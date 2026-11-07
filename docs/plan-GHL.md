# Plan · Leads al dashboard primero (sin webhooks de GHL)

> Versión 15 (7 nov 2026). **Solo lo que falta**, en orden. Cada punto se explica solo, sin depender del chat.
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
| 4 · Workflows visuales (motor y lienzo para editar) | Pendiente. Diseño decidido; falta su plan propio |
| 5 · Skill «conectar-web-al-dashboard» (el manual de landings) | Pendiente, **después** de los workflows y el lienzo |
| 6 · Landing de agenda de `codigomaestria.com` | Pendiente, **después** de los workflows visuales |
| 6 · Optin | Pendiente |
| Unir leads duplicados | Pendiente |
| Al final | Proyectos sin calendarios · mover `codigomaestria.com` de GHL a Vercel |

**Orden (Cristian):** mejoras pequeñas → workflows visuales con su lienzo para editar (fase 4) → skill (fase 5) → landing de agenda (fase 6) → optin (fase 6) → unir duplicados → al final, proyectos sin calendarios y mover `codigomaestria.com` a Vercel. Regalos: de momento no. Solo Maestria.

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
- Cada punto del plan se explica solo; nunca «explicado en el chat».

## Decisiones de Cristian (siguen valiendo)
| Tema | Decisión |
|---|---|
| Quién hace el trabajo en GHL | El dashboard por la API. Cero workflows de GHL para esto |
| Etiquetas | Las mismas en la web, el dashboard y GHL: `<web>-<form>-completo/-incompleto`, **en minúsculas** (GHL las guarda así). Registro `biblioteca-form-…`, agenda `biblioteca-agenda-…` |
| Etiquetas viejas | Se siguen poniendo como «etiquetas fijas» de la Entrada, por si algún workflow o lista de GHL las usa: registro `biblioteca recursos`, agenda `agenda biblioteca`. Se añaden siempre y nunca se quitan |
| Un envío por lead | Espera de **5 min** en todas las Entradas y un solo envío; si el cuestionario llega tarde, se actualiza y pasa de `-incompleto` a `-completo` (nunca al revés) |
| Qué es «completo» | Que algún envío del lead traiga `quiz_completed` = true. Se puede cambiar por Entrada («Completo si llega a true») |
| Oportunidad en GHL | Una por cada pipeline de la Entrada. Se busca si el contacto ya la tiene y se crea solo si no (el upsert de oportunidades de GHL no lleva `contactId`). Con «Primera columna», la que ya existe no se mueve; con una columna elegida, se mueve a esa |
| Agendas en el dashboard | **En los dos sitios**: el lead sigue en su pipeline (p. ej. «1. Biblioteca Recursos») y además tiene tarjeta en «0. Agendas General». Antes de reservar en «Form»; al reservar, la cita lo pasa a «Agendan». Etiqueta «Canal: …» desde el formulario. No volver a preguntar |
| Agendas en GHL | Oportunidad en «0. Agendas Biblioteca» y en «0. Agendas General» (en General tienen que estar todas), en su primera columna («Form»). La de «0. Agendas Orgánico» que crea el calendario está bien. Con la espera de 5 min, si la persona reserva antes, las oportunidades se crean después y **se quedan en «Form»**: se deja así |
| Registro en GHL | Oportunidad en «1. Biblioteca Recursos → Registrados»; ahí se queda aunque la persona agende |
| Leads por lectura de 60 s | **10** (antes 15). Un lead hace hasta 8 llamadas a GHL: 10 × 8 = 80, por debajo del límite de GHL (100 cada 10 s) |
| Agendas de `codigomaestria.com` | El calendario sigue en GHL. Lo que se trae al dashboard es el **formulario** de cada agenda: sus UTM, sus etiquetas y a dónde va cada lead, igual que lo hace hoy GHL |

---

## Lo que falta, en orden

### 1 · Mejoras pequeñas (Claude) ← siguiente
Una cada vez, con tests primero, **un PR por mejora** y comprobación.
- [ ] **URGENTE · `BIBLIOTECA/build.py` puede dejar la Biblioteca sin recoger leads.** Cristian no lo usa nunca, pero no puede existir la posibilidad. *Qué hace* (leído en el código, sin ejecutarlo): lee la copia vieja `original/*.html` y **reescribe** `index.html`, `recursos.html`, `repos.html` y `programa.html` de la web. Sin `--publicar` deja el formulario de registro con `endpoint: ''` («modo demo», no envía nada; líneas 78–79); también vuelve «AI» y quita `CM_HAS_ACCESS`. Si ese `index.html` se publicara, **los registros dejarían de llegar al dashboard**. *Cómo se arregla:* lo está revisando otra sesión, en la carpeta de la Biblioteca («Revisar build.py de la Biblioteca»): de dónde sale, si puede llegar a la web publicada y qué arreglo propone. Cristian decide allí. Es otro repo (`biblioteca-maestria`): su propio PR.
- [ ] **IMPORTANTE · Menos llamadas a GHL por lead.** Hoy un lead hace hasta 8 llamadas; juntando, 3 a 5 (las columnas de GHL una vez por lectura y una sola búsqueda de oportunidades por contacto). Detalle en `docs/mejora-llamadas-ghl.md`. **Primero, revisar en la especificación de GHL** (`apps/opportunities.json`) **si hay una forma de crear varias oportunidades en una sola llamada** (no está comprobado).
- [ ] **Envíos en rojo siempre visibles y «Ver más».** *Qué pasa:* en Administración → Entradas → cada Entrada → «Últimos envíos recibidos» solo salen los 15 últimos (`page.tsx`, `evs.slice(0, 15)`), y la página carga como mucho los 200 últimos envíos de todas las Entradas (`.limit(200)`). Un envío en rojo antiguo no se ve (pasó el 7 nov) y, con más de 200, ni se cuenta en el aviso. *Decidido:* (1) los envíos en rojo se buscan aparte, sin límite, y salen siempre arriba con su «Reintentar»; (2) debajo, los 15 últimos; (3) botón «Ver más» que carga 50 más cada vez (todos de golpe no: cada envío lleva el formulario entero). *Tests primero:* un rojo más antiguo que los 200 últimos sale con su botón; «Ver más» trae los siguientes.
- [ ] **Reintentos cada 1 min de verdad.** Se vio el 6 nov que van cada 2 min. Arreglo propuesto: programar el siguiente intento a +50 s (hoy +60 s, `REINTENTAR_EN` en `src/lib/ghl-envios.ts`). Comprobar la causa con un test antes de cambiarlo.
- [ ] **Bloquear el bucle.** *Qué es:* una Entrada puede recibir leads desde un workflow de GHL (como la vieja «GHL · Biblioteca»). Si además tuviera «Mandar a GHL» encendido, el dashboard escribiría en el contacto de GHL, eso podría volver a disparar el workflow, que mandaría otra vez al dashboard, y así sin parar (muchas llamadas y quizá cobros). Hoy no pasa (esa Entrada está desactivada). *Decidido:* (1) interruptor en la Entrada «La alimenta un workflow de GHL»; si está encendido, no deja encender «Mandar a GHL»; (2) **email a info@eternity.llc** en los dos casos: cuando alguien intenta encender «Mandar a GHL» en una Entrada marcada (y se bloquea) y cuando el dashboard ve que pasa de verdad (el mismo lead entra desde GHL justo después de que el dashboard se lo mandara).

### 2 · Fase 4 · Workflows visuales en el dashboard (plan propio antes de programar)
*Qué es:* un apartado del dashboard para crear workflows como los de GHL (disparador → pasos), para dejar de depender de los workflows de GHL.
**Decidido:** **lienzo como GHL** (cajas y flechas), no una lista; **sin acción de email** (los emails de las secuencias siguen fuera). Va **antes** de la landing de agenda porque esa landing reparte cada lead según su `utm_source`, y eso necesita ramas: con los workflows se tiene que poder hacer lo que hace hoy el workflow de GHL «2 . WH - FORM AGENDA GENERAL» con el formulario de cada agenda (leer sus UTM, ponerle etiquetas y mandar cada lead a su sitio). El calendario sigue en GHL. **En la app tiene que quedar igual que ese workflow de GHL** (Cristian: el de GHL está bien así).
**Propuesta de Claude (base para su plan propio):**
- **Workflow** = un disparador + pasos, dibujado en el lienzo. Tabla `workflows` (pasos en JSON, versión, encendido).
- **Disparadores v1:** llega a una Entrada · se añade una etiqueta · cambia de columna en el dashboard · se agenda / cancela una cita.
- **Acciones v1:** crear/actualizar contacto en GHL · añadir/quitar etiqueta · crear o mover oportunidad (en uno o varios pipelines) · mover de columna en el dashboard · esperar · rama «si el campo…».
- **Motor:** cada lead crea una ejecución (`workflow_ejecuciones`: paso, hora del siguiente, intentos, error); la lectura de 60 s la avanza, con los mismos reintentos, aviso en rojo, email de aviso y «Reintentar» de hoy.
- **Pantalla:** Administración → Workflows: el lienzo, el historial de cada lead (qué paso hizo y cuándo) y el interruptor.
- **Migración:** «Qué hacer en GHL» de cada Entrada pasa a ser su workflow; las reglas de pipeline, ramas.
- **Subfases:** 4a motor sin pantalla rehaciendo la Biblioteca (mismo resultado que hoy) · 4b lienzo de solo lectura · 4c edición en el lienzo · 4d disparadores de etiqueta, columna y cita. **4a, 4b y 4c antes de la landing de agenda; 4d después** (Cristian).
- [ ] Hacer el plan propio de la fase 4 con estas decisiones y enseñárselo a Cristian antes de programar.

### 3 · Fase 5 · Skill «conectar-web-al-dashboard» = el manual para landings (Claude, después de los workflows y el lienzo)
*Por qué:* que conectar una landing nueva sea fácil y siempre igual. Es una **skill** (instrucciones que Claude sigue paso a paso), no un documento. Va después de los workflows porque su paso 2 será «crear el workflow» y se prueba en seguida con la landing de agenda.
- [ ] Con el caso real de la Biblioteca y `kit-creador-maestria:crear-skills`. Contenido: los 7 pasos de «Cómo conectar una landing» (abajo) y lo aprendido con la Biblioteca: etiquetas `<web>-<form>-completo/-incompleto` en minúsculas; etiquetas viejas como etiquetas fijas; varios pipelines de GHL por Entrada en su primera columna (leer su nombre en el formulario antes de guardar); agendas en los dos sitios (su pipeline y «0. Agendas General → Form») con «Canal: …» desde una regla de la Entrada; espera de 5 min en todas las Entradas; el `utm_source` de la landing tiene que existir en `src/lib/canal.ts`; el contacto de GHL puede ser de otro lead (mismo teléfono); pruebas con `info+…@eternity.llc` y teléfonos 555-01xx; comprobar el día antes de reservar y cancelar la cita; aplicar migraciones antes de publicar; cómo volver atrás.
- [ ] Una sola copia, en `app/.claude/skills/conectar-web-al-dashboard/`; `~/.claude/skills/conectar-web-al-dashboard` apunta a ella con un enlace. Se prueba con la landing de agenda.

### 4 · Fase 6 · Landing de agenda de `codigomaestria.com` (Claude, con la skill y los workflows)
- [ ] `codigomaestria.com/agenda` (`LANDINGS/Landing agenda/Landing-agendar.html`, hoy manda al webhook `2f05f800…`), **con una Entrada** y su workflow del dashboard. Hacer lo mismo que hace hoy su workflow de GHL con el formulario (ramas por `utm_source`, ver «Datos»): leerlo antes con Playwright. La página y el calendario siguen en GHL. **El cambio en la página lo hace Cristian:** Claude le da la dirección de la Entrada (`https://dashboard.eternity.llc/api/webhooks/entrada/<clave>`) y él la pone en GHL en lugar del webhook actual. Antes, Claude lee `Landing-agendar.html` para confirmar que el JSON que manda vale tal cual. Con prueba, y Cristian la ve.
- [ ] Cuando ya no la use ninguna web, apagar el workflow «2 . WH - FORM AGENDA GENERAL» y su webhook (con permiso de Cristian).
- [ ] **Pestaña «UTMs» en KPIs** (Cristian), **antes** de publicar la landing de agenda, para ver sus UTM desde el primer día. Al lado de «Leads» (KPIs → Leads · Funnel · Por persona · Objetivos) y **solo para jefes**, como «Leads». Un lugar donde se siguen **los UTM y las etiquetas, por landing (Entrada) y en general**:
  - una tabla con cada lead, su landing, sus UTM (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`) y sus etiquetas;
  - filtros por fechas, por landing, por cada UTM y por etiqueta;
  - arriba, totales por `utm_source`, por campaña y por etiqueta.
  Hoy los UTM ya se guardan en cada lead (`seguimiento`) y las etiquetas en `etiquetas`. Plan propio corto (qué consultas y qué pantalla) antes de programar.

### 5 · Fase 6 · Optin y cierre de webhooks
- [ ] **Optin** `LANDINGS/landing-codigomaestria/landing-ghl.html` (webhook `83c32b0a…`), con la skill.
- Regalos 1 a 7 y `regalos-maestria` (webhook `37e6bc4c…`, workflow `AP - Regalos` `c3bd1ba2…`): **de momento no**.
- [ ] Apagar cada «Inbound Webhook» cuando todas sus webs estén cambiadas (Claude con Playwright, con permiso de Cristian).
- [ ] A final de mes, `inbound_webhook` cerca de $0 en el monedero.
- [ ] Actualizar `docs/GUIA-GHL.md` y `docs/plan.md`.

### 6 · Unir leads duplicados
**Contexto:** el dashboard reconoce a una persona por su contacto de GHL, por su email o, si no tiene email, por su teléfono (`src/lib/leads.ts`). GHL la reconoce por email **o** teléfono. Así, quien se registra con dos emails y el mismo teléfono queda como **2 leads en el dashboard y 1 contacto en GHL** (caso real: leads `e7cc481b…` y `c407dcf9…`, contacto `oIEMl9RNaQEANZQnLWEb`). El envío ya no falla (el segundo lead no guarda el id de GHL y su historial lo apunta), pero siguen siendo 2 leads. Hoy se quedan los 2.
**Qué hay que decidir y diseñar (con Cristian, antes de programar):**
- Cuándo se consideran el mismo: ¿mismo teléfono (normalizado con `telefonoClave`)? ¿mismo contacto de GHL?
- Cuál se queda (¿el más antiguo?) y qué se junta: emails (¿un campo de emails secundarios?), respuestas, etiquetas, citas, ventas, actividades, tarjetas, reparto/caller.
- Automático al entrar o un botón «Unir» en la ficha del lead (Cristian revisa antes). Unir implica **borrar** un lead: lo confirma Cristian.
- Buscar cuántos duplicados hay hoy (por teléfono) antes de elegir.

### 7 · Al final
- [ ] **Proyectos sin calendarios.** La lectura de 60 s solo se lanza en proyectos con calendarios (`20261017120000_leer_ghl_cada_30s.sql`): un proyecto sin calendarios nunca mandaría a GHL. Hoy no afecta (Maestria tiene calendarios).
- [ ] **Mover `codigomaestria.com` de GHL a Vercel.**

---

## Lo que hace Cristian (Claude no puede)
- [ ] Borrar en GHL los contactos de prueba y sus oportunidades: «Prueba GHL Claude» (`info+pruebaghl@eternity.llc`) y «Prueba Biblioteca 1» a «6» (`info+bib1@` … `info+bib6@eternity.llc`). Sus citas (bib1 y bib6 el 12 nov, bib5 el 7 nov) ya están canceladas.
- [ ] Borrar también en el dashboard esos leads de prueba.
- [ ] Vigilar las primeras agendas reales (dashboard y GHL).
- [ ] Quitar `cristianortiz33` de colaborador en GitHub (`Dashboard-de-ventas` y `biblioteca-maestria` → Settings → Collaborators) y `cristianortizking33-7483` del equipo de Vercel si es miembro (Settings → Members).
- [ ] Poner otra vez la descripción de la integración «App Eternity (dashboard)» en GHL (quedó vacía; ya no es «solo lectura»).
- [ ] Rellenar o descartar el aviso de GHL que pide el **Tax ID** de la cuenta (sale al abrir fichas de contacto; Claude lo cierra sin guardar nada).

## Para decidir (Cristian)
- **`build.py`:** en revisión en otra sesión («Revisar build.py de la Biblioteca»).

---

## Datos que hacen falta

**API de GHL** (especificación oficial `github.com/GoHighLevel/highlevel-api-docs`, todo Version `2021-07-28`):
- `POST /contacts/upsert`: **nunca mandar `tags`** (borra todas). Etiquetas con `POST`/`DELETE /contacts/{id}/tags`. Campos: `customFields: [{ id, field_value }]`.
- Oportunidades: `GET /opportunities/search?location_id&contact_id&pipeline_id`, `POST /opportunities/`, `PUT /opportunities/{id}` (`opportunities.write`). Columnas: `GET /opportunities/pipelines` (la primera es la de menor `position`). El upsert de oportunidades no lleva `contactId`: no se usa.
- Límite: 100 llamadas cada 10 s.
- Maestria: `allowDuplicateContact: false` y `allowDuplicateOpportunity: false`. GHL guarda las etiquetas en minúsculas.

**Entradas del dashboard (Maestria):**
| Entrada | Id | Configuración |
|---|---|---|
| Web · Biblioteca registro | `087b86d1…` | Activa, GHL encendido, espera 300 s. Dashboard «1. Biblioteca Recursos». GHL «1. Biblioteca Recursos → Registrados». Etiqueta base `Biblioteca-form`, fija `biblioteca recursos`. Recibe de `api/signup.js` (`DASHBOARD_ENTRADA_URL` en Vercel) |
| Web · Biblioteca agenda | `bc00a154…` | Activa, GHL encendido, espera 300 s. Dashboard «0. Agendas General → Form» y regla `utm_source` igual a `agenda-biblioteca` → «Canal: Biblioteca». GHL «0. Agendas Biblioteca» y «0. Agendas General», primera columna («Form»). Etiqueta base `Biblioteca-agenda`, fija `agenda biblioteca`. Recibe de `web/programa.js` |
| GHL · Biblioteca | `b173a67a…` | Desactivada. La alimentaba el workflow «0. AP - Biblioteca», que ya no existe en GHL; no recibe nada desde el 16 oct |
| Prueba GHL | `e5a2bfa9…` | Apagada. Se queda para repetir pruebas sin tocar las Entradas reales |

**Pipelines de GHL:**
- «1. Biblioteca Recursos» `dE7go9T3Mi2zbIT4sGME`: «Registrados» `9cb965ae-6b38-4a7d-a86b-3d2e9f45bb8d`, «Form Agenda» `77b3ce38-39b2-446d-b734-f38bc29c88e2` (ya no se usa), «Agendado» `f0c80531-c23f-4af5-b0a2-03c4095b432a`.
- «0. Agendas Biblioteca» `wym2Ue4VUqkhsFoQJ5PK` y «0. Agendas General» `zuQjPVJNbPpRlL0voy6d`: columnas Form, Agendan, Confirman, No confirman, No show, Cerrados, No cualifican, Seguimiento .
- Otros: «0. Agendas Orgánico» `3mtxrCYHQSnl1M701qeZ`, DFY `Gp15d7oeZFAMn1VHbcs1`, Email `Z956WNVUXKaHC98WZqfc`, P1 `FMcP2ukfTLiRab8OVAyL`, Webinar `1Vp4tJwZyUcRV3MWXVzg`, IG `5GyZUNh3NO2T2W6EU1No`, Callers `VLYV8BXsw7OyUWoJ14va`, Triage YT `oekHKZXhsaYBayDgeTAn`, «2. Webinar 1» `VOdw0hGaASMezASsh4Le`, «3. DFY AI Services» `gH0QEXRNnaR759F7TvxJ`.

**Pipelines del dashboard (Maestria):** «0. Agendas General» `7bf529f6-a5e9-44e8-9a3a-25be6d9f9ac0` (columnas: Form `4a0469a9-edbc-41ca-999a-7aab1694dab6`, Agendan `598b75d0-5a95-4241-b61a-387ef3b75aa1`, Confirman, No confirman, No show, Cerrados, No cualifican, Seguimiento), «1. Biblioteca Recursos» `eb300c25-406e-45d0-9d43-5285f988233e`, «2. Webinar 1», «3. DFY AI Services», «4. Leads WhatsApp».

**Canales de las agendas** (`src/lib/canal.ts`): el canal sale del `utm_source` de la página donde se reserva; los que no están en la lista salen como «Otro». `agenda-biblioteca` → Biblioteca.

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
