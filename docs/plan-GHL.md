# Plan · Leads al dashboard primero (sin webhooks de GHL)

> Versión 35 (8 nov 2026, 16:30 CET). **Solo lo que falta.** Cada punto se explica solo, sin depender del chat.
> **Es el único plan de GHL.** La v33 entera: `git show 8cc14fd:docs/plan-GHL.md` (ahí siguen los textos largos de lo ya hecho). Lo hecho hasta el 8 nov por la mañana: `git show 9294e2e:docs/plan-GHL.md`. Planes viejos fusionados aquí: `git show 4a3798a:docs/plan-workflows.md` (lo citan comentarios de `src/lib/workflows*.ts` y `admin/`) y `git show 30d395f:docs/mejora-llamadas-ghl.md`. El plan general es `docs/plan.md`; lo de callers, `docs/plan-callers.md` (otra sesión).

**Objetivo:** web → dashboard.eternity.llc → el dashboard hace en GHL, por la API, contacto, campos, etiquetas y oportunidades. Sin «Inbound Webhook» de pago (en octubre: $66,60, el 28 % del monedero). **Solo la subcuenta de Maestria.**

**«Terminado» = todo sí:** (1) ninguna web de Maestria manda a un «Inbound Webhook» de GHL; (2) cada landing tiene su workflow del dashboard en real, sin errores en su historial; (3) a final de mes `inbound_webhook` ≈ $0; (4) las agendas de `codigomaestria.com` llegan por el dashboard con las etiquetas antiguas y nuevas; (5) un lanzamiento de 300 leads en 5 min no deja leads en rojo (4.5, con números).

**Hoy funcionan así, en real:** la Biblioteca (registro y agenda) y la landing software-demo mandan el JSON v1 a su Entrada; su **workflow del dashboard** hace GHL y las columnas. Comprobado el 8 nov a las 12:10 UTC: 9 ejecuciones desde el 7 nov a las 22:58 UTC, las 9 «ok»; 17 envíos, 0 en rojo.

**Orden de todo (Cristian, 8 nov):** lo urgente → fase 4d → el resto del punto 2 → 4.1 a 4.4 → 4.5 → 4.6 → 4.7 → 4.8. **Prioridad: que todo esté arreglado y funcionando; lo demás es pulir.**

## 0 · Hecho el 8 nov
Por la mañana (detalle en la v33): calendarios de Maestria corregidos (4); cita de prueba de software-demo cancelada; Jose fuera del reparto; integración con todos los permisos (181); Entrada «test» borrada; Junior fuera; capturas del workflow «2 . WH - FORM AGENDA GENERAL».

Por la tarde, con agentes (cada PR con todos los checks de GitHub en verde salvo donde se dice; comprobado en dashboard.eternity.llc donde se puede ver):
- **2.1** `build.py` sin `--publicar` se para antes de escribir nada → `biblioteca-maestria` #4.
- **2.2** «Qué hacer en GHL» de las 2 Entradas de la Biblioteca = lo que hacen sus workflows (Guardar en pantalla; comprobado en la base: solo cambiaron las columnas de GHL, «Mandar a GHL» sigue apagado). Agenda: los 16 campos, etiquetas `agenda-biblioteca` + `biblioteca`, oportunidades en «0. Agendas Biblioteca», «0. Agendas General» y «1. Biblioteca Recursos → Agendados». Registro: base `form-biblioteca`, fija `biblioteca`, oportunidad en «1. Biblioteca Recursos» con «Primera columna» (decisión de Cristian: la Entrada no puede elegir «completo/incompleto» como la rama del workflow).
- **2.3** Prueba de agendar en la app: lead de prueba «Prueba JsonVuno Nueve» (`info+bib9@eternity.llc`), cita con Cristian Ortiz el 9 nov 16:00 EST → GHL la creó (`lRtGgIPBXLgCXnPbj51L`, «0. Calendar Principal»), cancelada en GHL y la app la marcó «cancelada» en 5 s. GHL, por su cuenta, intentó email y SMS (fallaron: datos de prueba), creó una oportunidad en «0. Agendas Orgánico → Agendan» y la etiqueta «agenda llamada». **Es la misma prueba que pide `docs/plan-callers.md`.**
- **2.4 (fase 4d)** Workflows que arrancan al **agendarse** o **cancelarse una cita** (solo citas futuras; leídas de GHL): motor y enganche #83, pantalla #85. Arreglo de un test que quedó viejo: #84.
- **2.5** Canal «Facu» (`/agenda-fc`) y «DFY» (`services.eternity.llc/software-demo`); en esas 2 páginas gana la página al UTM → #75.
- **2.6** Textos de permisos de GHL (qué usa la app y que la integración tiene todos) → #82.
- **2.7** Forma B del bucle (sección 5) → #79 + migración `20261108140000` aplicada.
- **2.8** Error de GHL entero en las lecturas → #76 · pantalla de calendarios del proyecto → #77 · Entradas con ↑ ↓ × → #80 + migración `20261108130000` aplicada.
- **Nuevo (Cristian dijo sí):** un fallo pasajero de Supabase ya no deja envíos en rojo ni workflows parados → #78 · un 429 de GHL no gasta intentos ni pone en rojo, un solo tope de 10 y una línea de medición por lectura → #81.
- **Después (Cristian: «continúa»):** editor de workflows, los pasos dentro de una rama ya no se aplastan (texto letra a letra) → #88 · como mucho 20 citas nuevas por lectura (4.5) → #90 · el «429 de más de 30 min» de un workflow se cuenta desde que debía salir cada tramo → #91 · un reintento en los tests de integración por un fallo puntual del Supabase local de CI → #89.

## 1 · Lo que hace Cristian (Claude no puede)
- [ ] **Borrar los leads de prueba** (dashboard y GHL, con sus oportunidades): en el dashboard `info+bib1`, `info+bib5` a `info+bib9`, `info+wf2` y «PRUEBA CLAUDE» (`team@test.com`); en GHL además `info+wf1`, `info+bib2` a `info+bib4`, `info+pruebaghl`, `info+servicios5`. **Nuevo:** `info+bib9` tiene la cita cancelada de 2.3 y una oportunidad en «0. Agendas Orgánico → Agendan» que creó GHL.
- [ ] **Accesos:** quitar `cristianortiz33` de colaborador en `biblioteca-maestria` y `cristianortizking33-7483` del equipo de Vercel. `contactolicettex-4480` se queda.
- [ ] Poner otra vez la descripción de la integración «App Eternity (dashboard)» en GHL.
- [ ] Rellenar o descartar el aviso de GHL del **Tax ID** y «Payment method is missing!» (sigue saliendo el 8 nov).
- [ ] **UTM repetido de callers** (`?utm_source=callers&utm_source=callers`, 2 citas: 13 oct y 4 nov): no sale de la app (`proyectos.link_agenda` está bien, comprobado); lo repite la página de GHL `/agenda`. Arreglarlo allí o dejarlo (4.1 la sustituye). El canal ya sale bien.

## 2 · Lo que hace Claude, en orden
- [ ] **2.0 · Vigilar software-demo hasta el 8 nov a las 22:58 UTC** (Administración → Workflows → historial; Entradas sin rojos). A las 12:10 UTC: 0 errores. Cómo se comprueba: `workflow_ejecuciones` con `estado='error'` desde el 7 nov 22:58 = 0.
- [ ] **2.4b · Primer uso de la 4d (software-demo).** Workflow «Cita agendada» con rama «si `canal` = `dfy`» → etiqueta `agenda-demo` (dashboard y GHL), oportunidad en «3. DFY AI Services → Agenda» (`gH0QEXRNnaR759F7TvxJ`) y mover a «3. DFY AI Services → Agenda» del dashboard (`3e4c8b4a…` / `3f10d926…`). Pasar a real cuando una reserva real de software-demo muestre en el historial los pasos correctos. **Estado (8 nov, 14:50 UTC):** «Cita agendada» `77b376fd-e375-485d-a8c7-1da065d4c697` v2, **en prueba y encendido**, con esos 3 pasos (GHL «Agenda» `26c13863-8c34-4e3a-8c32-4c1ca731f33d`; comprobado en la base). Falta: ver en su historial la primera reserva real de software-demo y pasarlo a real (lo decide Cristian, ver 3). El duplicado vacío `783c5bf3…` se borró con el OK de Cristian.
- [ ] **2.4c · Disparadores «se pone una etiqueta» y «el lead cambia de columna»** (fuera de la primera tanda, decisión de Cristian). Ojo: «columna» se cambia en ~8 sitios sin función común y puede hacer bucle con «mover en el dashboard».
- [ ] **2.8 · Solo si hace falta:** campos sugeridos de «Reglas» (salen de los 15 últimos envíos), y «el formulario de Entradas se resetea solo» (visto una vez el 7 nov; si vuelve, mirar si coincidió con una publicación de Vercel).
- [ ] **Mejoras pequeñas apuntadas por los revisores** (ninguna rompe nada hoy):
  - una cita creada desde la app (ya trae su id de GHL) no dispara «cita agendada»;
  - si `dispararWorkflows` falla, ese disparo no se reintenta (queda en el log);
  - el aviso del bucle (forma B) recorre `webhook_eventos` y `workflow_ejecuciones` sin índice por `lead_id` (hoy 0 Entradas «ghl»);
  - una Entrada nueva va al final del orden; `moverEntrada` reescribe el orden sin transacción (si falla a medias, el siguiente ↑ ↓ lo arregla).

## 3 · Para decidir (Cristian)
| Decisión | Opciones | Recomendación de Claude |
|---|---|---|
| Pasar a real el workflow de citas de software-demo | ya / tras la primera reserva real en prueba | Tras la primera reserva real: hoy no hay forma de probarlo sin una reserva |
| Subir `MAX_LEADS_POR_LECTURA` (hoy 10 → 300 leads tardan ~30 min) | dejar 10 / subir con números | Mirar 1 día de la línea `[leer]` en `vercel logs` (#81) y decidir con esos ms |
| **Biblioteca: no publicar con `build.py --publicar` hasta arreglar «AI»** (investigado el 8 nov, solo lectura). Causa: el 30 oct «AI» → «IA» se cambió a mano en `index.html` (generado, `f519931`) y no en su fuente `original/landing.html`; si se publica hoy, la landing vuelve a decir «vender AI», «Agentes AI»… (~10 frases). Los otros ~330 cambios son solo el `?v=` (hash de `web/`), inofensivos | corregir «AI» → «IA» en `original/landing.html` / dejar | Corregirlo en `original/landing.html`, regenerar, comprobar con `git diff` que solo cambia el `?v=` y publicar |
| Retención de `webhook_eventos.payload` (el cuerpo entero de cada envío, con email, teléfono, IP, se guarda para siempre) | dejar / borrar los «ok» de más de N meses | Decidirlo antes de un lanzamiento |

## 4 · Fases siguientes
**4.1 · Landings de agenda de `codigomaestria.com`** (skill `conectar-web-al-dashboard`, un workflow del dashboard por página). Son **2 páginas** alojadas en GHL:
- `codigomaestria.com/agenda` → webhook `2f05f800…` → workflow «2 . WH - FORM AGENDA GENERAL» (copia local: `LANDINGS/Landing agenda/Landing-agendar.html`, línea 698).
- `codigomaestria.com/agenda-fc` («agenda facu», calendario «0. Calendar Tatu») → webhook `c4nf4LjO7CWNQCrvItD6` → *seguramente* «2.1 . WH - FORM AGENDA FACU» (*sin comprobar*). Manda lo mismo que `/agenda`. Sin copia local.

Pasos:
- [ ] Antes, **pestaña «UTMs» en KPIs** (solo jefes): tabla de leads con landing, 5 UTM y etiquetas; filtros por fechas, landing, UTM y etiqueta; totales por `utm_source`, campaña y etiqueta. Datos en `leads.seguimiento` y `leads.etiquetas`. Plan corto antes.
- [ ] **Pestaña «Etiquetas y UTMs» en Administración**: ver, crear, editar, renombrar, unir, ordenar y borrar etiquetas; generador de enlaces con UTM; KPIs. Dentro, **«Canales»** para ver, ordenar, editar y dar de alta (hoy en `src/lib/canal.ts`; pasan a la base con los de hoy, incluidos Facu y DFY). Cambios de etiquetas en el dashboard **y en GHL**. **Cuidado:** en GHL los emails y SMS de las agendas los manda otro workflow **que arranca con la etiqueta**. Plan corto y boceto antes.
- [ ] **Workflow del dashboard para cada página**, igual que GHL (capturas en 8) con 2 arreglos: `ig` = Instagram y `biblioteca` = Biblioteca. Contacto con todo lo que llega, una rama por canal, oportunidad en el pipeline de su canal **y en «0. Agendas General»**, etiquetas antiguas (`form llamada <canal>`, `agenda biblioteca`, `rellena form llamada`…; de ellas cuelgan los emails y SMS) **y nuevas** (se proponen en el plan corto). Sin «Wait 9999 days».
- [ ] Probar con leads de prueba y que **Cristian cambie la dirección en cada página** de GHL.
- [ ] Apagar «2 . WH - FORM AGENDA GENERAL», «2.1 . WH - FORM AGENDA FACU» y sus webhooks (con permiso de Cristian). Sus 347 contactos en «Wait 9999 days» se quedan.

**4.2 · Optin y cierre de webhooks**
- [ ] Optin `LANDINGS/landing-codigomaestria/landing-ghl.html` (línea 1099: webhook `83c32b0a…`), con la skill.
- Regalos 1 a 7 y `regalos-maestria` (webhook `37e6bc4c…`): **de momento no**.
- [ ] Apagar cada «Inbound Webhook» cuando sus webs estén cambiadas (con permiso). Webhooks conocidos: `2f05f800`, `c4nf4…`, `83c32b0a`, `37e6bc4c`. Antes de cerrar, revisar **todas** las páginas de `codigomaestria.com` publicadas en GHL.
- [ ] Actualizar `docs/GUIA-GHL.md` y `docs/plan.md`.

**4.3 · Unir leads duplicados** (decidir con Cristian antes de programar). Caso: `e7cc481b…` (contacto `oIEMl9RNaQEANZQnLWEb`) y `c407dcf9…`: 2 emails, mismo teléfono. Decidir cuándo son el mismo, cuál se queda, qué se junta, automático o botón. Unir borra un lead: lo confirma Cristian. Antes, contar cuántos hay.

**4.4 · Mover y limpiar**
- [ ] Proyectos sin calendarios: la lectura de cada 60 s solo se lanza en proyectos con calendarios (`20261017190000_leer_ghl_cada_60s.sql`). Ojo: guardar la lista vacía en la pantalla nueva de calendarios (#77) apaga esa lectura.
- [ ] Mover `codigomaestria.com` de GHL a Vercel.

**Al final (en este orden)**
- [ ] **4.5 · Que aguante un lanzamiento.** Hecho ya (#81): el 429 no gasta intentos y la lectura deja una línea con sus números. Contado leyendo el código (revisión del 8 nov): cada lectura hace envíos (hasta 10 leads, 6-7 llamadas por lead), workflows (comparten el tope de 10), 4 calendarios, contactos de citas nuevas (sin tope), hasta 25 comprobaciones de citas abiertas, el espejo de oportunidades (hasta 20 páginas) y hasta 10 contactos que se releen. Límites: GHL 100 cada 10 s; la función de Vercel, 60 s; cada Entrada, 300 envíos por minuto. Con 300 leads en 5 min el último sale ~30 min tarde. **Hecho también:** tope de 20 citas nuevas por lectura (#90). **Medido en producción (8 nov, 50 lecturas sin trabajo):** una lectura tarda 2,6-6,7 s (mediana 3,7 s) frente a 60 s; el espejo copia 774 oportunidades (~8 páginas = 8 llamadas por minuto frente a 600 por minuto de GHL): **no se espacia** (era un criterio de Claude; los números dicen que no hace falta). **Falta:** leer la línea `[ghl-leer] medicion` en un día con leads (`vercel logs … --query medicion --json`) y decidir el tope de 10 (3).
- [ ] **4.6 · Un caller que también sea closer** (Facu el primero; hoy `perfiles.rol` es uno solo). Plan corto y boceto antes. Hace falta el usuario de GHL de Facundo (plan de callers).
- [ ] **4.7 · Avisos del CEO**: al entrar, ventana con el reporte general; campana; un email al día; avisos de cita sin closer, envío a GHL en rojo, workflow con error, calendario de GHL que no se puede leer y cualquier otro error. Plan corto y boceto antes.
- [ ] **4.8 · Revisar todos los planes, manuales y documentos** (`docs/plan.md`, `docs/plan-callers.md`, `docs/Mejorar-velocidad.md`, `docs/GUIA-GHL.md`, `docs/GUIA-PUBLICAR.md`, los 2 `manual-branding`, `Team/`).

**Nota · tareas de GHL que estaban en `docs/plan.md`** (Pedro de Cuba, reserva real con el link de callers, links del equipo y errata `bibliotec`, despublicar los 4 workflows «1-4. AP - Cita …», usuarios de GHL de Hanna y Facundo): van al plan de callers.

## 5 · Bloquear el bucle (forma B) · hecho (#79)
Una Entrada «Desde un workflow de GHL» (`envia_desde = 'ghl'`): no deja encender «Mandar a GHL» ni pasar su workflow a real (aviso en pantalla y email a info@eternity.llc, máx. 1 por Entrada y hora); si el mismo lead vuelve menos de 10 min después de una escritura nuestra en GHL, email (mismo tope); no guarda la IP. En la base, la regla `entradas_ghl_sin_bucle_check` impide «ghl» + «Mandar a GHL». **Falta comprobarlo en pantalla** con la Entrada apagada «Prueba GHL».

## 6 · Cómo se trabaja
- **Simple:** la solución más corta que deje todo igual en todos sitios (Cristian, 8 nov).
- **Navegador: siempre Playwright**, con la sesión de Cristian (su Chrome: no cambiar el tamaño; pestaña aparte). **Antes de cualquier clic, `await page.bringToFront()`** (`browser_run_code_unsafe`) y comprobar que `document.visibilityState` es `visible` (Cristian, 8 nov): en segundo plano los clics no llegan o se quedan esperando y se ejecutan después (así salió un workflow duplicado). Después de cada cambio, comprobarlo en la base. En el dashboard, cada cambio y su «Guardar» en una sola ejecución. GHL: `app.gohighlevel.com` (las URL directas dan 404; entrar por la raíz y navegar dentro).
- **Solo la cuenta de Eternity** (`eternitydevzz`, `info-79696548`). En la Biblioteca el remoto bueno es `eternity`.
- **Archivos de otras sesiones** (`plan-callers.md`, `maqueta-callers.html`, `manual-branding-rojo.md`, 3 docs borrados, `.claude/`, `.specify/`): no se tocan.
- **Tests primero.** En local solo `npx next typegen`, `npx tsc --noEmit`, `npx eslint .` y `npx vitest run tests/unit` (sin Docker). La integración corre en GitHub.
- **Siempre con PR** y fusión **solo con todos los checks en verde**: `gh pr checks N > archivo && gh pr merge N`; si falla un test que no tiene que ver, mirar el error antes de relanzar (sin `!` ni tuberías: el 8 nov una guarda con `! … | grep -q` dejó pasar #83 con la integración en rojo). Migraciones en producción **antes** del código (`supabase db push --dry-run` antes; en un worktree, copiar `supabase/.temp`).
- **Con agentes (8 nov):** un worktree por tarea en `VENTAS/wt-<tarea>`, ramas desde `main`, `node_modules` enlazado; 3 opus (complejas y revisión) y 3 sonnet (sencillas y revisión), máx. 3 vueltas por tarea; el orquestador revisa cada 5 min y es el único que fusiona, aplica migraciones, escribe en producción y usa el navegador.
- **Producción:** lecturas con `app/.env.produccion` por la API REST. Nunca imprimir claves. Registros: `vercel logs -p dashboard-de-ventas --environment production --no-branch --since 1h --query "…"`.
- **Pruebas reales:** `info+…@eternity.llc` y teléfonos 555-01xx; si hay calendario, cancelar la cita. Revisar en dashboard.eternity.llc.
- Claude no borra datos, no toca permisos de seguridad ni mete contraseñas. Pregunta antes de: borrar, añadir dependencias, cambiar la base o crear un .md nuevo. Nunca pulsar «Nueva dirección» en las Entradas reales.

## 7 · Decisiones de Cristian que siguen valiendo
| Tema | Decisión |
|---|---|
| Quién hace GHL | El dashboard por la API; cero workflows de GHL para esto |
| **Siempre con workflow** | Toda landing con su workflow del dashboard. «Qué hacer en GHL» de la Entrada queda **igual** que su workflow, de reserva (8 nov) |
| JSON v1 | Todas las landings mandan el mismo JSON (`app/Team/Template-landing.md`, `app/Team/templates/enviar-al-dashboard.js`). La landing solo manda datos: sin `tags` |
| Etiquetas de la Biblioteca | Registro `form-biblioteca-incompleto` / `form-biblioteca-completo` + `biblioteca`; agenda `agenda-biblioteca` + `biblioteca` |
| **Reserva del registro de la Biblioteca** | Oportunidad en «Primera columna» de «1. Biblioteca Recursos» (8 nov) |
| **Etiquetas de las agendas de `codigomaestria.com`** | Las antiguas de GHL **y** las nuevas (8 nov). Las antiguas no se quitan: de ellas cuelgan los emails y SMS de GHL |
| Columnas de la Biblioteca | «1. Biblioteca Recursos» (dashboard y GHL): Form incompleto · Form completo · Agendados. La agenda, además, en «0. Agendas Biblioteca» y «0. Agendas General» de GHL y en «0. Agendas General» del dashboard |
| Un envío por lead | Espera de 5 min y un solo envío; `-incompleto` → `-completo` (nunca al revés). «Completo» = algún envío trae `quiz_completed` = true |
| Oportunidades en GHL | Una por pipeline; se crea solo si el contacto no la tiene |
| **Calendarios y citas** | Maestria lee los 4 calendarios de GHL. Todas las citas van a «0. Agendas General → Agendan» y se organizan por UTM. Todos los calendarios reparten a Cristian Ortiz |
| **Closers** | Si una cita queda sin closer, se deja así (y avisará 4.7). Facu será caller y closer (4.6) |
| **Canales** | Tabla de 8. DFY Services = «DFY». `agenda-fc` = «Facu». **En `agenda-fc` y `software-demo` gana la página al UTM** (8 nov). `ig` = Instagram y `biblioteca` = Biblioteca también en la landing de agenda. P1 se queda aunque no se use. Se gestionan en Administración → «Etiquetas y UTMs» → «Canales» (4.1) |
| **Oportunidades de las agendas en GHL** | En el pipeline de su canal y en «0. Agendas General», todas igual |
| **Fase 4d** | Primero solo «cita agendada» y «cita cancelada»; un workflow sin Entrada en prueba apunta lo que haría y termina; primer uso: software-demo (8 nov) |
| **Arreglos fuera del plan del 8 nov** | Sí a: fallos de Supabase, 429 de GHL + medición, tope de 1 email por Entrada y hora |
| Permisos de la integración de GHL | Todos (181) |
| `MAX_LEADS_POR_LECTURA` | 10; antes de un lanzamiento, revisar (4.5) |
| Bucle | Forma B |
| `build.py` | Que no funcione sin `--publicar` |
| **«Wait 9999 days» en GHL** | Costumbre de Cristian: deja a la gente apartada por si se manda a otro workflow. Los emails y SMS van en otro workflow que arranca con la etiqueta |
| Agendas de `codigomaestria.com` | El calendario sigue en GHL; al dashboard se trae el formulario |
| Alcance | Solo la subcuenta de Maestria. Lo de callers, en su plan |

**Criterios de Claude (Cristian puede cambiarlos):** en 4.1, oportunidad de cada agenda también en «0. Agendas General» (Cristian: «lo que creas conveniente»); el workflow de citas de software-demo nace en prueba; un workflow de cita nuevo nace apagado; un 429 que dura más de 30 min cuenta como fallo normal; sin límite por IP en la ruta pública (la Entrada de registro de la Biblioteca manda desde el servidor de Vercel, una sola IP).

## 8 · Datos que hacen falta
**Canales y enlaces de agenda** (Cristian, 8 nov):
| Canal | Enlace | En la app (`canal.ts`) | Rama de GHL hoy |
|---|---|---|---|
| Callers | `codigomaestria.com/agenda?utm_source=callers` | Callers | CALLERS |
| YouTube | `…/agenda?utm_source=yt` | YouTube | YOUTUBE (`youtube`, `yt`) |
| Instagram | `…/agenda?utm_source=ig` | Instagram | **None** (la rama pide `instagram`) |
| Email | `…/agenda?utm_source=email` | Email | EMAIL |
| Biblioteca | `…/agenda?utm_source=biblioteca` | Biblioteca | **None** (la rama pide que contenga `agenda-biblioteca`) |
| Webinar | `…/agenda?utm_source=webinar` | Webinar | WEBINAR |
| DFY | `services.eternity.llc/software-demo` (calendario embebido) | DFY (#75) | no pasa por este workflow |
| Directo | `codigomaestria.com/agenda` | Directo | None |
| Facu | `codigomaestria.com/agenda-fc` | Facu (#75) | su propio webhook (`c4nf4…`) |
La app también entiende `p1`, `dfy`, variantes (`youtube`, `instagram`, `caller`, `mail`, `bibliotec`, `agenda-biblioteca`) y las páginas viejas `/agenda-yt`, `/agenda-ig`, `/agenda-callers`. Otro `utm_source` = «Otro». En la base `citas.canal` guarda la clave en minúsculas (`dfy`, `facu`…).

**Workflow de GHL «2 . WH - FORM AGENDA GENERAL»** `6dd710da-d0bb-4a54-9cdf-87a9c0236c65` (webhook `2f05f800…`, carpeta «2. Agendas»; capturas en `VENTAS/Fotos Workflows GHL/`):
- Inbound Webhook → Create contact → Update contact field (todo lo que llega) → Condition por `utm_source` con 9 ramas → en cada rama: Create or update opportunity → Add Tag → Wait 9999 days.
- Ramas: YOUTUBE (`youtube`, `yt`) · BIBLIOTECA (contiene `agenda-biblioteca`) · INSTAGRAM (`instagram`) · P1 (`p1`) · CALLERS (`callers`) · EMAIL (`email`) · WEBINAR (`webinar`) · DFY (`dfy`) · None.
- Visto: P1 → «0. Agendas P1 → Form» + `form llamada p1`; DFY → «0. Agendas DFY → Agendan»; una rama (*seguramente None*) → «0. Agendas Orgánico → Form»; etiquetas `form llamada youtube`, `agenda biblioteca`, `form llamada callers`, `rellena form llamada`. La acción «Create/Update opportunity» de GHL se va a retirar (las que ya existen siguen).
- En «Wait» el 8 nov: YouTube 86, Biblioteca 10, Instagram 5, Callers 87, None 159 (347).
- «2.1 . WH - FORM AGENDA FACU» (7 nov): *sin capturas*.
- **Otro efecto visto el 8 nov:** al crearse una cita en «0. Calendar Principal», un workflow de GHL crea una oportunidad en «0. Agendas Orgánico → Agendan», pone «agenda llamada» y manda email y SMS de confirmación.

**Entradas y workflows del dashboard (Maestria, 8 nov):**
| Entrada | Id | Workflow (en real) | «Qué hacer en GHL» (reserva) |
|---|---|---|---|
| Web · Biblioteca registro | `087b86d1…` (servidor, `api/signup.js`; `DASHBOARD_ENTRADA_URL` en Production y Preview) | `433688ef…` (v2) | igual que el workflow (2.2) |
| Web · Biblioteca agenda | `bc00a154…` (navegador, `web/programa.js`) | `5bbf9ca9…` (v3) | igual que el workflow (2.2) |
| Web · software-demo demo | `7462dbbb…` (servidor, repo `services-eternity`; `CRM_WEBHOOK_URL` solo en Production) | `033ef58d…` (v1) | — |
| GHL · Biblioteca | `b173a67a…` | Apagada | — |
| Prueba GHL | `e5a2bfa9…` | Apagada; para pruebas (inactiva) | — |

**Workflows del dashboard:** disparador (llega un lead a una Entrada, **se agenda una cita** o **se cancela una cita**) + pasos (esperar, contacto en GHL, etiquetas, quitar etiqueta, oportunidad, mover en el dashboard, rama «si el campo…»). Código: `src/lib/workflows.ts`, `src/lib/workflows-motor.ts` (`dispararWorkflows`), enganche de citas en `src/lib/ghl-sync.ts`; pantalla: Administración → Workflows. Un workflow de Entrada empieza en prueba (calcula sin tocar GHL y compara) y pasa a real con «Pasar a real»; uno de cita, en prueba solo apunta lo que haría («Prueba: no se envía»). El envío de una cita trae los datos del lead más `canal`, `calendario` y `fecha`. Sin probar en producción: guardar una versión, editar una rama, encender/apagar desde el editor, y un workflow de cita con una reserva real.

**GHL** (location `ZGWJLBH58RJtl2iGhykp`; API Version `2021-07-28`, calendarios `2021-04-15`; límite 100 llamadas cada 10 s):
- **Reglas de la API:** `POST /contacts/upsert` **nunca con `tags`** (borra todas): etiquetas con `POST`/`DELETE /contacts/{id}/tags`. No hay oportunidades en bloque. Maestria: `allowDuplicateContact: false`, `allowDuplicateOpportunity: false`. Etiquetas en minúsculas.
- **Llamadas por lead:** agenda de la Biblioteca hasta 6-7; las columnas de GHL, una vez por lectura.
- «1. Biblioteca Recursos» `dE7go9T3Mi2zbIT4sGME`: Form incompleto `9cb965ae-6b38-4a7d-a86b-3d2e9f45bb8d`, Form completo `77b3ce38-39b2-446d-b734-f38bc29c88e2`, Agendados `f0c80531-c23f-4af5-b0a2-03c4095b432a`.
- «0. Agendas Biblioteca» `wym2Ue4VUqkhsFoQJ5PK`, «0. Agendas General» `zuQjPVJNbPpRlL0voy6d`. «3. DFY AI Services» `gH0QEXRNnaR759F7TvxJ` (Form optin `90ee529b…`, Agenda, Seguimiento). Otros: Orgánico `3mtxrCYHQSnl1M701qeZ`, DFY `Gp15d7oeZFAMn1VHbcs1`, Email `Z956WNVUXKaHC98WZqfc`, P1 `FMcP2ukfTLiRab8OVAyL`, Webinar `1Vp4tJwZyUcRV3MWXVzg`, IG `5GyZUNh3NO2T2W6EU1No`, Callers `VLYV8BXsw7OyUWoJ14va`, Triage YT `oekHKZXhsaYBayDgeTAn`, «2. Webinar 1» `VOdw0hGaASMezASsh4Le`.
- **Calendarios que lee Maestria** (se cambian en Administración → Integraciones GHL, #77): «0. Calendar Principal» `X7qpsbS2ChORZkwO4O3f`, «0. Calendar Tatu» `OpfTegXVjj5r1HgNxiO9`, «Funnel DFY Softwares» `CTsw97wT6aXtUYEQoVeA`, «Funnel DFY Clones» `b1C9gLDbl7EQCyJqEl9X`.
- **Closer con usuario de GHL:** solo Cristian Ortiz (`DubIbjsps2tK1fhLcgcP`, calendario `X7qpsbS2ChORZkwO4O3f` en `miembros_proyecto`, comprobado el 8 nov).
- Campos de la agenda: situación `ILrgHLZsc1TX8lBYWzfM`, ingresos `IWPSlOz1dKbkwg8SvK9p`, relación IA `jvsMaWoh9FSMzuZ5pLHk`, objetivo 12 meses `oYaZveSEzoLWPZ7hoM1M`, inversión `7I9zm2KGljAr1X4l6xmR`, cualificado `tYv72lGm4gMaK2l7eujl`, `utm_source` `BPs2vrG7eqH7D3d5zJEf`, urgencia `pLkktkvmSexGPkZpyW8J`, decisor `9MtM6cI7dArWZx725GuI`.

**Dashboard (Maestria):** «0. Agendas General» `7bf529f6…` (Form `4a0469a9…`, Agendan `598b75d0…`), «1. Biblioteca Recursos» `eb300c25…` (Form incompleto `869d1779…`, Form completo `b571003a…`, Agendados `338f6c91…`), «2. Webinar 1» `0cb9a671…`, «3. DFY AI Services» `3e4c8b4a…` (Form optin `e00e9588…`, Agenda `3f10d926…`), «4. Leads WhatsApp» `daebbca6…`.

## 9 · Riesgos y cómo volver atrás
| Riesgo | Qué pasa | Cómo se evita |
|---|---|---|
| El dashboard no responde | El lead no llega a GHL hasta que vuelva | Reintentos cada minuto (5), después email y rojo con «Reintentar». Un fallo pasajero de Supabase ya no pone en rojo (#78) |
| GHL pide esperar (429) | Antes gastaba intentos y ponía en rojo | Desde #81 espera 60 s y corta la lectura; a los 30 min cuenta como fallo normal (email) |
| Un calendario de la lista deja de existir en GHL | La lectura falla y no se cancelan citas borradas en GHL | Pantalla de calendarios (#77); aviso en 4.7 |
| Etiquetas de GHL disparan emails y SMS | Cambiar etiquetas puede dejar de mandar avisos o mandarlos de más | Cuidado en 4.1 y en «Etiquetas y UTMs» |
| Crear una cita en «0. Calendar Principal» | GHL manda email y SMS y crea oportunidad en «0. Agendas Orgánico» | En pruebas, teléfonos 555-01xx y cancelar |
| Un lanzamiento | Pasa el tope de 10 por minuto: retraso de ~30 min con 300 leads | 4.5 con los números de la línea `[leer]` |
| Token de GHL con 181 permisos | Si se filtrara, se podría hacer casi todo en la subcuenta | Cifrado en la base (`proyectos.ghl_token`, solo el servidor). Claude recomienda dejar solo los que usa la app; Cristian decidió todos |
| Dirección de la Entrada de agenda en el navegador | Quien la copie puede llenar el límite de 300 por minuto de esa Entrada | «Nueva dirección» la cambia; el email de «no ha llegado» ya no se manda sin tope (máx. 1 por Entrada y hora para la forma B) |
| Biblioteca: agenda y **después** termina el cuestionario | Su workflow de registro lo vuelve a «Form completo» | Si molesta, rama «si ya agendó, no mover» |
| Workflow de cita en real con pasos mal puestos | Escribiría en GHL en cada reserva | Nace apagado y en prueba; pasar a real solo tras ver una reserva real en el historial |

**Volver atrás:**
- un workflow de Entrada: «Volver a lo de hoy» en su tarjeta (la Biblioteca ya tiene la reserva igual que su workflow);
- un workflow de cita: «Prueba» o apagarlo;
- Biblioteca en JSON v1: revertir el PR #3 de `biblioteca-maestria`; `build.py`: revertir el #4;
- software-demo: revertir `9584686` en `services-eternity` y quitar `CTsw97wT6aXtUYEQoVeA` de los calendarios;
- mejoras del dashboard: revertir su PR. Con migración: #79 (`20261108140000`, quitar las 2 reglas) y #80 (`20261108130000`, la columna `orden` puede quedarse).

**Conectar una landing nueva:** skill `conectar-web-al-dashboard` (`app/Team/skills/`) y `app/Team/Template-landing.md`.
