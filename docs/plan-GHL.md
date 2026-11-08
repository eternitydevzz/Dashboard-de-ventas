# Plan · Leads al dashboard primero (sin webhooks de GHL)

> Versión 33 (8 nov 2026, tarde). **Solo lo que falta.** Cada punto se explica solo, sin depender del chat.
> **Es el único plan de GHL.** Se fusionaron aquí `docs/plan-workflows.md` (`git show 4a3798a:docs/plan-workflows.md`; lo citan comentarios de `src/lib/workflows*.ts`, `admin/workflows.tsx`, `admin/entradas-workflow.tsx`, `admin/acciones.ts`, sus tests y `20261107160000_workflows.sql`) y `docs/mejora-llamadas-ghl.md` (`git show 30d395f:docs/mejora-llamadas-ghl.md`). Lo hecho hasta el 8 nov por la mañana: `git show 9294e2e:docs/plan-GHL.md`. El plan general de la app es `docs/plan.md`; lo de callers, `docs/plan-callers.md` (otra sesión).

**Objetivo:** web → dashboard.eternity.llc → el dashboard hace en GHL, por la API, contacto, campos, etiquetas y oportunidades. Sin «Inbound Webhook» de pago (en octubre: $66,60, el 28 % del monedero). **Solo la subcuenta de Maestria.**

**Hoy funcionan así, en real:** la Biblioteca (registro y agenda) y la landing software-demo mandan el JSON v1 a su Entrada; su **workflow del dashboard** hace GHL y las columnas. Comprobado el 8 nov: los 3 workflows en real (registro v2, agenda v3, software-demo v1), 0 errores desde el 7 nov a las 22:58 UTC.

**Orden de todo (Cristian, 8 nov):** lo urgente (2.0 a 2.3) → fase 4d (2.4) → el resto del punto 2 → fases 4.1 a 4.4 → al final: que aguante un lanzamiento (4.5) → caller y closer (4.6) → avisos del CEO (4.7) → revisar todos los planes, manuales y documentos (4.8). **Prioridad: que todo esté arreglado y funcionando; lo demás es pulir.**

## 0 · Hecho el 8 nov (con el OK de Cristian)
- **Calendarios que lee Maestria, corregidos (10:01 UTC).** Dos ya no existían en GHL («#2 Callers - Maestria» `GwExej8dLssPn2lprUzf` y «#1 Maestria founders» `eYQg0BzILAvnzdwLNXGQ`): GHL respondía **400** en cada lectura y la app **no cancelaba las citas borradas en GHL** (`src/lib/ghl-sync.ts:260`). Ahora lee los 4 que hay (ver 8). Desde las 10:02 UTC, sin errores. Volver atrás: poner `["X7qpsbS2ChORZkwO4O3f","GwExej8dLssPn2lprUzf","eYQg0BzILAvnzdwLNXGQ","CTsw97wT6aXtUYEQoVeA"]` en `proyectos.ghl_calendarios`.
- **Cita de prueba cancelada.** La «cita real del 10 nov sin closer» de software-demo era una prueba («PRUEBA CLAUDE», `team@test.com`, `utm_source=prueba_claude`, contacto GHL `yorW8mGNjIdy6hxnGZs1`). Cancelada en GHL (10:06 UTC) y en la app (10:07). Estaba asignada a Jose Gomez (caller): por eso entró sin closer. **Cristian quitó a Jose del reparto en GHL**: todos los calendarios van a Cristian Ortiz.
- **Todas las citas van a «0. Agendas General → Agendan» y el canal sale del UTM** (revisado: las 72 citas de GHL desde el 25 oct).
- **Integración «App Eternity (dashboard)» con TODOS los permisos de GHL** (181 de 181). *No comprobado* que el token guardado ya los use (lo dirá 2.3).
- **Entrada «test» borrada** (0 envíos; la creó Cristian para probar).
- **Junior fuera del proyecto, comprobado** («Junior Closer» y «Junior Ghidone», inactivos y sin sitio en Maestria). Único closer: Cristian Ortiz.
- **Capturas del workflow de GHL «2 . WH - FORM AGENDA GENERAL»** recibidas (`VENTAS/Fotos Workflows GHL/`, 12 capturas). Resumen en 8.

## 1 · Lo que hace Cristian (Claude no puede)
- [ ] **Borrar los leads de prueba** (dashboard y GHL, con sus oportunidades). Comprobado en el dashboard el 8 nov:
  - siguen en el dashboard: `info+bib1`, `info+bib5`, `info+bib6`, `info+bib7`, `info+bib8`, `info+bib9@eternity.llc`, `info+wf2@eternity.llc` («Prueba Workflow 2») y «PRUEBA CLAUDE» (`team@test.com`);
  - ya no están en el dashboard (quedan en GHL, si siguen): `info+wf1`, `info+bib2` a `info+bib4`, `info+pruebaghl`, `info+servicios5` (contacto GHL `r37qg6twsiPhcXbopBIy`).
- [ ] **Accesos:** quitar `cristianortiz33` de colaborador en `biblioteca-maestria` y `cristianortizking33-7483` del equipo de Vercel. `contactolicettex-4480` se queda (socio de Cristian).
- [ ] Poner otra vez la descripción de la integración «App Eternity (dashboard)» en GHL (quedó vacía).
- [ ] Rellenar o descartar el aviso de GHL que pide el **Tax ID** (también sale «Payment method is missing!»).

## 2 · Lo que hace Claude, en orden
**Urgente**
- [ ] **2.0 · Vigilar 24 h la landing software-demo** en real, hasta el **8 nov a las 22:58 UTC** (Administración → Workflows → historial; Entradas sin rojos). Si algo va mal: «Volver a lo de hoy».
- [ ] **2.1 · `BIBLIOTECA/build.py`: que no funcione sin `--publicar`** (decidido). Hoy, sin `--publicar`, reescribe `index.html` con `endpoint: ''` (líneas 78-79): si se sube, el registro deja de mandar leads. Repo `biblioteca-maestria`, su propio PR, test primero.
- [ ] **2.2 · Biblioteca: todo igual en todos sitios** (Cristian: «simplifica»). «Qué hacer en GHL» de sus 2 Entradas sigue con lo de antes (registro `Biblioteca-form` + `biblioteca recursos` y solo «Registrados»; agenda `Biblioteca-agenda` + `agenda biblioteca`). Se pone lo mismo que hacen sus workflows, para que «Volver a lo de hoy» deje todo igual. Desde Administración → Entradas, un «Guardar» por Entrada, y comprobar en la base.
- [ ] **2.3 · Prueba de agendar en la app** (ya hay permiso): agendar un lead de prueba con Cristian Ortiz («0. Calendar Principal»), comprobar la cita en GHL y `citas.ghl_cita_id`, y cancelarla (manda email y SMS). Con el OK de Cristian justo antes. **Es la misma prueba que pide `docs/plan-callers.md`**: una sola vez, apuntada en los dos.

**Después de lo urgente**
- [ ] **2.4 · Fase 4d: más formas de arrancar un workflow** (Cristian: justo después de lo urgente, antes de la landing de agenda). Hoy un workflow del dashboard solo arranca cuando **llega un lead a una Entrada**. La 4d añade: **se agenda o se cancela una cita**, **se pone una etiqueta** y **el lead cambia de columna**. Primer uso: los que reservan en software-demo pasan a «3. DFY AI Services → Agenda» y llevan la etiqueta `agenda-demo` (dashboard y GHL); hoy sus citas ya entran en «0. Agendas General → Agendan». Plan corto propio antes.
- [ ] **2.5 · Canales con la lista de Cristian** (tabla en 8). En `src/lib/canal.ts`, con test:
  - `codigomaestria.com/agenda-fc` → canal **«Facu»** (decidido). Hoy saldría «Directo»;
  - `utm_source=ig` → Instagram y `utm_source=biblioteca` → Biblioteca (ya es así en la app; en la landing de agenda, 4.1, también);
  - `services.eternity.llc/software-demo` → **«DFY»** (decidido). Hoy sale «Directo»;
  - `p1` (Píldora 1) se queda, aunque hoy no se usa;
  - el enlace de callers que repite el UTM (`?utm_source=callers&utm_source=caller`, visto en una cita real): buscarlo y arreglarlo.
- [ ] **2.6 · Poner al día los docs de GitHub con los permisos nuevos de GHL.** Dicen que el token tiene 3 o 4 permisos de lectura: `docs/GUIA-GHL.md` (líneas 50 y 166-176), `docs/plan.md` (línea 205), `docs/GUIA-PUBLICAR.md` (línea 196), y los textos de `src/app/(panel)/admin/ghl.tsx:24`, `src/lib/ghl.ts` (líneas 3-5, 42 y 62) y `src/lib/ghl-llamadas.ts`. Escribir qué usa la app (lectura: calendarios, citas, contactos, conversaciones, oportunidades, campos; escritura: `contacts.write`, `opportunities.write`, `calendars/events.write`) y que la integración tiene todos por decisión de Cristian.
- [ ] **2.7 · Bloquear el bucle con la forma B** (decidido). Ver 5.
- [ ] **2.8 · Mejoras pequeñas** (una a una, test primero, un PR cada una):
  - **Entradas: borrar y ordenar a la vista.** Una «×» en la tarjeta para borrar (con confirmación; hoy «Borrar» está escondido en «Cambiar ajustes», `entradas.tsx:441`) y **cambiar el orden** de las tarjetas (guardar el orden: cambio pequeño en la base).
  - **Ver el error de GHL entero:** `llamar` (`src/lib/ghl.ts:44`) solo guarda «GHL respondió 400»; que guarde lo que explica GHL.
  - **Pantalla para elegir los calendarios** de cada proyecto (hoy no existe; el 8 nov se cambió en la base).
  - **Campos sugeridos en «Reglas» y «Qué hacer en GHL»:** salen de los 15 últimos envíos. Solo si molesta.
  - **El formulario de Entradas «se resetea solo»:** visto una vez el 7 nov. Si vuelve a pasar, mirar si coincidió con una publicación de Vercel.

## 3 · Para decidir (Cristian)
- Nada pendiente a 8 nov. Lo que se decida en cada «plan corto» se apunta aquí.

## 4 · Fases siguientes
**4.1 · Landings de agenda de `codigomaestria.com`** (con la skill `conectar-web-al-dashboard` y un workflow del dashboard por página). Son **2 páginas**, alojadas en GHL:
- `codigomaestria.com/agenda` → webhook `2f05f800…` → workflow «2 . WH - FORM AGENDA GENERAL» (copia local: `LANDINGS/Landing agenda/Landing-agendar.html`, línea 698).
- `codigomaestria.com/agenda-fc` («agenda facu» en GHL, calendario «0. Calendar Tatu») → webhook `c4nf4LjO7CWNQCrvItD6` → *seguramente* «2.1 . WH - FORM AGENDA FACU» (*sin comprobar*). Manda lo mismo que `/agenda` (`source` «agenda-codigo-maestria», pasos `agenda_datos` y cuestionario, UTM de la URL). No hay copia local.

Pasos:
- [ ] Antes, **pestaña «UTMs» en KPIs** (al lado de «Leads», solo jefes): tabla de leads con su landing, sus 5 UTM y sus etiquetas; filtros por fechas, landing, cada UTM y etiqueta; totales por `utm_source`, campaña y etiqueta, para medir. Datos ya en `leads.seguimiento` y `leads.etiquetas`. Plan corto propio antes.
- [ ] **Pestaña «Etiquetas y UTMs» en Administración** (al lado de «Workflows»): ver, crear, editar, renombrar, unir, ordenar y borrar etiquetas; **generador de enlaces con UTM**; medir sus KPIs (enlazado con la pestaña de KPIs). Dentro, un apartado **«Canales»** (Cristian, 8 nov) con todos los canales para **ver, ordenar, editar y dar de alta** (nombre, valores de `utm_source` que cuentan para él, páginas, orden). Hoy los canales están escritos en el código (`src/lib/canal.ts`): pasan a la base, con los mismos de hoy de partida. Los cambios de etiquetas, **en el dashboard y en GHL** (Cristian, 8 nov). **Cuidado:** en GHL los emails y SMS de las agendas los manda otro workflow **que arranca con la etiqueta** (Cristian, 8 nov): renombrar o borrar una etiqueta en GHL puede dejar de mandar esos avisos o mandarlos otra vez. Plan corto y boceto antes.
- [ ] **Workflow del dashboard para cada página**, igual que GHL (capturas en 8) con 2 arreglos: `ig` cuenta como Instagram y `biblioteca` como Biblioteca (decidido). Contacto con **todo** lo que llega (email, teléfono, UTM, respuestas del formulario…), una rama por canal y en cada rama su oportunidad en el pipeline de su canal **y en «0. Agendas General»** (una sola regla para todas las agendas, igual que la Biblioteca: «en General tienen que estar todas»; elegido por Claude por simple, Cristian 8 nov: «lo que creas conveniente»), y **las etiquetas antiguas de GHL** (`form llamada <canal>`, `agenda biblioteca`, `rellena form llamada`…; **hacen falta: de ellas cuelgan los emails y SMS**) **y las nuevas** (se proponen en el plan corto; luego se editan). El «Wait 9999 days» de GHL no hace falta en el dashboard (en GHL solo sirve para tener a la gente apartada por si se manda a otro workflow; en el dashboard eso se hace por etiqueta).
- [ ] Probar con leads de prueba y que **Cristian cambie la dirección en cada página** de GHL (Claude le da la de su Entrada).
- [ ] Apagar «2 . WH - FORM AGENDA GENERAL», «2.1 . WH - FORM AGENDA FACU» y sus webhooks (con permiso de Cristian), cuando ya no los use ninguna web. Sus 347 contactos en «Wait 9999 days» (YouTube 86, Biblioteca 10, Instagram 5, Callers 87, None 159) se quedan como están.

**4.2 · Optin y cierre de webhooks**
- [ ] Optin `LANDINGS/landing-codigomaestria/landing-ghl.html` (línea 1099: webhook `83c32b0a…`), con la skill.
- Regalos 1 a 7 y `regalos-maestria` (webhook `37e6bc4c…`): **de momento no**.
- [ ] Apagar cada «Inbound Webhook» cuando sus webs estén cambiadas (con permiso de Cristian). A final de mes, `inbound_webhook` cerca de $0. **Webhooks de Maestria conocidos: 4** (`2f05f800`, `c4nf4…`, `83c32b0a`, `37e6bc4c`). Ojo: `c4nf4…` no salía buscando en los archivos del Mac porque la página solo está en GHL. **Antes de dar esto por cerrado, revisar todas las páginas de `codigomaestria.com` publicadas en GHL**, no solo las copias locales.
- [ ] Actualizar `docs/GUIA-GHL.md` y `docs/plan.md`.

**4.3 · Unir leads duplicados** (decidir con Cristian antes de programar)
- Caso: `e7cc481b…` (contacto `oIEMl9RNaQEANZQnLWEb`) y `c407dcf9…` (sin contacto): 2 emails, mismo teléfono, 1 contacto en GHL.
- Decidir: cuándo son el mismo, cuál se queda, qué se junta, automático o botón «Unir». Unir borra un lead: lo confirma Cristian. Antes, contar cuántos hay.

**4.4 · Mover y limpiar**
- [ ] **Proyectos sin calendarios:** la lectura de GHL (cada 60 s, `20261017190000_leer_ghl_cada_60s.sql`) solo se lanza en proyectos con calendarios. Hoy no afecta.
- [ ] **Mover `codigomaestria.com` de GHL a Vercel.**

**Al final (en este orden)**
- [ ] **4.5 · Que aguante un lanzamiento** («en un lanzamiento seguramente se rompa; prevenir antes»). `MAX_LEADS_POR_LECTURA` sigue en **10**. Revisar al detalle: cuántas llamadas a GHL hace de verdad cada lectura de un minuto (envíos, workflows, 4 calendarios, contactos de las citas y contactos nuevos, todo a la vez en `route.ts:60`) contra el límite de GHL (100 cada 10 s); qué pasa con cientos de leads en pocos minutos (retraso, errores 429, reintentos); el límite de 300 envíos por minuto de cada Entrada, Supabase y Vercel. Con los números, decidir los arreglos.
- [ ] **4.6 · Un caller que también sea closer.** Hoy cada persona tiene **un solo rol** (`perfiles.rol`). **Facu** (Facu Cepeda, «Facu bro», hoy caller; su calendario es «0. Calendar Tatu») será el primero con los dos. Cambia la base y las pantallas: plan corto y boceto antes. Hasta entonces, sus citas van a Cristian Ortiz o entran sin closer. *Nota:* hace falta el usuario de GHL de Facundo; está pendiente en el plan de callers (`docs/plan.md`, línea 118, pasa a `docs/plan-callers.md`).
- [ ] **4.7 · Avisos del CEO** (primero Cristian; los directores, más adelante). Hoy los avisos solo salen por email (`src/lib/avisos.ts`; Maestria no tiene webhook de avisos). Lo nuevo:
  - **al entrar en la app**, una ventana con el **reporte general**: leads que han entrado, agendas y la lista de avisos;
  - una **campana** con todos los avisos;
  - **un email al día** con el reporte general;
  - avisos: **cita sin closer** («Agenda sin closer»), envío a GHL en rojo, workflow con error, calendario de GHL que no se puede leer (como el del 8 nov), y cualquier otro error de la app.
  Plan corto y boceto antes.
- [ ] **4.8 · Revisar todos los planes, manuales y documentos** (`docs/plan.md`, `docs/plan-callers.md`, `docs/Mejorar-velocidad.md`, `docs/GUIA-GHL.md`, `docs/GUIA-PUBLICAR.md`, los 2 `manual-branding`, `Team/`): qué sigue valiendo, qué se junta y qué se borra.

**Nota · tareas de GHL que estaban en `docs/plan.md`** (líneas 70, 90, 91, 92 y 118: Pedro de Cuba, reserva real con el link de callers, links del equipo y errata `bibliotec`, despublicar los 4 workflows viejos «1-4. AP - Cita …», usuarios de GHL de Hanna y Facundo): van al plan de callers (Cristian, 8 nov). Tenerlas en cuenta aquí.

## 5 · Bloquear el bucle (decidido: forma B)
**El problema.** Si una Entrada que recibe de un **workflow de GHL** también **manda a GHL**, se forma un círculo sin fin: el dashboard escribe en GHL → se dispara el workflow de GHL → manda el lead otra vez al dashboard → … **Hoy no pasa** (comprobado el 8 nov).

**Cómo.** En Administración → Entradas → «Cambiar ajustes», la pregunta **«¿Desde dónde manda los datos?»** gana la opción **«Desde un workflow de GHL»** (también al crear una Entrada). En la base, la regla de `envia_desde` (`20261107140000_panel_entradas.sql:9`) acepta también «ghl». Sin columnas nuevas.

**Qué hace una Entrada «Desde un workflow de GHL».**
1. No deja encender «Mandar a GHL» ni pasar su workflow a real: aviso en pantalla y **email a info@eternity.llc**.
2. Si aun así pasa (el mismo lead vuelve desde GHL menos de 10 min después), **email a info@eternity.llc** (como mucho uno por Entrada y hora).
3. No guarda la IP (sería la de GHL).

**Pasos:** tests primero → migración → código → PR → GitHub en verde → migración en producción antes de publicar → merge → comprobar con la Entrada apagada «Prueba GHL».

## 6 · Cómo se trabaja
- **Simple:** la solución más corta que deje todo igual en todos sitios (Cristian, 8 nov).
- **Navegador: siempre Playwright**, con la sesión de Cristian (su Chrome: no cambiar el tamaño; pestaña aparte y cerrarla al acabar). En el dashboard, cada cambio y su «Guardar» en una sola ejecución. GHL va dentro de marcos (`leadconnectorhq.com`); el editor de workflows sale en blanco: pedir capturas.
- **Solo la cuenta de Eternity** (`eternitydevzz` en GitHub, `info-79696548` en Vercel). En la carpeta local de la Biblioteca, el remoto `origin` apunta a `cristianortiz33/biblioteca-maestria` (no existe): usar `eternity`.
- **Archivos de otras sesiones:** la carpeta `app/` tiene cambios de la sesión de callers sin guardar (borrados `Arreglar-dashboard.md`, `plan-historial-10oct.md`, `plan-historial-11oct.md`; nuevos `plan-callers.md`, `maqueta-callers.html`, `manual-branding-rojo.md`). **No se tocan:** rama nueva desde `main` y en cada commit solo los archivos propios, uno a uno.
- **Tests primero.** En local solo `npx next typegen`, `npx tsc --noEmit`, `npx eslint .` y `npx vitest run tests/unit` (sin Docker). La integración corre en GitHub.
- **Siempre con PR:** rama → PR → GitHub en verde (**todos** los checks) → merge (Vercel publica `main`). Migraciones en producción **antes** de publicar el código que las usa.
- **Producción:** lecturas con `app/.env.produccion` por la API REST. Nunca imprimir claves. Registros: `vercel logs -p dashboard-de-ventas --environment production --no-branch --since 1h --query "…"` (solo 1 h). En el Mac no existe `timeout`.
- **Pruebas reales:** `info+…@eternity.llc` y teléfonos 555-01xx; si hay calendario, comprobar el día y cancelar la cita. Revisar en dashboard.eternity.llc, nunca en previews de Vercel.
- Claude no borra datos, no toca permisos de seguridad ni mete contraseñas. Pregunta antes de: borrar, añadir dependencias, cambiar la base o crear un .md nuevo. Nunca pulsar «Nueva dirección» en las Entradas reales.

## 7 · Decisiones de Cristian que siguen valiendo
| Tema | Decisión |
|---|---|
| Quién hace GHL | El dashboard por la API; cero workflows de GHL para esto |
| **Siempre con workflow** | Toda landing con su workflow del dashboard. «Qué hacer en GHL» de la Entrada queda **igual** que su workflow, de reserva (8 nov) |
| JSON v1 | Todas las landings mandan el mismo JSON (`app/Team/Template-landing.md`, `app/Team/templates/enviar-al-dashboard.js`). La landing solo manda datos: sin `tags` |
| Etiquetas de la Biblioteca | Registro `form-biblioteca-incompleto` / `form-biblioteca-completo` + `biblioteca`; agenda `agenda-biblioteca` + `biblioteca` |
| **Etiquetas de las agendas de `codigomaestria.com`** | Las antiguas de GHL **y** las nuevas (8 nov). Las antiguas no se quitan: de ellas cuelgan los emails y SMS de GHL |
| Columnas de la Biblioteca | «1. Biblioteca Recursos» (dashboard y GHL): Form incompleto · Form completo · Agendados. La agenda, además, en «0. Agendas Biblioteca» y «0. Agendas General» de GHL y en «0. Agendas General» del dashboard |
| Un envío por lead | Espera de 5 min y un solo envío; `-incompleto` → `-completo` (nunca al revés). «Completo» = algún envío trae `quiz_completed` = true |
| Oportunidades en GHL | Una por pipeline; se crea solo si el contacto no la tiene |
| **Calendarios y citas** | Maestria lee los 4 calendarios de GHL. Todas las citas van a «0. Agendas General → Agendan» y se organizan por UTM. Todos los calendarios reparten a Cristian Ortiz |
| **Closers** | Si una cita queda sin closer, se deja así (y avisará 4.7). Facu será caller y closer (4.6) |
| **Canales** | Tabla de 8. DFY Services = «DFY». `agenda-fc` = «Facu». `ig` = Instagram y `biblioteca` = Biblioteca también en la landing de agenda. P1 se queda aunque no se use. Se gestionan en Administración → «Etiquetas y UTMs» → «Canales» (4.1) |
| **Oportunidades de las agendas en GHL** | En el pipeline de su canal y en «0. Agendas General», todas igual |
| Permisos de la integración de GHL | Todos (181) |
| `MAX_LEADS_POR_LECTURA` | 10; antes de un lanzamiento, revisar (4.5) |
| Bucle | Forma B |
| `build.py` | Que no funcione sin `--publicar` |
| **«Wait 9999 days» en GHL** | Costumbre de Cristian: deja a la gente apartada por si se manda a otro workflow. Los emails y SMS van en otro workflow que arranca con la etiqueta |
| Agendas de `codigomaestria.com` | El calendario sigue en GHL; al dashboard se trae el formulario |
| Alcance | Solo la subcuenta de Maestria. Lo de callers, en su plan |

## 8 · Datos que hacen falta
**Canales y enlaces de agenda** (Cristian, 8 nov):
| Canal | Enlace | En la app hoy (`canal.ts`) | Rama de GHL hoy |
|---|---|---|---|
| Callers | `codigomaestria.com/agenda?utm_source=callers` | Callers | CALLERS |
| YouTube | `…/agenda?utm_source=yt` | YouTube | YOUTUBE (`youtube`, `yt`) |
| Instagram | `…/agenda?utm_source=ig` | Instagram | **None** (la rama pide `instagram`) |
| Email | `…/agenda?utm_source=email` | Email | EMAIL |
| Biblioteca | `…/agenda?utm_source=biblioteca` | Biblioteca | **None** (la rama pide que contenga `agenda-biblioteca`) |
| Webinar | `…/agenda?utm_source=webinar` | Webinar | WEBINAR |
| DFY | `services.eternity.llc/software-demo` (calendario embebido) | **Directo** → 2.5 | no pasa por este workflow |
| Directo | `codigomaestria.com/agenda` | Directo | None |
| Facu | `codigomaestria.com/agenda-fc` | **Directo** → 2.5 | su propio webhook (`c4nf4…`) |
La app también entiende `p1`, `dfy`, variantes (`youtube`, `instagram`, `caller`, `mail`, `bibliotec`, `agenda-biblioteca`) y las páginas viejas `/agenda-yt`, `/agenda-ig`, `/agenda-callers`. Otro `utm_source` = «Otro».

**Workflow de GHL «2 . WH - FORM AGENDA GENERAL»** `6dd710da-d0bb-4a54-9cdf-87a9c0236c65` (webhook `2f05f800…`, carpeta «2. Agendas»; capturas en `VENTAS/Fotos Workflows GHL/`, 8 nov):
- Inbound Webhook (sin filtros) → Create contact → Update contact field (todo lo que llega: email, teléfono, etiquetas, UTM, respuestas) → Condition por `utm_source` con 9 ramas → en cada rama: Create or update opportunity → Add Tag → Wait 9999 days.
- Ramas: YOUTUBE (`youtube`, `yt`) · BIBLIOTECA (contiene `agenda-biblioteca`) · INSTAGRAM (`instagram`) · P1 (`p1`) · CALLERS (`callers`) · EMAIL (`email`) · WEBINAR (`webinar`) · DFY (`dfy`) · None (ninguna).
- Visto en las capturas: P1 → «0. Agendas P1 → Form» + `form llamada p1`; DFY → «0. Agendas DFY → **Agendan**»; una rama (*seguramente None*) → «0. Agendas Orgánico → Form»; etiquetas `form llamada youtube`, `agenda biblioteca`, `form llamada callers`, `rellena form llamada`. La fuente de la oportunidad es el `utm_source` del contacto. GHL avisa de que la acción «Create/Update opportunity» se va a retirar (los workflows que ya la tienen siguen funcionando).
- Contactos en «Wait» el 8 nov: YouTube 86, Biblioteca 10, Instagram 5, Callers 87, None 159 (347).
- «2.1 . WH - FORM AGENDA FACU» (creado el 7 nov): *sin capturas*; seguramente el de `agenda-fc`.

**Entradas y workflows del dashboard (Maestria, 8 nov):**
| Entrada | Id | Workflow (en real) |
|---|---|---|
| Web · Biblioteca registro | `087b86d1…` (servidor, `api/signup.js`; `DASHBOARD_ENTRADA_URL` en Vercel Production y Preview) | `433688ef…` (v2) |
| Web · Biblioteca agenda | `bc00a154…` (navegador, `web/programa.js`) | `5bbf9ca9…` (v3) |
| Web · software-demo demo | `7462dbbb…` (servidor, repo `services-eternity`; `CRM_WEBHOOK_URL` **solo en Production**) | `033ef58d…` (v1) |
| GHL · Biblioteca | `b173a67a…` | Apagada (recibía de GHL) |
| Prueba GHL | `e5a2bfa9…` | Apagada; para pruebas |

**Workflows del dashboard** (lo que queda de `plan-workflows.md`): disparador + pasos (esperar, contacto en GHL, etiquetas, quitar etiqueta, oportunidad, mover en el dashboard, rama «si el campo…»). Código: `src/lib/workflows.ts`, `src/lib/workflows-motor.ts`; pantalla: Administración → Workflows. Tablas `workflows` y `workflow_ejecuciones`. Lienzo con HTML y CSS, sin dependencias; sin acción de email; un workflow nuevo empieza **en prueba** (calcula sin tocar GHL y compara) y pasa a real con «Pasar a real»; al guardar sube la versión y los leads en curso terminan con la suya. Sin probar en producción: guardar una versión, editar una rama, encender/apagar desde el editor.

**GHL** (location `ZGWJLBH58RJtl2iGhykp`; API Version `2021-07-28`, calendarios `2021-04-15`; límite 100 llamadas cada 10 s):
- **Reglas de la API:** `POST /contacts/upsert` **nunca con `tags`** (borra todas): etiquetas con `POST`/`DELETE /contacts/{id}/tags`. No hay oportunidades en bloque. Maestria: `allowDuplicateContact: false`, `allowDuplicateOpportunity: false`. Etiquetas en minúsculas.
- **Llamadas por lead** (PR #67): agenda de la Biblioteca hasta 6 (antes 9); las columnas de GHL, una vez por lectura.
- «1. Biblioteca Recursos» `dE7go9T3Mi2zbIT4sGME`: Form incompleto `9cb965ae-6b38-4a7d-a86b-3d2e9f45bb8d`, Form completo `77b3ce38-39b2-446d-b734-f38bc29c88e2`, Agendados `f0c80531-c23f-4af5-b0a2-03c4095b432a`.
- «0. Agendas Biblioteca» `wym2Ue4VUqkhsFoQJ5PK`, «0. Agendas General» `zuQjPVJNbPpRlL0voy6d`. «3. DFY AI Services» `gH0QEXRNnaR759F7TvxJ` (Form optin `90ee529b…`, Agenda, Seguimiento). Otros: Orgánico `3mtxrCYHQSnl1M701qeZ`, DFY `Gp15d7oeZFAMn1VHbcs1`, Email `Z956WNVUXKaHC98WZqfc`, P1 `FMcP2ukfTLiRab8OVAyL`, Webinar `1Vp4tJwZyUcRV3MWXVzg`, IG `5GyZUNh3NO2T2W6EU1No`, Callers `VLYV8BXsw7OyUWoJ14va`, Triage YT `oekHKZXhsaYBayDgeTAn`, «2. Webinar 1» `VOdw0hGaASMezASsh4Le`.
- **Calendarios que lee Maestria:** «0. Calendar Principal» `X7qpsbS2ChORZkwO4O3f`, «0. Calendar Tatu» `OpfTegXVjj5r1HgNxiO9` (de Facu; puesto en `agenda-fc`), «Funnel DFY Softwares» `CTsw97wT6aXtUYEQoVeA`, «Funnel DFY Clones» `b1C9gLDbl7EQCyJqEl9X`.
- **Closer en la app con usuario de GHL:** solo Cristian Ortiz (`DubIbjsps2tK1fhLcgcP`). El closer de una cita = el usuario de GHL asignado, si es closer en la app; si no, sin closer.
- Campos de la agenda: situación `ILrgHLZsc1TX8lBYWzfM`, ingresos `IWPSlOz1dKbkwg8SvK9p`, relación IA `jvsMaWoh9FSMzuZ5pLHk`, objetivo 12 meses `oYaZveSEzoLWPZ7hoM1M`, inversión `7I9zm2KGljAr1X4l6xmR`, cualificado `tYv72lGm4gMaK2l7eujl`, `utm_source` `BPs2vrG7eqH7D3d5zJEf`, urgencia `pLkktkvmSexGPkZpyW8J`, decisor `9MtM6cI7dArWZx725GuI`.

**Dashboard (Maestria):** «0. Agendas General» `7bf529f6…` (Form `4a0469a9…`, Agendan `598b75d0…`), «1. Biblioteca Recursos» `eb300c25…` (Form incompleto `869d1779…`, Form completo `b571003a…`, Agendados `338f6c91…`), «2. Webinar 1» `0cb9a671…`, «3. DFY AI Services» `3e4c8b4a…` (Form optin `e00e9588…`, Agenda `3f10d926…`), «4. Leads WhatsApp» `daebbca6…`.

## 9 · Riesgos y cómo volver atrás
- **Si el dashboard no responde**, el lead no llega a GHL hasta que vuelva: reintentos cada minuto (5), después email y aviso en rojo con «Reintentar».
- **Si un calendario de la lista deja de existir en GHL**, la lectura da error y la app deja de cancelar citas borradas en GHL (pasó hasta el 8 nov). Hoy no hay aviso: 4.7.
- **Las etiquetas de GHL disparan los emails y SMS:** cambiar, quitar o poner etiquetas en GHL (landing de agenda, pestaña «Etiquetas y UTMs») puede dejar de mandar avisos o mandarlos de más.
- **Un lanzamiento puede pasar el límite de GHL:** 4.5.
- **La integración de GHL tiene todos los permisos (181):** si el token se filtrara, se podría hacer casi todo en la subcuenta. Está cifrado en la base (`proyectos.ghl_token`, solo lo lee el servidor). Claude recomienda dejar solo los que usa la app; Cristian decidió todos.
- **La dirección de la Entrada de la agenda va en el navegador:** la frenan el límite de 300 por minuto y el filtro de email/teléfono.
- **Las citas reales mandan email y SMS:** en pruebas, teléfonos 555-01xx y cancelar.
- **Biblioteca:** si un lead agenda y **después** termina el cuestionario, su workflow de registro lo vuelve a «Form completo». Si molesta, rama «si ya agendó, no mover».
- **Volver atrás:**
  - un workflow: «Volver a lo de hoy» en la tarjeta de su Entrada (en la Biblioteca, después de 2.2);
  - Biblioteca en JSON v1: revertir el PR #3 de `biblioteca-maestria`;
  - software-demo: revertir `9584686` en `services-eternity` y quitar `CTsw97wT6aXtUYEQoVeA` de `proyectos.ghl_calendarios`;
  - calendarios de Maestria: ver 0;
  - mejoras del dashboard: revertir su PR (#62, #64, #66, #67, #68 no tocan la base).

**Conectar una landing nueva:** skill `conectar-web-al-dashboard` (`app/Team/skills/`) y `app/Team/Template-landing.md`.
