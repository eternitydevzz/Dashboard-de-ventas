# Plan · Leads al dashboard primero (sin webhooks de GHL)

> Versión 21 (7 nov 2026). **Solo lo que falta**, en orden. Cada punto se explica solo, sin depender del chat.
> Lo hecho (fases 0 a 3 y A, B y C, con todas sus pruebas) está en git: `git show fe672d9:docs/plan-GHL.md`.

**Objetivo:** web → dashboard.eternity.llc → el dashboard hace en GHL, por la API, contacto, campos, etiquetas y oportunidades. Sin «Inbound Webhook» de pago (en octubre: $66,60, el 28 % del monedero).

## Dónde estamos

| Fase | Estado |
|---|---|
| 0 · Leer la API y los workflows de GHL | Hecha |
| 1 · El dashboard hace en GHL lo que hacía el workflow | Hecha (PR #9 y #10) |
| 2 · Registro de la Biblioteca sin webhook | Hecha (biblioteca-maestria PR #1) |
| 3 · Agenda de la Biblioteca sin webhook, con A, B y C | Hecha (biblioteca-maestria PR #2 y dashboard PR #21). Probada en producción con bib6 el 7 nov |
| Panel de endpoints en el dashboard | Hecho (dashboard PR #33, 7 nov). Probado en producción |
| **4 · Workflows visuales (motor y lienzo de lectura y edición)** | **← Siguiente.** Plan propio aprobado (`docs/plan-workflows.md`). 4a hecha (PR #38 y #40): la Biblioteca está en modo prueba desde el 7 nov; Cristian decide «Pasar a real» después del 10 nov. 4b hecha (PR #42, pestaña Workflows). 4c: editor hecho (PR #45); rehacer «2 . WH - FORM AGENDA GENERAL», aplazado por Cristian. Siguiente: 2 · Revisar todo con Cristian |
| Revisión de todo con Cristian | Hecha el 7 nov: Cristian la dio por buena, sin cambios |
| Template de landings, skill y archivos del equipo | Hecho el 7 nov (PR #55), salvo pasar las 2 landings de la Biblioteca al JSON v1: después del 10 nov |
| Mejoras pequeñas | Pendiente; cuándo, por decidir |
| 6 · Landing de agenda de `codigomaestria.com` | Pendiente, **después** de los workflows visuales |
| 6 · Optin | Pendiente |
| Unir leads duplicados | Pendiente |
| Al final | Proyectos sin calendarios · mover `codigomaestria.com` de GHL a Vercel |

**Orden (Cristian, 7 nov: «vamos por partes»):** panel de endpoints (hecho) → workflows visuales con su lienzo (fase 4) → revisar todo con Cristian → si está bien, template, skill y archivos del equipo → landing de agenda (fase 6) → optin (fase 6) → unir duplicados → al final, proyectos sin calendarios y mover `codigomaestria.com` a Vercel. Regalos: de momento no. Solo Maestria.

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

### 0 · Panel de endpoints en el dashboard (Claude) — HECHO el 7 nov (dashboard PR #33, `8c83d6b`)
*Qué es:* Administración → Entradas rediseñada para **crear los endpoints nuevos y gestionarlos todos juntos**, pensada para un principiante. Boceto v2 aprobado por Cristian el 7 nov.
**Decidido por Cristian (7 nov):**
- Es la pestaña de siempre (Administración → Entradas), rediseñada; no un panel aparte. Solo la ven los jefes, como antes (`puedeAdmin`).
- Cada Entrada enseña sus leads recibidos, cuándo llegó el último y si alguno no llegó a GHL.
- Botón «Copiar ejemplo de lo que tiene que mandar» (JSON v1, sin la clave).
- La mejora «Envíos en rojo siempre visibles y "Ver más"» va dentro del panel (hecha).
- Que el dashboard entienda el JSON v1 y guarde la IP **va con el punto 3**, no con el panel.
- Columnas nuevas en `entradas`: `landing`, `formulario`, `envia_desde` (navegador / servidor / vacío = «no lo sé») y `archivo`. El endpoint no las lee.
- **Un solo «Guardar»** por Entrada (antes había dos: «Guardar» y «Guardar lo de GHL»). Comprueba todo y escribe todo junto: o se guarda todo o nada.
- **Guardado a mano** (no automático) con aviso «Tienes cambios sin guardar» y aviso del navegador antes de salir o recargar.
- «Archivo» se rellena en «Cambiar ajustes» y se ve en «Para el programador»; al crear solo se preguntan 5 cosas.
**Cómo es:**
- Arriba, 3 pasos para conectar una landing. Cada Entrada es una tarjeta: nombre, estado en palabras («Recibiendo leads», «Apagada: no recibe nada», «Esperando el primer lead»), de qué landing y formulario viene, leads recibidos, último envío, «✓ Todos llegaron a GHL» y «Copiar dirección» (la dirección se ve cortada, `…/entrada/7c1e…a90f`, y se copia entera).
- Si algún envío no llegó a GHL: caja roja con cada uno y su «Reintentar», aunque sea antiguo (antes solo se veían entre los 200 últimos).
- Desplegables: «Ver los últimos leads» (15 y «Ver más» de 50 en 50), «Cambiar ajustes» (nombre, landing, reglas y «Qué hacer en GHL» como antes, un «Guardar» y, aparte, con confirmación: «Cambiar la dirección», «Apagar/Encender» y «Borrar») y «Para el programador».
- Abajo, «Para el programador: qué responde el dashboard»: 200, 400, 404, 413, 422 (guarda el envío, no crea lead), 429 y 500 (leído en `route.ts`).
- «Conectar una landing nueva»: 5 preguntas numeradas (nombre, landing, formulario, desde dónde envía, pipeline).
**Código:** `src/app/(panel)/admin/page.tsx`, `entradas.tsx`, `entradas-envios.tsx`, `acciones.ts` (`guardarEntradaCompleta`, `cambiarActivaEntrada`, `masEnviosEntrada`), `src/lib/entradas-panel.ts`, `src/lib/entradas-datos.ts`. Migración `20261107140000_panel_entradas.sql` (solo añade): las 4 columnas, función `resumen_entradas` (envíos, leads distintos, rojos y último en una consulta; solo `service_role`) e índice de envíos en rojo. Rellenó las 4 columnas en las 2 Entradas de la Biblioteca.
**Pruebas (7 nov):**
- Tests primero: `tests/unit/entradas-panel.test.ts` (16) y `tests/integracion/entradas-panel.test.ts` (14). GitHub: unitarios 328/328 e integración 309/309.
- Migración aplicada en producción antes de fusionar (`db push --dry-run` → solo esta; después `db push`). En producción, la función responde a `service_role` y da **401** a una clave pública.
- Producción con Playwright: el panel sale publicado; cifras iguales a la base (registro 22 leads / 44 envíos, agenda 3 / 6, GHL · Biblioteca 474 / 499, Prueba GHL 1 / 4); sin errores en la consola; ninguna clave entera a la vista; **sin scroll horizontal** a 1440 px y a 390 px (también con todo desplegado).
- En «Prueba GHL»: cambiar «Landing» → sale el aviso → «Guardar» → en la base `landing = prueba` y el resto de lo de GHL igual; después se dejó vacía otra vez. «Ver más» en el registro: de 15 a 44 y el botón desaparece.
- Las 2 Entradas reales: misma configuración que antes (activas, GHL, 300 s, sus etiquetas) y sin rojos. Desde la publicación (14:47 UTC) aún no había llegado ningún lead real; se comprobó que sus direcciones responden con el código nuevo mandando un JSON mal escrito → **400** (la Entrada existe y está activa; no se guarda nada) y 0 envíos nuevos creados.
**No probado:** el aviso del navegador al salir con cambios sin guardar (Playwright no enseña ese diálogo); «Cambiar la dirección», «Apagar» y «Borrar» en producción (no se tocaron); crear una Entrada nueva en producción (probado solo en los tests de integración).

### 1 · Fase 4 · Workflows visuales en el dashboard (plan propio antes de programar)
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
- [x] Hacer el plan propio de la fase 4 con estas decisiones: **`docs/plan-workflows.md`** (7 nov). Allí están las decisiones nuevas de Cristian (lienzo con HTML y CSS sin dependencias, modo de prueba en paralelo para la Biblioteca, 4a en detalle), el motor, las tablas, los tests y lo que falta.
- [x] Cristian aprueba `docs/plan-workflows.md` (7 nov).
- [x] 4a-1 (motor y modo prueba) hecha y publicada el 7 nov (PR #38). La Biblioteca está en prueba hasta al menos el 10 nov. Detalle y lo que falta en `docs/plan-workflows.md`.

### 2 · Revisar todo con Cristian
- [x] Repasar juntos el panel de endpoints y los workflows en el dashboard. **Hecho el 7 nov:** Cristian la dio por buena, sin cambios, y pidió pasar al punto 3.
- [x] Pasada de punta a punta con datos reales: registro de prueba en la Biblioteca (`info+wf1@eternity.llc`, teléfono (201) 555-0101) el 7 nov a las 18:35 UTC. Resultado en `docs/plan-workflows.md` («Días de prueba de la Biblioteca»). Nota: el navegador de Playwright tenía la cookie `cm_tiene_acceso=1` de las pruebas anteriores y la Biblioteca saltaba el formulario; se borró solo esa cookie.

### 3 · Template de landings, skill y archivos del equipo (Claude, después de la revisión)
*Por qué:* que todas las landings manden **el mismo JSON** a **la misma dirección** (solo cambia la clave de cada Entrada), para compartirlo con el equipo y empezar a cambiar las landings. Va después del panel, los workflows y la revisión con Cristian. Maqueta visual: `VENTAS/maqueta-template-landing.html` (no está en el repo).
**Decidido:**
- **Dirección:** una por landing, como hoy: `https://dashboard.eternity.llc/api/webhooks/entrada/<clave>`. Si una clave se filtra, se cambia solo esa.
- **La landing solo manda datos.** Etiquetas, pipeline y GHL los decide el dashboard.
- **JSON v1** (los nombres que el dashboard ya entiende hoy, para no romper nada): `template` (`v1`), `source` (landing), `form`, `step`, `event_id`, `submitted_at`; `name`, `first_name`, `last_name`, `email`, `phone`; `quiz` (`{ pregunta: respuesta }`), `quiz_completed`, `quiz_answered`, `quiz_score`; `page_url`, `referrer`, los 6 UTM, `fbclid`, `gclid`, `ttclid`; `ip`, `user_agent`, `language`, `timezone`. Fuera, respecto al webhook de GHL: `tags`, los `quiz_*` repetidos y `headers`.
- **IP:** en el webhook de GHL la IP es la del servidor de GHL (`98.82.169.51`, Ashburn), no la de la persona. Desde el navegador el dashboard la lee él mismo; desde un servidor (como `api/signup.js`) la landing la manda en `ip`. Hoy el dashboard no la guarda: cambio pequeño, con test.
- **Para el equipo:** `Template-landing.md` (qué es, JSON de ejemplo, tabla de campos y pasos), `templates/enviar-al-dashboard.js` (versión navegador y versión servidor, con reintentos y UTM) y la skill para Claude «conectar-web-al-dashboard». Todo en `app/Team/` (raíz del repo del dashboard, en GitHub), con copia en local en `PROYECTOS/GENERAL/VENTAS/Team/`. La skill también va en `Team/` y `~/.claude/skills/conectar-web-al-dashboard` apunta a ella.
- **Skill a la vez que el template**, ya con los workflows hechos (su paso 2 es «crear el workflow»).
- **Las 2 landings de la Biblioteca (registro y agenda) se pasan al JSON v1 dentro de este punto** (repo `biblioteca-maestria`, su propio PR, con prueba real), **pero después del 10 nov** (Cristian, 7 nov): no se cambia lo que reciben en mitad de sus días de prueba de los workflows. Se hace cuando Cristian decida «Pasar a real». **Ojo con agenda:** su Entrada lee las respuestas sueltas (`situacion`, `decisor`, `ingresos_mensuales`, `inversion`, `objetivo_12_meses`, `relacion_ia`, `urgencia`, `qualified`) y el JSON v1 las manda dentro de `quiz`: la landing y su Entrada (`quiz.situacion`…) se cambian juntas, y su workflow también. Registro ya lee `quiz.*`: no se rompe.
- **IP** (Cristian, 7 nov): se guarda en el `seguimiento` del lead, junto a los UTM; sin cambiar la base.
**HECHO el 7 nov (dashboard PR #55):**
- **JSON v1:** el dashboard ya lo entendía; lo prueban `tests/unit/json-v1.test.ts` (con el mismo ejemplo que copia el panel) y `tests/integracion/json-v1-ip.test.ts`.
- **IP** en el `seguimiento` del lead (`src/lib/ip-envio.ts`): la `ip` que manda la landing si es válida; si no, la de la petición solo cuando la Entrada envía desde el navegador; desde un servidor o «no lo sé», ninguna.
- **Para el equipo, en `app/Team/`** (copia en `VENTAS/Team/`): `Template-landing.md`, `templates/enviar-al-dashboard.js` (navegador y servidor; `node --check` sin errores) y la skill `skills/conectar-web-al-dashboard`, enlazada en `~/.claude/skills/conectar-web-al-dashboard` (el enlace apunta a la carpeta del repo: si se cambia a una rama sin `Team/`, la skill desaparece hasta volver a `main`).
- **Pendiente:** pasar las 2 landings de la Biblioteca al JSON v1, después del 10 nov (agenda: landing y Entrada juntas).
**Pasos (de antes):** tests primero (el dashboard entiende el JSON v1 y guarda la IP) → código pequeño en el dashboard (IP y campos nuevos; si no se hizo ya con el panel, ver «Para decidir») → los 3 archivos del equipo y la skill en `Team/` → PR → pasar las 2 landings de la Biblioteca al JSON v1 → probar con envíos reales de prueba → Cristian lo revisa.

### 4 · Fase 6 · Landing de agenda de `codigomaestria.com` (Claude, con la skill y los workflows)
- [ ] `codigomaestria.com/agenda` (`LANDINGS/Landing agenda/Landing-agendar.html`, hoy manda al webhook `2f05f800…`), **con una Entrada** y su workflow del dashboard. Hacer lo mismo que hace hoy su workflow de GHL con el formulario (ramas por `utm_source`, ver «Datos»): leerlo antes con Playwright. La página y el calendario siguen en GHL. **El cambio en la página lo hace Cristian:** Claude le da la dirección de la Entrada (`https://dashboard.eternity.llc/api/webhooks/entrada/<clave>`) y él la pone en GHL en lugar del webhook actual. Antes, Claude lee `Landing-agendar.html` y la pasa al JSON v1 del template. Con prueba, y Cristian la ve.
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


### 8 · Mejoras pequeñas (Claude; cuándo, por decidir)
Una cada vez, con tests primero, **un PR por mejora** y comprobación.
- [ ] **URGENTE · `BIBLIOTECA/build.py` puede dejar la Biblioteca sin recoger leads.** Cristian no lo usa nunca, pero no puede existir la posibilidad. *Qué hace* (leído en el código, sin ejecutarlo): lee la copia vieja `original/*.html` y **reescribe** `index.html`, `recursos.html`, `repos.html` y `programa.html` de la web. Sin `--publicar` deja el formulario de registro con `endpoint: ''` («modo demo», no envía nada; líneas 78–79); también vuelve «AI» y quita `CM_HAS_ACCESS`. Si ese `index.html` se publicara, **los registros dejarían de llegar al dashboard**. *Cómo se arregla:* lo está revisando otra sesión, en la carpeta de la Biblioteca («Revisar build.py de la Biblioteca»): de dónde sale, si puede llegar a la web publicada y qué arreglo propone. Cristian decide allí. Es otro repo (`biblioteca-maestria`): su propio PR.
- [ ] **IMPORTANTE · Menos llamadas a GHL por lead.** Hoy un lead hace hasta 8 llamadas; juntando, 3 a 5 (las columnas de GHL una vez por lectura y una sola búsqueda de oportunidades por contacto). Detalle en `docs/mejora-llamadas-ghl.md`. **Primero, revisar en la especificación de GHL** (`apps/opportunities.json`) **si hay una forma de crear varias oportunidades en una sola llamada** (no está comprobado).
- [x] **Envíos en rojo siempre visibles y «Ver más».** Hecho dentro del panel de endpoints (punto 0, PR #33).
- [x] **Texto «1 lead recibidos».** Arreglado el 7 nov (dashboard PR #36, `083a2f8`): con 1 lead pone «1 lead recibido» (`leadsRecibidos` en `src/lib/entradas-panel.ts`, con test). Comprobado en producción con Playwright en «Prueba GHL».
- [ ] **Campos sugeridos en «Reglas» y «Qué hacer en GHL».** Desde el panel, la lista de campos que se sugieren sale de los 15 últimos envíos y los rojos (antes, de hasta 200). Un campo que la landing mandó hace tiempo y ya no manda no sale en la lista (se puede escribir a mano). Si molesta: guardar en la Entrada los nombres de campo vistos.
- [ ] **Aviso `leads_pkey` en los tests de integración.** El registro de GitHub enseña `[acción] error inesperado: duplicate key value violates unique constraint "leads_pkey"`. No hace fallar ningún test y también sale en `main` antes del panel (run `42373520151`). Buscar qué test lo provoca y si es solo del test o puede pasar en producción.
- [ ] **El formulario de Entradas «se resetea solo».** Visto el 7 nov; no se pudo repetir (149 s sin perder nada, con clics normales). Hipótesis sin comprobar: ese día hubo 12 publicaciones en Vercel (PR #21 a #32) y, cuando la página abierta es de una publicación anterior, Next.js recarga la página entera (`node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`, «Version Skew»). Desde el panel, si hay cambios sin guardar, el navegador avisa antes de recargar. Si vuelve a pasar: mirar si coincidió con una publicación.
- [ ] **Reintentos cada 1 min de verdad.** Se vio el 6 nov que van cada 2 min. Arreglo propuesto: programar el siguiente intento a +50 s (hoy +60 s, `REINTENTAR_EN` en `src/lib/ghl-envios.ts`). Comprobar la causa con un test antes de cambiarlo.
- [ ] **Bloquear el bucle.** *Qué es:* una Entrada puede recibir leads desde un workflow de GHL (como la vieja «GHL · Biblioteca»). Si además tuviera «Mandar a GHL» encendido, el dashboard escribiría en el contacto de GHL, eso podría volver a disparar el workflow, que mandaría otra vez al dashboard, y así sin parar (muchas llamadas y quizá cobros). Hoy no pasa (esa Entrada está desactivada). *Decidido:* (1) interruptor en la Entrada «La alimenta un workflow de GHL»; si está encendido, no deja encender «Mandar a GHL»; (2) **email a info@eternity.llc** en los dos casos: cuando alguien intenta encender «Mandar a GHL» en una Entrada marcada (y se bloquea) y cuando el dashboard ve que pasa de verdad (el mismo lead entra desde GHL justo después de que el dashboard se lo mandara).

---

## Lo que hace Cristian (Claude no puede)
- [ ] Borrar en GHL los contactos de prueba y sus oportunidades: «Prueba GHL Claude» (`info+pruebaghl@eternity.llc`) y «Prueba Biblioteca 1» a «6» (`info+bib1@` … `info+bib6@eternity.llc`). Sus citas (bib1 y bib6 el 12 nov, bib5 el 7 nov) ya están canceladas.
- [ ] Borrar también en el dashboard esos leads de prueba.
- [ ] Borrar en GHL y en el dashboard el lead de prueba del 7 nov «Prueba Workflow 1» (`info+wf1@eternity.llc`, teléfono +1 201 555 0101).
- [ ] **Poner el calendario de GHL de cada closer** en Administración → Integraciones GHL → «Calendario de GHL de cada closer» (Cristian, 7 nov: «los pongo yo»). Hasta entonces, al agendar en la app sale el aviso «Agendado en la app, pero no en el calendario de GHL…» (la cita se queda en la app). Ver «Encargos de Callers».
- [ ] **Comprobar que la integración «App Eternity (dashboard)» de GHL tiene el permiso de escribir en calendarios** (`calendars/events.write`). Sin él, GHL rechaza crear la cita y sale el aviso.
- [ ] Después, una prueba con un lead de prueba (`info+…`, teléfono 555-01xx) agendando en la app con un closer que ya tenga calendario, y cancelar la cita (manda email y SMS).
- [ ] Vigilar las primeras agendas reales (dashboard y GHL).
- [ ] Quitar `cristianortiz33` de colaborador en GitHub (`Dashboard-de-ventas` y `biblioteca-maestria` → Settings → Collaborators) y `cristianortizking33-7483` del equipo de Vercel si es miembro (Settings → Members).
- [ ] Poner otra vez la descripción de la integración «App Eternity (dashboard)» en GHL (quedó vacía; ya no es «solo lectura»).
- [ ] Rellenar o descartar el aviso de GHL que pide el **Tax ID** de la cuenta (sale al abrir fichas de contacto; Claude lo cierra sin guardar nada).

## Encargos de la sesión de Callers (hechos el 7 nov, con el OK de Cristian)
- **«Reagendado» y respetar «vendido» (Callers C11 punto 15 y F21), PR #52:** una sola regla (`estadoTrasCitaGhl`, `src/lib/estado-cita-ghl.ts`) para el webhook de citas y la lectura de cada minuto: vendido no se toca; confirma agenda o descartado → «reagendado» con la etiqueta «Reagendado»; el resto → «agendado».
- **La cita también en GHL al agendar en la app (Callers C11 punto 13), PR #53:** `agendarCita` crea la cita en el calendario de GHL del closer (`crearCitaEnGhl`, `src/lib/cita-en-ghl.ts`; API oficial `POST /calendars/events/appointments`, Version 2021-04-15) y guarda su id para que la lectura no la duplique. Decidido por Cristian: un calendario por closer; los avisos de GHL (email y SMS) se mandan; si no se puede, la cita se queda en la app, se apunta en el historial y se avisa. **No probado con GHL de verdad** (ver «Lo que hace Cristian»).

## Para decidir (Cristian)
- **`build.py`:** en revisión en otra sesión («Revisar build.py de la Biblioteca»).
- **Mejoras pequeñas:** ¿cuándo? (incluye las nuevas del 7 nov: campos sugeridos, aviso `leads_pkey` y el formulario que se resetea) (antes iban justo después de A, B y C; con el orden nuevo no tienen sitio decidido).

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

Desde el panel (7 nov), registro y agenda tienen apuntado en el dashboard: landing `biblioteca`, formulario `registro` / `agenda`, envía desde servidor (`api/signup.js`) / navegador (`web/programa.js`).

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
Lo mismo que se hizo con la Biblioteca, en 7 pasos. Una landing cada vez; hasta que funciona en producción no se pasa a la siguiente. Estos pasos van en la skill «conectar-web-al-dashboard» (punto 3); cuando existan los workflows del dashboard (fase 4), el paso 2 será crear el workflow.

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
