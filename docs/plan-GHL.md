# Plan · Leads al dashboard primero (sin webhooks de GHL)

> Versión 30 (8 nov 2026). **Solo lo que falta.** Cada punto se explica solo, sin depender del chat.
> Todo lo hecho hasta el 8 nov (panel de Entradas, workflows, Biblioteca y software-demo en JSON v1 y en real, mejoras, pruebas) está en git: `git show 9294e2e:docs/plan-GHL.md`. Workflows en detalle: `docs/plan-workflows.md`.

**Objetivo:** web → dashboard.eternity.llc → el dashboard hace en GHL, por la API, contacto, campos, etiquetas y oportunidades. Sin «Inbound Webhook» de pago (en octubre: $66,60, el 28 % del monedero).

**Hoy funcionan así, en real:** la Biblioteca (registro y agenda) y la landing software-demo mandan el JSON v1 a su Entrada; su **workflow del dashboard** hace GHL y las columnas («Mandar a GHL» de esas Entradas, apagado).

## 1 · Lo que hace Cristian (Claude no puede)
- [ ] **Permiso de calendarios:** que la integración «App Eternity (dashboard)» de GHL tenga `calendars/events.write`. Sin él, al agendar en la app la cita no se crea en GHL (sale un aviso y se queda en la app).
- [ ] **Borrar los leads de prueba** (en el dashboard y en GHL, con sus oportunidades):
  - `info+wf1@eternity.llc` («Prueba Workflow 1»);
  - `info+bib7`, `info+bib8`, `info+bib9@eternity.llc` («Prueba JsonVuno Siete/Ocho/Nueve»);
  - `info+bib1@` … `info+bib6@eternity.llc` («Prueba Biblioteca 1» a «6») y `info+pruebaghl@eternity.llc` («Prueba GHL Claude»);
  - `info+servicios5@eternity.llc` («Prueba Servicios Cinco», contacto GHL `r37qg6twsiPhcXbopBIy`).
- [ ] **software-demo:** decidir qué closer recibe las citas del calendario «Funnel DFY Softwares» (hoy entran en la app sin closer).
- [ ] **Capturas del workflow de GHL «2 . WH - FORM AGENDA GENERAL»** (disparador, ramas por `utm_source` y acciones de cada rama). Con Playwright no se puede leer (6 intentos: el editor sale en blanco). Hacen falta para la landing de agenda (punto 4).
- [ ] Quitar `cristianortiz33` de colaborador en GitHub (`Dashboard-de-ventas` y `biblioteca-maestria`) y `cristianortizking33-7483` del equipo de Vercel si es miembro.
- [ ] Poner otra vez la descripción de la integración «App Eternity (dashboard)» en GHL (quedó vacía).
- [ ] Rellenar o descartar el aviso de GHL que pide el **Tax ID** de la cuenta.

## 2 · Lo que hace Claude, en orden
- [ ] **Bloquear el bucle** cuando Cristian elija la forma (ver punto 5).
- [ ] **Vigilar 24 h la landing software-demo** en real (Administración → Workflows → historial; Entradas sin rojos). Si algo va mal: «Volver a lo de hoy» en su tarjeta.
- [ ] **software-demo:** los que reservan → columna «Agenda» y etiqueta `agenda-demo` (dashboard y GHL). Necesita el disparador «se agenda una cita» (fase 4d): plan corto propio antes.
- [ ] **Con el permiso de calendarios:** prueba agendando en la app un lead de prueba con Cristian Ortiz (tiene «0. Calendar Principal» `X7qpsbS2ChORZkwO4O3f`), comprobar la cita en GHL y cancelarla (manda email y SMS). Después, vigilar las primeras agendas reales.
- [ ] **Mejoras pequeñas que quedan** (una a una, test primero, un PR cada una):
  - **URGENTE · `BIBLIOTECA/build.py`:** si se ejecuta sin `--publicar` y se publica, el registro deja de mandar leads. Lo revisa otra sesión («Revisar build.py de la Biblioteca»); Cristian decide allí.
  - **Campos sugeridos en «Reglas» y «Qué hacer en GHL»:** salen de los 15 últimos envíos; un campo antiguo no sale (se puede escribir a mano). Solo si molesta.
  - **El formulario de Entradas «se resetea solo»:** visto una vez el 7 nov, no se pudo repetir. Si vuelve a pasar, mirar si coincidió con una publicación de Vercel.

## 3 · Para decidir (Cristian)
- **Bloquear el bucle:** forma A o B (punto 5).
- **Pestaña «Etiquetas»** en Administración, al lado de «Workflows»: qué hace (ver, renombrar, unir, borrar etiquetas…), antes del boceto.
- **`MAX_LEADS_POR_LECTURA`:** sigue en 10. Desde el PR #67 un lead hace menos llamadas a GHL (la agenda de la Biblioteca, de 9 a 6), así que podría volver a 15 (15 × 6 = 90, por debajo de 100 cada 10 s).
- **Junior Closer está fuera del proyecto** (Cristian, 8 nov), pero en el dashboard sigue como closer de Maestria y con «0. Calendar Principal». ¿Se le quita el calendario o se le saca del equipo?

## 4 · Fases siguientes
**4.1 · Landing de agenda de `codigomaestria.com`** (con la skill `conectar-web-al-dashboard` y un workflow del dashboard)
- [ ] Antes, **pestaña «UTMs» en KPIs** (al lado de «Leads», solo jefes): tabla de leads con su landing, sus 5 UTM y sus etiquetas; filtros por fechas, landing, cada UTM y etiqueta; totales por `utm_source`, campaña y etiqueta. Los datos ya están (`seguimiento` y `etiquetas` del lead). Plan corto propio antes.
- [ ] `LANDINGS/Landing agenda/Landing-agendar.html` (hoy manda al webhook `2f05f800…`): Entrada + workflow que haga lo mismo que «2 . WH - FORM AGENDA GENERAL» (necesita las capturas de Cristian). La página y el calendario siguen en GHL; **el cambio de dirección en la página lo hace Cristian** (Claude le da la de la Entrada). Con prueba.
- [ ] Cuando ya no lo use ninguna web, apagar «2 . WH - FORM AGENDA GENERAL» y su webhook (con permiso de Cristian).

**4.2 · Optin y cierre de webhooks**
- [ ] Optin `LANDINGS/landing-codigomaestria/landing-ghl.html` (webhook `83c32b0a…`), con la skill.
- Regalos 1 a 7 y `regalos-maestria` (webhook `37e6bc4c…`): **de momento no**.
- [ ] Apagar cada «Inbound Webhook» cuando todas sus webs estén cambiadas (con permiso de Cristian). A final de mes, `inbound_webhook` cerca de $0.
- [ ] Actualizar `docs/GUIA-GHL.md` y `docs/plan.md`.

**4.3 · Unir leads duplicados** (decidir con Cristian antes de programar)
- Caso: 2 emails con el mismo teléfono = 2 leads en el dashboard y 1 contacto en GHL (ej.: leads `e7cc481b…` y `c407dcf9…`, contacto `oIEMl9RNaQEANZQnLWEb`).
- Decidir: cuándo son el mismo (¿teléfono con `telefonoClave`? ¿contacto de GHL?), cuál se queda y qué se junta, automático o botón «Unir». Unir borra un lead: lo confirma Cristian. Antes, contar cuántos duplicados hay.

**4.4 · Al final**
- [ ] **Proyectos sin calendarios:** la lectura de cada 30 s solo se lanza en proyectos con calendarios (`20261017120000_leer_ghl_cada_30s.sql`). Hoy no afecta (Maestria los tiene).
- [ ] **Mover `codigomaestria.com` de GHL a Vercel.**

## 5 · Bloquear el bucle (decidido; falta elegir la forma)
**El problema.** Una Entrada puede recibir leads de una **web** o de un **workflow de GHL**. Si una que recibe de GHL **también manda a GHL** («Mandar a GHL» o su workflow en real), se forma un círculo sin fin: el dashboard escribe en GHL → se dispara el workflow de GHL → manda el lead otra vez al dashboard → … (muchas llamadas, quizá cobros). **Hoy no pasa:** «GHL · Biblioteca», la única que recibía de GHL, está apagada (comprobado el 8 nov).

**Dónde va.** Administración → Entradas → tarjeta → «Cambiar ajustes», en la pregunta que ya existe **«¿Desde dónde manda los datos?»** (navegador / servidor). También al crear una Entrada (pregunta 4).

**Qué hace una Entrada marcada «recibe de GHL».**
1. No deja encender «Mandar a GHL» ni pasar su workflow a real: aviso en pantalla y **email a info@eternity.llc**.
2. Si aun así pasa (el mismo lead vuelve desde GHL menos de 10 min después de mandarlo), **email a info@eternity.llc** (como mucho uno por Entrada y hora).
3. No guarda la IP (sería la de GHL).

**Las 2 formas (las dos cambian la base un poco; no se borra nada):**
- **B (recomendada):** añadir la opción «Desde un workflow de GHL» a esa pregunta. La base hoy solo acepta «navegador» o «servidor» (`20261107140000_panel_entradas.sql:9`): se cambia esa regla para aceptar también «ghl». Sin interruptor nuevo.
- **A:** una columna nueva con su interruptor «La alimenta un workflow de GHL». Hace lo mismo con un interruptor más.

**Pasos:** tests primero → migración → código → PR → GitHub en verde → migración en producción antes de publicar → merge → comprobar con la Entrada apagada «Prueba GHL».

## 6 · Cómo se trabaja
- **Navegador: siempre Playwright**, con la sesión de Cristian (es su Chrome: no cambiar el tamaño). En el dashboard, cada cambio y su «Guardar» en una sola ejecución. GHL va dentro de marcos (`leadconnectorhq.com`) y a veces sale en blanco: anotarlo y seguir.
- **Solo la cuenta de Eternity** (`eternitydevzz` en GitHub, `info-79696548` en Vercel).
- **Tests primero.** En local solo `npx next typegen`, `npx tsc --noEmit`, `npx eslint .` y `npx vitest run tests/unit` (sin Docker). La integración corre en GitHub.
- **Siempre con PR:** rama → PR → GitHub en verde (**todos** los checks) → merge (Vercel publica `main`). Migraciones en producción **antes** de publicar el código que las usa (`supabase db push --dry-run`, después `db push`).
- **Producción:** lecturas con `app/.env.produccion` por la API REST. Nunca imprimir claves (tampoco las de las Entradas).
- **Pruebas reales:** `info+…@eternity.llc` y teléfonos 555-01xx; si hay calendario, comprobar el día y cancelar la cita. Revisar en dashboard.eternity.llc, nunca en previews de Vercel.
- Claude no borra datos, no toca permisos de seguridad ni mete contraseñas. Pregunta antes de: borrar, añadir dependencias, cambiar la base o crear un .md nuevo. Nunca pulsar «Nueva dirección» en las Entradas reales.

## 7 · Decisiones de Cristian que siguen valiendo
| Tema | Decisión |
|---|---|
| Quién hace GHL | El dashboard por la API; cero workflows de GHL para esto |
| **Siempre con workflow** | Toda landing se conecta con su workflow del dashboard (Administración → Workflows), no con «Qué hacer en GHL» de la Entrada |
| JSON v1 | Todas las landings mandan el mismo JSON (`app/Team/Template-landing.md`, código en `app/Team/templates/enviar-al-dashboard.js`). La landing solo manda datos: sin `tags` |
| Etiquetas de la Biblioteca | Registro `form-biblioteca-incompleto` / `form-biblioteca-completo` + `biblioteca`; agenda `agenda-biblioteca` + `biblioteca`. Las antiguas ya no se ponen (los leads viejos las conservan) |
| Columnas de la Biblioteca | «1. Biblioteca Recursos» en dashboard y GHL: Form incompleto · Form completo · Agendados. La agenda, además, en «0. Agendas Biblioteca» y «0. Agendas General» de GHL y en «0. Agendas General» del dashboard |
| `source` | Registro «biblioteca»; agenda «agenda-biblioteca» (así no cuenta como el cuestionario de la Biblioteca) |
| Un envío por lead | Espera de 5 min y un solo envío; si el cuestionario llega tarde, pasa de `-incompleto` a `-completo` (nunca al revés) |
| Oportunidades en GHL | Una por pipeline; se crea solo si el contacto no la tiene. Con «primera columna», la que existe no se mueve |
| Calendarios | Todos los closers con «0. Calendar Principal» (Cristian, 7 nov); cada cita va a nombre de su closer. Los avisos de GHL (email y SMS) se mandan; si falla, la cita se queda en la app con aviso |
| Agendas de `codigomaestria.com` | El calendario sigue en GHL; al dashboard se trae el formulario (UTM, etiquetas, a dónde va cada lead) |

## 8 · Datos que hacen falta
**Entradas y workflows (Maestria):**
| Entrada | Id | Workflow (en real) |
|---|---|---|
| Web · Biblioteca registro | `087b86d1…` (servidor, `api/signup.js`) | `433688ef…` (versión 2) |
| Web · Biblioteca agenda | `bc00a154…` (navegador, `web/programa.js`) | `5bbf9ca9…` (versión 3, lee `quiz.agenda_*` y los campos sueltos) |
| Web · software-demo demo | `7462dbbb…` (servidor, repo `services-eternity`) | `033ef58d…` |
| GHL · Biblioteca | `b173a67a…` | Apagada (recibía de GHL) |
| Prueba GHL | `e5a2bfa9…` | Apagada; para pruebas |

**GHL** (location `ZGWJLBH58RJtl2iGhykp`; API Version `2021-07-28`, calendarios `2021-04-15`; límite 100 llamadas cada 10 s):
- «1. Biblioteca Recursos» `dE7go9T3Mi2zbIT4sGME`: Form incompleto `9cb965ae…`, Form completo `77b3ce38…`, Agendados `f0c80531…`.
- «0. Agendas Biblioteca» `wym2Ue4VUqkhsFoQJ5PK`, «0. Agendas General» `zuQjPVJNbPpRlL0voy6d` (Form, Agendan, Confirman, No confirman, No show, Cerrados, No cualifican, Seguimiento). «3. DFY AI Services» `gH0QEXRNnaR759F7TvxJ` (Form optin, Agenda, Seguimiento). Otros: Orgánico `3mtxrCYHQSnl1M701qeZ`, DFY `Gp15d7oeZFAMn1VHbcs1`, Email `Z956WNVUXKaHC98WZqfc`, P1 `FMcP2ukfTLiRab8OVAyL`, Webinar `1Vp4tJwZyUcRV3MWXVzg`, IG `5GyZUNh3NO2T2W6EU1No`, Callers `VLYV8BXsw7OyUWoJ14va`, Triage YT `oekHKZXhsaYBayDgeTAn`, «2. Webinar 1» `VOdw0hGaASMezASsh4Le`.
- Calendarios que lee Maestria: «0. Calendar Principal» `X7qpsbS2ChORZkwO4O3f`, `GwExej8dLssPn2lprUzf`, `eYQg0BzILAvnzdwLNXGQ`, «Funnel DFY Softwares» `CTsw97wT6aXtUYEQoVeA`.
- Campos de la agenda: situación `ILrgHLZsc1TX8lBYWzfM`, ingresos `IWPSlOz1dKbkwg8SvK9p`, relación IA `jvsMaWoh9FSMzuZ5pLHk`, objetivo 12 meses `oYaZveSEzoLWPZ7hoM1M`, inversión `7I9zm2KGljAr1X4l6xmR`, cualificado `tYv72lGm4gMaK2l7eujl`, `utm_source` `BPs2vrG7eqH7D3d5zJEf`, urgencia `pLkktkvmSexGPkZpyW8J`, decisor `9MtM6cI7dArWZx725GuI`.
- Workflow «2 . WH - FORM AGENDA GENERAL» `6dd710da…` (webhook `2f05f800…`, publicado, carpeta «2. Agendas»): ramas por `utm_source` (YouTube, BIBLIOTECA, Instagram, P1, Callers, Email, Webinar, DFY y «otro»), cada una con su oportunidad y su etiqueta. Hay otro, «2.1 . WH - FORM AGENDA FACU» (creado el 7 nov a las 11:58; no se sabe quién ni para qué).

**Dashboard:** «0. Agendas General» `7bf529f6…` (Form `4a0469a9…`, Agendan `598b75d0…`), «1. Biblioteca Recursos» `eb300c25…` (Form incompleto `869d1779…`, Form completo `b571003a…`, Agendados `338f6c91…`), «2. Webinar 1», «3. DFY AI Services», «4. Leads WhatsApp».

## 9 · Riesgos y cómo volver atrás
- **Si el dashboard no responde**, el lead no llega a GHL hasta que vuelva: reintentos cada minuto (5), después email y aviso en rojo con «Reintentar».
- **Permisos de escritura en uso** (`contacts.write`, `opportunities.write`): si la clave se filtrara, se podrían cambiar contactos y oportunidades.
- **La dirección de la Entrada de la agenda va en el navegador** (como antes el webhook): la frenan el límite de 300 por minuto y el filtro de email/teléfono.
- **Las citas reales mandan email y SMS:** en pruebas, teléfonos 555-01xx y cancelar.
- **Biblioteca:** si un lead agenda y **después** termina el cuestionario, su workflow de registro lo vuelve a «Form completo». Si molesta, rama «si ya agendó, no mover».
- **Volver atrás:**
  - un workflow: «Volver a lo de hoy» en la tarjeta de su Entrada;
  - Biblioteca en JSON v1: revertir el PR #3 de `biblioteca-maestria` (el dashboard entiende los 2 formatos);
  - software-demo: revertir `9584686` en `services-eternity` y quitar `CTsw97wT6aXtUYEQoVeA` de `proyectos.ghl_calendarios`;
  - mejoras del dashboard: revertir su PR (#62, #66, #67, #68 no tocan la base).

**Conectar una landing nueva:** skill `conectar-web-al-dashboard` (`app/Team/skills/`) y `app/Team/Template-landing.md`.
