# Plan · Workflows en el dashboard (fase 4 del plan GHL)

> Versión 3 (7 nov 2026). Es el «plan propio» del punto 1 de `docs/plan-GHL.md`. Cada punto se explica solo, sin depender del chat.
> **Estado:** aprobado por Cristian el 7 nov 2026 (también la propuesta para pasar la Biblioteca a real: 3 días, 20 leads de registro, todos los de agenda y 0 diferencias). **4a-1 hecha y publicada el 7 nov** (dashboard PR #38): los 2 workflows de la Biblioteca están **en modo prueba desde el 7 nov a las 16:06 UTC**. **4a-2 (modo real) hecha y publicada el 7 nov** (PR #40). Siguiente: ver el primer lead real en prueba y, al acabar los días de prueba, que Cristian decida «Pasar a real». Después, 4b.

**Objetivo:** que el dashboard haga lo que hoy hacen los workflows de GHL (disparador → pasos), para dejar de depender de ellos. Primero se rehace lo que ya funciona (la Biblioteca) sin arriesgar sus leads; después se ve y se edita en un lienzo como el de GHL; al final, más disparadores.

## Decisiones de Cristian (no se vuelven a preguntar)
| Tema | Decisión |
|---|---|
| Cómo se ve | **Lienzo como GHL** (cajas y flechas, de arriba abajo, con ramas), no una lista (plan GHL, 7 nov) |
| Email | **Sin acción de email.** Los emails de las secuencias siguen fuera (plan GHL, 7 nov) |
| Orden | 4a, 4b y 4c **antes** de la landing de agenda de `codigomaestria.com`; 4d después (plan GHL, 7 nov) |
| Igual que GHL | Con los workflows se tiene que poder hacer lo mismo que «2 . WH - FORM AGENDA GENERAL» (ramas por `utm_source`, etiquetas y a dónde va cada lead). En la app tiene que quedar igual que ese workflow (plan GHL, 7 nov) |
| Dónde va este plan | En este archivo; `plan-GHL.md` lo enlaza (Cristian, 7 nov) |
| Lienzo | **Sin dependencias nuevas**: cajas y flechas con HTML y CSS. No React Flow (Cristian, 7 nov) |
| Cambiar la Biblioteca | **Modo de prueba en paralelo**: unos días el workflow calcula lo que haría con los leads reales **sin llamar a GHL** y se compara con lo de hoy. Solo cuando coincide se cambia (Cristian, 7 nov) |
| Detalle | Plan de toda la fase, con **4a en detalle**; 4b, 4c y 4d resumidas. Cada subfase con su PR, y Cristian la ve antes de la siguiente (Cristian, 7 nov) |

## Cómo funciona hoy (lo que hay que rehacer igual)
1. La landing manda a su Entrada (`/api/webhooks/entrada/<clave>`). El dashboard guarda el envío en `webhook_eventos` y crea o actualiza el lead **al momento**.
2. Si la Entrada tiene «Mandar a GHL» encendido, el envío queda `ghl_estado = esperando` con su hora (`ahora + espera`, 300 s en la Biblioteca).
3. La lectura de cada minuto (`/api/ghl/leer/<proyecto>`, programada en Supabase) llama a `enviarPendientesGhl` (`src/lib/ghl-envios.ts`). Por cada lead (como mucho 10 por lectura) junta **todos** sus envíos a esa Entrada y, con `armarEnvioGhl` (`src/lib/entrada-ghl.ts`), calcula: contacto, campos, etiquetas (`<base>-completo` o `-incompleto` y las fijas), la etiqueta que hay que quitar y las oportunidades. Después lo manda a GHL: contacto → etiquetas → quitar `-incompleto` si ya está completo → una oportunidad por pipeline → guarda en el lead su `ghl_contact_id` y sus etiquetas.
4. Si falla: 5 intentos (uno por lectura); después «error», caja roja con «Reintentar» en Administración → Entradas y email a info@eternity.llc.
5. Si llega otro envío del mismo lead más tarde (el cuestionario), vuelve a esperar y se manda otra vez: pasa de `-incompleto` a `-completo` (nunca al revés).

## Qué es un workflow
- **Workflow** = un **disparador** + **pasos**, dibujado en el lienzo. Los pasos van uno detrás de otro; una **rama** abre varios caminos (como «If/Else» de GHL), cada uno con sus pasos, y uno «si no se cumple ninguno».
- **Disparadores v1:** llega un envío a una Entrada (4a) · se añade una etiqueta · cambia de columna en el dashboard · se agenda o cancela una cita (los 3 últimos, en 4d).
- **Pasos v1:**
  | Paso | Qué hace | Lo que se elige |
  |---|---|---|
  | Esperar | Para el lead un tiempo | segundos (0 a 3600 al principio) |
  | Contacto en GHL | Crea o actualiza el contacto con **todo** lo que ha llegado del lead | campos: lo que llega → campo de GHL |
  | Etiquetas en GHL | Pone etiquetas (y quita `-incompleto` si ya está completo) | etiqueta base, etiquetas fijas, campo de «completo» |
  | Oportunidad en GHL | Una por pipeline; busca si ya existe | pipeline y columna (o «primera») |
  | Quitar etiqueta en GHL | Quita una etiqueta | la etiqueta |
  | Mover en el dashboard | Mueve al lead de pipeline o columna | pipeline y columna |
  | Rama «si el campo…» | Elige camino según un campo | campo, condición (igual, contiene, existe, no existe), valor, por camino |
- Los pasos «Contacto», «Etiquetas» y «Oportunidad» usan **las mismas funciones de hoy** (`src/lib/ghl.ts` y `armarEnvioGhl`): no se escribe otra forma de hablar con GHL.

## Subfase 4a · Motor sin pantalla, rehaciendo la Biblioteca (en detalle)
**Resultado:** las 2 Entradas de la Biblioteca funcionan con workflows y hacen **exactamente lo mismo** que hoy. Nadie nota el cambio.

**1 · Base de datos** (una migración; solo añade, con permiso de Cristian antes de aplicarla):
- `workflows`: `id`, `proyecto_id`, `nombre`, `disparador` (JSON, p. ej. `{ "tipo": "entrada", "entrada_id": "…" }`), `pasos` (JSON, el árbol de pasos), `version` (sube al guardar), `encendido` (sí/no), `modo` (`prueba` o `real`), `creado_en`, `actualizado_en`.
- `workflow_ejecuciones`: una por lead y workflow: `id`, `workflow_id`, `version`, `proyecto_id`, `lead_id`, `estado` (`esperando`, `ok`, `error`, `parada`), `paso` (por dónde va), `siguiente_en` (cuándo toca el siguiente paso), `intentos`, `error`, `registro` (JSON: cada paso hecho, con su hora y su resultado; en modo prueba, también si coincide con lo de hoy) y `creado_en`.
- Las dos, con RLS y sin acceso desde fuera (como `resumen_entradas`): solo el servidor.

**2 · Pasar «Qué hacer en GHL» a workflow:** una función pura, `workflowDeEntrada(entrada)`, convierte la configuración de una Entrada en su workflow: Esperar (su espera) → Contacto (sus campos) → Etiquetas (base, fijas, «completo») → Oportunidad (una por cada pipeline de `ghl_oportunidades`). Así la Biblioteca queda:
- **Registro:** Esperar 300 s → Contacto → Etiquetas `biblioteca-form-…` + `biblioteca recursos` → Oportunidad «1. Biblioteca Recursos → Registrados».
- **Agenda:** Esperar 300 s → Contacto → Etiquetas `biblioteca-agenda-…` + `agenda biblioteca` → Oportunidad «0. Agendas Biblioteca» (primera columna) → Oportunidad «0. Agendas General» (primera columna).

**3 · El motor:**
- Al llegar un envío a una Entrada con workflow encendido, se crea su ejecución (o, si ya hay una del mismo lead esperando, no se crea otra: igual que hoy, que se juntan).
- La lectura de cada minuto, después de `enviarPendientesGhl`, avanza las ejecuciones cuya hora llegó: hace sus pasos hasta el siguiente «Esperar» o hasta el final.
- **Mismos límites que hoy:** las ejecuciones cuentan en el mismo tope de 10 leads por lectura (hasta 80 llamadas, por debajo de las 100 cada 10 s de GHL).
- **Mismos avisos que hoy:** 5 intentos, después «error», caja roja con «Reintentar» y email a info@eternity.llc.

**4 · Modo de prueba en paralelo (lo que protege a la Biblioteca):**
- Con `modo = prueba`, el workflow **no llama a GHL**. Hace sus pasos con un «GHL de mentira» que solo apunta lo que mandaría, y lo compara con lo que calcula hoy `armarEnvioGhl` para ese lead (contacto, campos, etiquetas, la que se quita y oportunidades). En `registro` queda «coincide» o las diferencias.
- Mientras tanto, «Qué hacer en GHL» sigue mandando a GHL como hoy. Los leads reales no notan nada.
- En la tarjeta de la Entrada (Administración → Entradas) sale una línea: «Workflow en prueba: 18 de 18 leads coinciden».
- **Cambio a real** (cuando Cristian lo decida): se pasa el workflow a `modo = real` y se apaga «Mandar a GHL» de la Entrada **en el mismo guardado** (para que nunca manden los dos, ni ninguno).
- **Cómo volver atrás:** apagar el workflow y encender otra vez «Mandar a GHL» de la Entrada (su configuración no se borra).

**5 · Tests primero:**
- Unitarios: `workflowDeEntrada` con las 2 Entradas de la Biblioteca; recorrer pasos y ramas con GHL de mentira; «Esperar» calcula bien la hora; la comparación detecta cada diferencia (una etiqueta de más, una oportunidad de menos, un campo distinto).
- Integración: llega un envío → se crea la ejecución; la lectura la avanza; un segundo envío del mismo lead no crea otra; 5 fallos → «error» + email; «Reintentar» la vuelve a poner en marcha; en modo prueba no se llama a GHL; un proyecto no ve los workflows de otro; desde fuera no se leen las tablas.

**6 · Comprobación en producción:** migración antes de publicar; workflows de la Biblioteca en modo prueba; durante unos días, leer en `workflow_ejecuciones` cuántos coinciden. Cristian decide el cambio a real.

**4a se hace en 2 PR (Cristian, 7 nov):** 4a-1 = motor y modo prueba (así empiezan antes los días de prueba); 4a-2 = modo real, antes del cambio. **Otras decisiones del 7 nov:** el workflow de prueba se crea con un botón «Probar como workflow» en la tarjeta de la Entrada (sale solo si la Entrada manda a GHL); en modo prueba **no** se manda email si una ejecución falla 5 veces (sale en rojo en la tarjeta con «Reintentar»).

### 4a-1 · HECHA el 7 nov (dashboard PR #38, `2d86461`)
- **Código:** `src/lib/workflows.ts` (pasos, ramas, tramos, `workflowDeEntrada`, `envioDeWorkflow` y `compararEnvios`; usa `armarEnvioGhl` de hoy), `src/lib/workflows-motor.ts` (`crearEjecuciones`, `avanzarEjecuciones`, `resumenWorkflows`), enganches en `src/app/api/webhooks/entrada/[token]/route.ts` y `src/app/api/ghl/leer/[proyectoId]/route.ts` (dentro de `try`: un fallo del workflow nunca cambia la respuesta de la Entrada ni para la lectura), acciones `crearWorkflowDePrueba`, `pararWorkflow` y `reintentarEjecuciones`, y la línea de la tarjeta (`src/app/(panel)/admin/entradas-workflow.tsx`).
- **Base de datos:** `20261107160000_workflows.sql` (solo añade): `workflows`, `workflow_ejecuciones` (con sus propios `pasos`, para terminar con su versión) y `resumen_workflows`.
- **En la tarjeta de la Entrada:** «Probar como workflow» · «Workflow en prueba: N de M leads coinciden» · «N esperando» · «N con error» + «Reintentar» · «Ver en qué no coincide» · «Parar la prueba».
- **Pruebas:** unitarios `tests/unit/workflows.test.ts` (17; el workflow de registro y el de agenda calculan **lo mismo que hoy, 0 diferencias**) e integración `tests/integracion/workflows.test.ts` (14). GitHub: unitarios 354/354 e integración 323/323.
- **Producción (7 nov, 16:02-16:06 UTC):** migración aplicada antes de fusionar; desde fuera, las 2 tablas no enseñan nada y `resumen_workflows` da «permission denied» (401). Las direcciones de las 2 Entradas reales responden con el código nuevo (JSON mal escrito → 400, sin guardar nada). Creados con el botón los 2 workflows en prueba (registro: esperar 300 s → contacto 8 campos → etiquetas `Biblioteca-form` + `biblioteca recursos` → «Registrados»; agenda: esperar 300 s → contacto 9 campos → etiquetas `Biblioteca-agenda` + `agenda biblioteca` → «0. Agendas Biblioteca» y «0. Agendas General», primera columna). La configuración de las Entradas no cambió.
- **No probado todavía con datos reales:** que un lead real cree su ejecución y coincida. Lo dirá el primer lead que llegue.
- **Fallos vistos:** (1) el primer clic en «Probar como workflow» no hizo nada (sin petición al servidor); el segundo funcionó. Causa no encontrada. (2) Para aplicar la migración, la herramienta de Supabase se negó: producción tiene 2 migraciones de la sesión de Callers (`20261107150000_manuales`, `20261107150100_cualificaciones`) que solo están en la rama `Callers`, no en `main`. Con permiso de Cristian se usó una copia temporal de esos 2 archivos (sin commit, borrada después) para aplicar solo la de workflows. Mientras no estén en `main`, cada migración nueva necesitará lo mismo.

### 4a-2 · HECHA el 7 nov (dashboard PR #40, `241a388`)
- **Modo real:** cada tramo hace sus pasos de GHL con `mandarEnvioGhl` (`src/lib/ghl-envios.ts`), la parte de `enviarLead` que habla con GHL, separada sin cambiar lo de hoy: **las mismas llamadas que «Qué hacer en GHL»**. 5 fallos → «error» + email a info@eternity.llc (como hoy). «Mover en el dashboard» todavía no se hace en real: el error lo dice.
- **«Pasar a real»** (botón en la línea del workflow, con el criterio en la confirmación): primero el workflow pasa a real y después se apaga «Mandar a GHL» de la Entrada (si eso falla, el workflow vuelve a prueba). Los envíos que esperaban para GHL por el camino de hoy quedan «Lo manda su workflow» y los manda su ejecución. Un momento con los dos encendidos solo repetiría llamadas que no duplican nada en GHL (el contacto se actualiza, las etiquetas no se repiten y la oportunidad se busca antes de crearla).
- **«Volver a lo de hoy»**: la Entrada vuelve a mandar, el workflow se para (queda en prueba) y lo que su ejecución tenía esperando lo manda el camino de hoy en la próxima lectura.
- **Bloqueo:** con el workflow en real no se puede encender «Mandar a GHL» de la Entrada (mandarían los dos).
- **Lectura de cada minuto:** los workflows comparten el tope de 10 leads con el envío de hoy.
- **Tarjeta:** en real, «Lo manda su workflow» y «Volver a lo de hoy».
- **Pruebas:** integración `tests/integracion/workflows-real.test.ts` (10, con un GHL de mentira); GitHub: integración 333/333 y unitarios 355/355; las pruebas de siempre de la Entrada siguen en verde (lo de hoy no cambia).
- **Producción (7 nov, 16:46 UTC):** publicado; las 2 Entradas reales responden con el código nuevo (400 a un JSON mal escrito) y siguen con «Mandar a GHL» encendido; los 2 workflows siguen **en prueba**; en su tarjeta salen «Pasar a real» y «Parar la prueba». «Pasar a real» **no se ha pulsado**: lo decide Cristian.
- **No probado con GHL de verdad:** el modo real solo se ha probado con el GHL de mentira de los tests. La primera vez será cuando Cristian pulse «Pasar a real».
- **Fallos míos en esta subfase:** el test de integración preparó el proyecto sin token de GHL (8 tests en rojo en cadena); al arreglarlo, un comentario tapó el filtro del proyecto (se corrigió antes de que corriera: esa ronda quedó cancelada).

### Días de prueba de la Biblioteca (desde el 7 nov, 16:06 UTC)
- Criterio (Cristian): al menos 3 días (hasta el **10 nov, 16:06 UTC**), 20 leads de registro y todos los de agenda que lleguen, con **0 diferencias**. Si en esos días no llega ninguno de agenda, se completa con leads de prueba en la Entrada «Prueba GHL».
- Dónde se mira: la línea de cada tarjeta en Administración → Entradas, o `workflow_ejecuciones` (`coincide`, y las diferencias en `registro`).

## Subfase 4b · Lienzo de solo lectura (resumida)
- **Administración → Workflows** (solo jefes): lista de workflows (nombre, disparador, encendido, modo, leads en curso).
- **Lienzo** con HTML y CSS, sin dependencias: disparador arriba, cajas de pasos de arriba abajo unidas por flechas; una rama abre sus caminos uno al lado del otro. En el móvil (390 px), las ramas se ven una debajo de otra, sin scroll horizontal de la página.
- **Historial de cada lead:** qué pasos hizo y cuándo, y dónde se paró si falló (de `workflow_ejecuciones.registro`).
- Antes de programar: **boceto** que Cristian aprueba.

## Subfase 4c · Editar en el lienzo (resumida)
- Añadir, quitar y cambiar pasos y ramas desde el lienzo; un solo «Guardar» con aviso de «cambios sin guardar» (como en Entradas).
- **Versiones:** guardar sube la versión; los leads que ya iban por el workflow terminan con la versión con la que empezaron.
- Encender y apagar; cambiar de prueba a real.
- **Rehacer «2 . WH - FORM AGENDA GENERAL»** con una rama por `utm_source` (YouTube, BIBLIOTECA, Instagram, P1, Callers, Email, Webinar, DFY y «otro»), cada una con su pipeline y su etiqueta. **Antes, leerlo entero en GHL** (ver «Para decidir»).
- Antes de programar: boceto que Cristian aprueba.

## Subfase 4d · Más disparadores (después de la landing de agenda)
- Se añade una etiqueta · cambia de columna en el dashboard · se agenda o cancela una cita. Plan corto propio antes de programar.

## Para decidir (Cristian)
- **Cuándo pasar la Biblioteca de prueba a real.** Aprobado por Cristian (7 nov): al menos **3 días** en prueba, con **20 leads de registro** y **todos los de agenda que lleguen**, y **0 diferencias**. La agenda recibe pocos (6 envíos de 3 leads hasta el 7 nov): si en 3 días no llega ninguno, se completa con leads de prueba (`info+…@eternity.llc`, teléfonos 555-01xx) en la Entrada «Prueba GHL».
- **Leer «2 . WH - FORM AGENDA GENERAL» en GHL.** El 7 nov se intentó con Playwright: la lista de workflows cargó (publicado; 387 contactos han entrado y 347 siguen activos; id `6dd710da-d0bb-4a54-9cdf-87a9c0236c65`), pero el editor del workflow se quedó cargando en 2 intentos de más de 25 s. Hace falta antes de 4c, no para 4a: se reintenta entonces o Cristian manda capturas de sus ramas.
- **Los 347 contactos «activos» en ese workflow de GHL:** no se sabe en qué paso están (quizá en una espera). Mirarlo al leerlo, antes de apagarlo algún día.

## Riesgos
- **Que manden los dos o ninguno** al cambiar a real: por eso el cambio y el apagado de «Mandar a GHL» van en un solo guardado, con test.
- **Más llamadas a GHL:** las ejecuciones comparten el tope de 10 leads por lectura. Si un día hay muchos leads, van más despacio, no fallan.
- **Una versión nueva con un fallo:** los leads que ya iban siguen con la suya; se arregla con otra versión o apagando el workflow.

## Lo que falta, en orden
- [x] Cristian aprueba este plan (7 nov).
- [x] 4a-1: tests primero → migración → motor → modo prueba de la Biblioteca → PR #38 → comprobado en producción (7 nov).
- [ ] Ver el primer lead real en prueba (que se cree su ejecución y coincida).
- [x] 4a-2: modo real, «Pasar a real» y «Volver a lo de hoy» (PR #40, 7 nov).
- [ ] Al acabar los días de prueba: Cristian decide el cambio a real de la Biblioteca.
- [ ] 4b: boceto → aprobado → tests → código → PR → comprobar.
- [ ] 4c: leer el workflow de GHL → boceto → aprobado → tests → código → PR → comprobar.
- [ ] Después, el punto 4 del plan GHL (landing de agenda), y luego 4d.
