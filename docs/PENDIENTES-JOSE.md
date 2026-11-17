# Pendientes del dashboard · para Jose (Windows + Claude Code)

> Preparado el 17 nov 2026 por Claude para Cristian. Es lo que queda de la auditoría y de las peticiones de Cristian. Cada tarea lleva la causa ya encontrada (con archivo:línea), lo que decidió Cristian y un prompt listo para pegar en Claude Code.
> Producción: https://dashboard.eternity.llc (Vercel; cada commit a `main` se publica solo). Último estado: `main` en `23a313a` (PR #196). Última migración: `20261123100000`.

## 0. Antes de empezar (una vez, en Windows)

En PowerShell, dentro de la carpeta donde quieras el código:

```powershell
git clone https://github.com/eternitydevzz/Dashboard-de-ventas.git
cd Dashboard-de-ventas
npm ci
npx supabase login
npx supabase link --project-ref <ref del proyecto de Maestria en Supabase>
npx vercel login
```

- `.env.local` no está en git: cópialo de Vercel (`npx vercel env pull .env.local`) solo si vas a arrancar la app en local. Para tests unitarios no hace falta.
- Los tests de integración necesitan Docker (Supabase local). Si no lo tienes, los pasa GitHub en cada PR.

**Comprobaciones (antes de cada PR, las 4 en verde):**

```powershell
npx next typegen; npx tsc --noEmit; npx eslint .; npx vitest run tests/unit
```

## 1. Reglas del proyecto (lo aprendido en 14 PR)

- **Nunca commits en `main`.** Una rama por fase y 1 PR por fase. Fusionar solo con los 4 checks de GitHub en verde sobre el mismo commit. Si «Integración» falla con «invalid response from the upstream server», relanzarlo: `gh run rerun <id> --failed`.
- **Test primero:** escribir el test, verlo fallar, arreglar, verlo pasar.
- **Migraciones:** solo añadir. Número por encima de `20261123100000`. Probar en seco (`npx supabase db push --linked --dry-run`) y **subirla antes de fusionar** (`npx supabase db push --linked`); si no, el código nuevo falla contra la base vieja.
- **Comprobar con datos reales** lo que se valida o se cuenta (`npx supabase db query --linked "select …"`, solo lectura). Así se pillaron 2 fallos que los tests no veían.
- **Producción:** las escrituras de prueba, solo en los leads Kevin (`40596fab-2e26-446d-9fe4-4bbafac851ef`) y Pier (`1d268492-6b39-448b-83d7-1772f1c1e621`), y después dejarlo todo como estaba. Abrir `/manuales` marca el manual como «visto».
- **Next 16 no es el de siempre:** antes de tocar código de Next, leer `node_modules/next/dist/docs/` (lo dice `AGENTS.md`).
- **Errores en producción:** `npx vercel logs --project dashboard-de-ventas --environment production --no-branch --since 30m --json`. La campana del CEO enseña los errores de las últimas 24 h (tabla `errores_app`).
- Al terminar cada fase: comprobar en https://dashboard.eternity.llc, borrar la rama y apuntar el resultado al final de este archivo.

## 2. Decisiones de Cristian que mandan

- Finanzas **filtra** € / $ (no convierte). La comisión pagada guarda la moneda de la persona (España €, el resto la del proyecto).
- «Llamadas» = cualquier botón de resultado, 1 por lead y día. El Funnel, «Por persona», Objetivos y Ranking cuentan solo a callers.
- Un solo nombre por persona. Cambiar el de otra persona en Equipo solo puede hacerlo el CEO.
- Borrar a alguien solo quita su acceso: el perfil queda de baja y su nombre se conserva en el historial (migración `20261123100000`).
- «No responde» está quitado. Ventas, cobros y borrados no se deshacen; el resto, sí (Ctrl+Z).
- Coach de IA: 30 consultas por persona y hora. Las grabaciones no se borran nunca, de momento.

## 3. Fase A · urgente y pequeño (1 PR)

**A1. «Ese enlace ya se usó o ha caducado»** (le pasa a mucha gente).
- Causa: `src/app/auth/confirm/route.ts:13-15` gasta el enlace (`verifyOtp`) en cuanto alguien lo abre con un GET. Si lo abre antes el lector de correo, un antivirus o una vista previa, o se abre dos veces, la persona ve el error. Cada enlace nuevo invalida el anterior. Pruebas: una persona tiene sin usar el último enlace que pidió, y Vercel registra 2 aperturas en el mismo segundo.
- Arreglo: el GET enseña una página con un botón «Entrar» y el enlace se gasta al pulsarlo (POST o acción del servidor). Si ya hay sesión, entrar sin error. El mensaje de error dice «usa el último email que te llegó». El enlace se crea en `src/lib/acceso.ts:15-18`.

**A2. Quien es caller y también closer (Facu) en Agendas y pipelines.**
- `src/app/(panel)/closer/llamadas/page.tsx:51`: `mirar = perfil.rol === "caller"` pone a Facu en «solo mirar» (sin «Reagendar», con 3 pestañas y solo las citas que agendó).
- `src/lib/pipelines.ts:19-30`: el nivel solo mira el rol, así que «Closers» sale «Sin acceso» para un caller.
- Exigen `rol === "closer"` en vez de `esCloser(perfil)`: `closer/acciones.ts:217,290`, `closer/llamadas/acciones-fathom.ts:24` y `closer/llamadas/exportar/route.ts:20`.
- Decisión: como un closer (sus citas con todas las acciones y pestañas; mueve en «Closers») y además ve las que agendó como caller.

**A3. Campana:** las citas ya pasadas sin closer no cuentan como aviso (`src/lib/avisos-ceo.ts:23`). Hoy hay 28 viejas de GHL («0. Calendar Principal», 17 oct–2 nov) y se quedan en la base como están.

**A4. «Latam» → «USA» en todo lo visible; «España» se queda.** El valor interno `latam` no cambia. Textos: `src/lib/mercado.ts:7,48`, `src/components/mercado-equipo.tsx:7` (insignia «LATAM»), `src/app/(panel)/admin/popups.tsx:18` y `src/lib/mcp/lectura.ts:68`. Buscar el resto con `grep -rni latam src`.

**A5. Zona horaria «Otro».** Hoy solo hay 6 zonas (`src/app/(panel)/perfil/foto-zona.ts:16-23` y el CHECK de `supabase/migrations/20261114120000_zona_persona.sql`). Decisión: no añadir países; añadir «Otro», donde la persona escribe de dónde es y elige su hora en un desplegable que enseña la hora de ahora en cada zona. Se guardan los dos. Migración: columna `perfiles.pais`, y cambiar el CHECK de zona (validarla en la app con `Intl`). Pantallas: `src/app/onboarding/zona/page.tsx` y Perfil.

**Prompt para Claude Code (Fase A):**
```
Lee docs/PENDIENTES-JOSE.md, secciones 1, 2 y 3 (Fase A). Haz la Fase A en una rama nueva `fase-a`.
Antes de tocar nada, comprueba cada causa en su archivo:línea y dime si algo no cuadra.
Test primero en cada tarea. La migración, con número > 20261123100000 y prueba en seco.
Al terminar: npx next typegen; npx tsc --noEmit; npx eslint .; npx vitest run tests/unit; abre 1 PR.
No fusiones sin los 4 checks en verde. Sube la migración antes de fusionar.
Para y pregúntame si algo no está claro o un test falla 2 veces.
```

## 4. Fase B · todos los formularios de un lead (1 PR)

- Hoy la ficha enseña una sola lista de respuestas, y una nueva **pisa** a la de la misma pregunta (`unirRespuestas`, `src/lib/leads.ts:53` y `:254`).
- Cada envío original está en `webhook_eventos` (`payload`, `entrada_id`, `recibido_en`, `lead_id`). Hay 238 leads con más de un envío (hasta 9).
- Decisión: en la ficha del lead (`src/app/(panel)/leads/[id]/page.tsx` y `src/components/popup-lead.tsx`), un apartado «Formularios (N)» con cada envío: fecha, Entrada y sus respuestas (sacarlas del `payload` con la misma lógica que `src/lib/entrada.ts:89-117`).
- Límite: los envíos de más de 12 meses se vacían (`limpiar_payload_envios`).

**Prompt:** «Lee docs/PENDIENTES-JOSE.md, secciones 1, 2 y 4. Haz la Fase B en la rama `fase-b`, con test primero, y abre 1 PR. Comprueba con un lead real (solo lectura) que salen todos sus envíos.»

## 5. Fase C · reporte automático diario (1 PR)

Decisión de Cristian:
- Se quita la sección Reportes (pantalla y botón). Los reportes ya rellenados se quedan en la base (tabla `reportes`).
- **2 reportes:** España a las 21:00 de Madrid (día de Madrid) y USA a las 21:00 de Nueva York (día de Nueva York).
- Cada uno lleva: por persona (llamadas, agendas, ventas), totales del día y del mes, lo que va mal (lo del email de las 8:00: `src/lib/avisos-diario.ts`) y la comparación con objetivos (`src/lib/objetivos.ts`). Usar las mismas funciones de números que KPIs (`src/lib/kpis.ts`, `src/lib/metricas.ts`) para que cuadren.
- Por email (Resend, `src/lib/email.ts`; por defecto a info@eternity.llc) y por WhatsApp cuando esté la Fase D.
- **Pantalla nueva en Administración, «Reporte»:** para cada uno de los 2, hora de envío, emails, números de WhatsApp, qué partes lleva e interruptor. Migración para guardar la configuración.
- Envío: como el email de las 8:00 (cron de Supabase que llama cada 15 min y una tabla que evita mandar dos veces; ver `supabase/migrations/20261109120100_avisos_diario.sql`).

**Prompt:** «Lee docs/PENDIENTES-JOSE.md, secciones 1, 2 y 5. Diseña la Fase C y enséñame el plan antes de programar. Luego, rama `fase-c`, test primero y 1 PR. La migración se sube antes de fusionar.»

## 6. Fase D · WhatsApp del equipo con WAHA

- **Decidido por Jose (17 nov):** WAHA (`devlikeapro/waha`, en lugar de Open WA) en **Render** (servicio Starter + Postgres de pago para la sesión), motor GOWS. Detalle y decisiones en `docs/PLAN-EJECUCION.md`, sección 9.
- WAHA **solo para el equipo**: el reporte diario y los avisos al agendar una cita y al cerrar una venta, al closer de la cita, al caller que la agendó y al grupo de WhatsApp de los CEO (Cristian y Jose). **Al lead le sigue escribiendo GHL.** Sin recordatorio antes de la cita. Se configura en Administración → «WhatsApp» y viene **apagado** por defecto.
- Ojo: WAHA no es la API oficial de WhatsApp. Escribir automáticamente a gente que no tiene el número guardado puede hacer que lo bloqueen. Usar un número que no sea el principal y pedir al equipo que lo guarde.
- Corre 24 h fuera de Vercel (Render). `WAHA_URL` y `WAHA_API_KEY` van en las variables de entorno de Vercel, nunca en el código.

## 7. Otros pendientes

- **Cristian:** borrar en GHL el contacto y la cita de «Jose Prueba Claude». Después se borra el lead `75a4319e-dfac-46be-8347-cf356cb78c2c` en la app (sigue en la base).
- **Revisar los registros de Vercel** después del 18 nov a las 00:23 UTC: que no vuelva el atasco de la lectura de GHL (A1-01).
- **Supabase (lo hace Cristian en su panel):** falta la copia de seguridad del 13 nov; el enlace mágico dura más de 1 hora; las contraseñas filtradas no se comprueban.
- **Ver en un teléfono el guion del móvil** (PR #194): los botones miden 36 px, por debajo de los 44 px recomendados.
- **Sin causa encontrada:** KPIs en el móvil medía 3 px más que la pantalla (no se reproduce); un enlace de un manual dio 404 el 13 nov (los registros ya no lo tienen).
- **Bloqueado:** Fase 7 · Velocidad para ~30.000 leads, después de medir la app con todo el equipo dentro.
- **Otro plan:** revisar los roles closer y director, Safari, los controles de Administración que guardan, el móvil al tocar y la carga con todo el equipo a la vez.
- **Límites conocidos:**
  - «contactos cambiados» de GHL lee como mucho 100 cada 30 min;
  - faltan índices de `lead_id` en 4 tablas;
  - etiquetas: si dos personas cambian el mismo lead a la vez, una pisa a la otra;
  - el MCP `finanzas` mezcla € y $;
  - «Reintentar» de una grabación larga puede volver a fallar;
  - deshacer un reparto puede quedar a medias si el caller de antes ya no es caller;
  - el nombre en Equipo se guarda con 3 escrituras sin transacción;
  - los gastos manuales no dejan elegir moneda;
  - reactivar a alguien borrado lo deja activo pero sin acceso.
- **Apuntado en la Fase A (17 nov, revisión):**
  - Enlace mágico: si en ese navegador ya hay una sesión abierta, abrir el enlace de otra persona entra con la sesión que ya había (es lo decidido en A1: «si ya hay sesión, entrar sin error»).
  - «Mi perfil» y `/onboarding/zona` calculan unas 420 zonas en cada carga (unos 26 ms medidos): para la fase de velocidad.
  - Quien elige la zona «Otro» la ve con su nombre técnico (por ejemplo «America/Lima») en el calendario, la cola y el editor de horario, no con el país que escribió.
  - El MCP `crear_miembro` sigue pidiendo «es» o «latam» (es el valor que acepta; decidido dejarlo).
  - **Pregunta para Cristian:** en KPIs, las ventas de Facu (caller y closer) incluyen las que cerró otro closer sobre leads que agendó él; en Agendas solo cuentan las suyas como vendedor. ¿Cuál vale?
  - El PDF «Generar reporte» de KPIs, para Facu, cuenta solo sus citas como closer (no las que agendó con otro closer).
- **Errores en la campana del CEO, de antes de la Fase A** (vistos el 17 nov con Playwright; `errores_app`): `/admin` · «Minified React error #441» (4 veces, 11:09-11:10 UTC) y `/grabaciones` · «TypeError: e is not iterable» (4 veces, 05:03-05:11 UTC). Sin causa buscada todavía; mirarlos después de la Fase B (decisión de Jose).
- **Apuntado en la Fase B (17 nov, revisión):**
  - «Formularios (N)»: la fecha de cada envío sale sin año («17 nov, 10:30», con `fechaHora`, como el resto de la ficha). Hoy todos son de 2026; desde enero de 2027 será ambiguo. Decidido no tocarlo ahora (Jose).
  - Se enseñan como mucho 50 envíos por lead (hoy el máximo real es 9).
  - Faltan tests del componente y de que `resumenLead` no lea envíos sin permiso (el orden en el código está bien).
  - Un envío sin respuestas dice «0 respuestas» y debajo «no trae respuestas» (redundante).
- **Apuntado en la Fase C (17 nov, revisión; decisión de Jose: apuntar):**
  - Reporte diario: si la función se corta a mitad (más de 60 s), la fecha queda reservada en `reporte_envios` y ese día no sale, sin aviso (igual que el email de las 8:00).
  - Con la hora del reporte a las 00:00 (o de madrugada), sale el reporte del día que empieza, casi vacío.
  - Si Resend tarda más de 10 s en responder pero sí manda, el reporte puede llegar 2 veces.
  - «Lo que va mal» es de todo el proyecto, no de cada país (igual en España y USA).
  - El símbolo de moneda del reporte va fijo (€ España, $ USA); hoy los 2 proyectos son USD. Debería leerse de `proyecto.moneda`.
  - `ZONA_REPORTE` está repetido en `src/lib/reporte-diario.ts` y `src/lib/reporte-config.ts`.
  - «Webhook de avisos» (Administración → Proyecto) ya no se usa: `enviarAviso` (`src/lib/avisos.ts`) no tiene llamadas desde que se quitó la pantalla Reportes. El campo dice «Sin uso por ahora». Código muerto también en `src/lib/reportes.ts` (`rolDeReporte`, `tasasCloser`, `PREGUNTAS`) y el icono `reportes` de `barra-lateral.tsx`.
  - Se perdió en integración la prueba de `guardarPreguntasReporte(rol, null)` (volver a las preguntas de siempre), que sigue en el producto.

## 8. Hecho (rellenar al terminar cada fase)

| Fase | PR | Commit | Notas |
|---|---|---|---|
| A | #198 | `cfddb2a` | 17 nov. Migración `20261124100000_zona_otro` subida antes de fusionar. Unitarios 1413/1413, integración 492/492 (local), 4 checks en verde. Producción comprobada con Playwright (sesión del CEO): enlace sin gastar al abrir, campana sin citas pasadas, sin «Latam» visible, CRM de Facu con las que agendó. Sin ver: la zona «Otro» (no la tiene el CEO) y la vista propia de Facu. |
| B | #199 | `8713bbe` | 17 nov. Sin migración. Unitarios 1420/1420, integración 492/492 (local), 4 checks en verde. Producción comprobada con Playwright (sesión del CEO): el lead con más envíos enseña «Formularios (9)» en la ficha y en el popup, con su Entrada en los 9; respuestas en 2 de 9 (en la base, justo los 2 que traen preguntas). La fecha sale sin año (apuntado). |
| C | | | |
| D | | | |
