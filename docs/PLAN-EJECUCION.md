# Plan de ejecución · Fases A, B y C (y D bloqueada)

> **Para quien ejecute:** orquestador (Claude en la carpeta principal) + agentes Opus 5.5 por rondas. Pasos con casillas `- [ ]`.
> Escrito el 17 nov 2026. Sin commit hasta que Jose diga «empieza».

**Objetivo:** cerrar las Fases A, B y C de `docs/PENDIENTES-JOSE.md` con 1 PR por fase, sin romper producción.

**Arquitectura:** una rama de integración por fase (`fase-a`, `fase-b`, `fase-c`) desde `origin/main`. Cada agente trabaja en su rama y su copia (`git worktree`) con una lista cerrada de archivos. El orquestador hace las migraciones, `src/lib/tipos.ts`, la integración, la revisión y el PR.

**Tecnología:** Next 16.4.3, React 19.3.0, Supabase (CLI por `npx supabase`, v3.2.0), Vitest 4, Resend, Vercel.

**Fuente:** `docs/PENDIENTES-JOSE.md` (manda en todo). `AGENTS.md`: leer `node_modules/next/dist/docs/` antes de tocar código de Next.

---

## 0. Estado real (comprobado el 17 nov 2026)

| Qué | Resultado | Cómo lo comprobé |
|---|---|---|
| `origin/main` | `d541a40` (PR #197, solo docs) | `git fetch; git log -1 --oneline origin/main` |
| Copia local | en `main`, igual a `origin/main`, sin cambios | `git status --short` vacío |
| Copias (worktrees) | 1 sola, la carpeta principal | `git worktree list` |
| Finales de línea | `core.autocrlf=false` (en `.git/config`), 0 archivos con CRLF | `git config --show-origin core.autocrlf`; `git ls-files --eol \| grep -c w/crlf` = 0 |
| `node_modules` | instalado (17 nov, `npm ci`, código 0); `node_modules/next/dist/docs/` existe | `npm ci`; `ls node_modules/next/dist/docs` |
| Supabase enlazado | sí: `crbwqaxpeexeonffuiyo` (`eternity-dashboard-ventas`). La sesión ya existía | `supabase projects list`; `supabase link --project-ref crbwqaxpeexeonffuiyo` |
| Es la base buena | 87 migraciones aplicadas = 87 archivos del repo; última `20261123100000`; 1 proyecto con `ghl_location_id = 'ZGWJLBH58RJtl2iGhykp'` | `db query --linked --read-only` |
| CLI Supabase | **Lecturas:** `npx supabase@3.2.0 db query --linked --read-only` (sin `--read-only` no ejecuta: seguro contra escrituras). **Migraciones:** `npx supabase@2.90.0` (la del CI, `tests.yml:47`); la 3.2.0 no lee `supabase/config.toml` (`inbucket` ya no vale) | `HostedMutationConsentRequiredError`; `DbConfigLoadError` con 3.2.0; dry-run con 2.90.0 correcto |
| `.env.local` | no hay (no hace falta para tests) | `test -f .env.local` |
| GitHub | sesión de `eternitydevzz` | `gh auth status` |
| Vercel CLI | **sin sesión y no se usa**: los emails de Vercel no llegan a info@ (Jose, 17 nov). Sustituto: el estado «Vercel» de cada commit en GitHub | `npx vercel@65.17.0 whoami` → «Logged out»; `gh api repos/eternitydevzz/Dashboard-de-ventas/commits/d541a40/status` → `Vercel: success` |
| Docker | 29.6.1 instalado | `docker --version` |
| CI (4 últimas en main) | 5 min 03 s a 5 min 35 s | `gh run list --branch main --limit 4` |
| Última migración | `20261123100000_borrar_conserva_nombre.sql` | `ls supabase/migrations` |
| Skills | prompt-master, superpowers 7.0.2, kit-creador-maestria 1.2.0 | carpetas en `~/.claude` |

## 1. Lo que no cuadra o falta en PENDIENTES-JOSE.md

1. **main está en `d541a40`, no en `23a313a`.** La diferencia es el PR #197 (solo el propio documento). Sin efecto en el código.
2. **Preparación (arreglado el 17 nov):** faltaban `node_modules` y el enlace de Supabase; ya están. Vercel CLI no se usa (sección 0); los pasos que lo pedían van por GitHub y por `errores_app`.
3. **A2 se queda corto.** Además de las 6 líneas citadas, comprueban `rol === "caller"` dentro de Agendas y del CRM:
   - `src/lib/agendas-datos.ts:44` (`closersVisibles`: un caller ve «las que agendó»).
   - `src/lib/tablero-closers.ts:20-28` (`cargarCitasVentas` solo filtra «closer = X **y** agendada por Y»; la decisión pide «**o**»).
   - `src/app/(panel)/closer/llamadas/tablero-closers.tsx:58` (`soloMirar` es de todo el tablero, no de cada tarjeta).
   - `src/app/(panel)/crm/page.tsx:86-87` y `:172` (pipeline «Closers» del CRM: misma regla).
   - `src/app/(panel)/closer/analisis/page.tsx:25`, `closer/analisis/[id]/page.tsx:17`, `closer/reporte/route.ts:16`.
   - Fuera de Agendas: `src/app/(panel)/kpis/page.tsx:287` y `src/lib/mcp/lectura.ts:254`.
4. **A4 se queda corto.** Los sitios citados cuadran, pero hay 11 textos visibles más: `equipo/acciones.ts:74`, `equipo/alta.tsx:79`, `equipo/cliente.tsx:107`, `guiones/editor.tsx:84,86,87`, `perfil/acciones.ts:80`, `components/selector-mercado.tsx:6`, `lib/mcp/equipo.ts:49` y `api/mcp/route.ts:75,128` (descripciones del MCP).
5. **A5:** el CHECK de zona se creó sin nombre en la migración. En la base se llama `perfiles_zona_horaria_check` (comprobado con `pg_constraint`). La migración nueva lo busca por su definición igualmente.
6. **B:** el popup no lee la ficha: llama a `/api/leads/[id]/resumen`, que usa `resumenLead` de `src/app/(panel)/leads/resumen.ts`. Ese archivo también cambia. `src/lib/leads.ts:53` es el comentario; la función empieza en `:55`. La lógica de respuestas es la función `interpretar()` de `src/lib/entrada.ts:74` (las líneas 89-117 cuadran).
7. **C: quitar «Reportes» toca más que pantalla y botón:** `permisos-constantes.ts:16,35,38,39`, `barra-lateral.tsx:59`, `onboarding/page.tsx:14-16`, la pestaña «Reportes» (preguntas) de Administración (`admin/page.tsx:48,357`, `admin/preguntas-reporte.tsx`, `guardarPreguntasReporte` en `admin/acciones.ts:177`) y 18 archivos de tests.
8. **C: la puerta.** `src/proxy.ts:15` solo deja pasar sin sesión `/api/ghl/leer/`, `/api/avisos/diario/` y `/api/mcp`. La ruta nueva del cron necesita su sitio ahí.
9. **Cifras comprobadas en la base (17 nov, solo lectura):** A3: 28 citas abiertas sin closer, todas pasadas (17 oct–2 nov), 0 futuras: cuadra. B: hoy son **261** leads con más de un envío (el documento dice 238; han entrado más) y el máximo sigue en 9. A2: Facu Cepeda es la única persona con «también closer» (caller, activa); no hay filas de permisos en el pipeline «Closers» (manda el nivel por defecto). **Sin verificar:** las 2 aperturas en el mismo segundo de A1 (necesita Vercel).
10. **Convención del repo:** `docs/plan.md` dice que el plan general vive fuera del repo (`VENTAS/plan.md`, que no está en esta copia). Este archivo solo cubre A, B y C.

## 2. Reglas globales (copiadas de PENDIENTES-JOSE.md, secciones 1 y 2)

- Nunca commits en `main`. 1 rama y 1 PR por fase. Fusionar solo con los 4 checks en verde sobre el mismo commit. «invalid response from the upstream server» → `gh run rerun <id> --failed`.
- Test primero: verlo fallar, arreglar, verlo pasar.
- Migraciones: solo añadir; número > `20261123100000`, sin repetir. Prueba en seco y subir antes de fusionar.
- Comprobar con datos reales (solo lectura): `npx supabase db query --linked --read-only "select …"` (la CLI 3.2.0 no ejecuta la consulta sin `--read-only`).
- Producción: escrituras de prueba solo en Kevin (`40596fab-2e26-446d-9fe4-4bbafac851ef`) y Pier (`1d268492-6b39-448b-83d7-1772f1c1e621`); después, dejarlo como estaba y comprobarlo en la base. No abrir `/manuales` sin bloquear `/api/manuales/**`. Borrar datos reales, solo con OK de Jose y enseñando antes las filas.
- Decisiones de Cristian (cerradas): Finanzas filtra € / $. «Llamadas» = cualquier botón de resultado, 1 por lead y día; Funnel, «Por persona», Objetivos y Ranking cuentan solo a callers. Un nombre por persona. Borrar = baja, nombre conservado. «No responde» quitado. Ventas, cobros y borrados no se deshacen. Coach IA 30/hora. Las grabaciones no se borran.
- Comprobación de cada PR: `npx next typegen; npx tsc --noEmit; npx eslint .; npx vitest run tests/unit`.
- Errores en producción: el documento pide `npx vercel logs …`; sin sesión de Vercel, se usa la tabla de la campana del CEO: `npx supabase db query --linked --read-only "select sitio, texto, veces, ultimo_en from errores_app where ultimo_en > now() - interval '30 minutes' order by ultimo_en desc"`. Límite: lo que solo va a los registros de Vercel (`console.error`) no se ve.

## 3. Puntos a vigilar (lo que ningún test cubre solo)

1. **Lector de correo que abre el enlace (A1):** un GET a `/auth/confirm` nunca gasta el enlace. Test en A-1: la página no llama a `verifyOtp`.
2. **Zona que no está en las 6 (A5):** `America/Argentina/Buenos_Aires` y las otras 5 siguen valiendo aunque `Intl` las llame por otro nombre. Test en A-4: las 6 pasan `zonaValida`; `"Marte/Base"` no pasa.
3. **Envío vaciado por tener más de 12 meses (B):** sale como «Contenido borrado (más de 12 meses)», no como formulario vacío ni error. Test en B-1.
4. **Medianoche entre zonas (C):** el reporte USA de las 21:00 de Nueva York es del día de Nueva York, aunque en UTC ya sea el siguiente. Test en C-1 y C-4 con `2026-11-18T02:00:00Z` → fecha `2026-11-17`.
5. **Dos llamadas del cron a la vez (C):** un solo email. Test en C-4 (la reserva en `reporte_envios` inserta una sola vez).

## 4. Copias, ramas y node_modules

Todo en PowerShell, desde `C:\Users\Usuario\Desktop\VENTAS`.

- Paso previo: `npm ci` (hecho el 17 nov; repetirlo solo si cambia `package-lock.json`).
- Rama de integración (en la carpeta principal): `git fetch; git switch -c fase-a origin/main`.
- Copia de cada agente:
  ```powershell
  git worktree add ..\VENTAS-copias\a1 -b fase-a-a1 fase-a
  cmd /c mklink /J ..\VENTAS-copias\a1\node_modules C:\Users\Usuario\Desktop\VENTAS\node_modules
  ```
  `/node_modules` está en `.gitignore` (línea 4): el enlace no entra en git. Nadie ejecuta `npm install` (el enlace es compartido). Cada copia tiene su `.next` propio.
- Prueba en seco de una migración: en la carpeta principal (allí estará `supabase/.temp`, ignorado por `supabase/.gitignore:3`). Si se hace en una copia, antes: `Copy-Item supabase\.temp\project-ref, supabase\.temp\pooler-url ..\VENTAS-copias\<x>\supabase\.temp\`.
- Al terminar la fase: `git worktree remove ..\VENTAS-copias\<x>`, `git branch -D fase-x-<x>`, y borrar la rama remota de la fase tras fusionar.

## 5. Reparto y prueba de que no se pisan

- Regla: ningún archivo en dos agentes de la misma fase. Migraciones, `package.json`, configuración, `src/lib/tipos.ts` y `docs/*.md` solo el orquestador (ORQ).
- Máximo 2 agentes por ronda (y por tanto, como mucho 2 pasando tests a la vez).
- Prueba (17 nov). Lista de lotes en `C:\Users\Usuario\AppData\Local\Temp\claude\f562a40541d66c6f\b107a57f-b414-4048-9196-a14cb3f26c10\scratchpad\lotes.txt` (fase, lote, archivo; `+` = nuevo):
  - Repetidos dentro de una fase: `awk '{f=$3; sub(/^\+/,"",f); print $1" "f}' lotes.txt | sort | uniq -d` → **ninguno**.
  - Archivos existentes que no están en git: `git ls-files --error-unmatch` sobre cada uno → **ninguno**.
  - Archivos nuevos que ya existen: `test -e` → **ninguno**.
  - Tests: cada lote lleva los tests que más pueden romperse con su cambio. **No** están todos los que leen sus archivos (por ejemplo, `closer/acciones.ts` lo leen 10 tests unitarios y A-2 lleva 4). Si falla uno que no está en su lista, el agente para y pregunta; la suite entera la pasa el orquestador al integrar.
- Entre fases sí se repiten archivos (por ejemplo `tests/unit/z5a-puerta.test.ts` en A-1 y C-4): no chocan porque cada fase sale de `origin/main` después de fusionar la anterior.
- Si un agente necesita un archivo fuera de su lista: para y pregunta. El orquestador decide.

---

## 6. Fase A · rama `fase-a` · 1 PR

### Tarea A-0 (ORQ): migración y tipos

**Archivos:**
- Crear: `supabase/migrations/20261124100000_zona_otro.sql`
- Modificar: `src/lib/tipos.ts:21` (añadir `pais?: string | null;` al tipo de perfil, junto a `zona_horaria`)

- [x] Antes, en la base (solo lectura): `pg_constraint` de `public.perfiles`. Resultado (17 nov): 1 CHECK con `zona_horaria`, `perfiles_zona_horaria_check`, con las 6 zonas.
- [ ] Escribir la migración:
  - `alter table public.perfiles add column if not exists pais text check (pais is null or char_length(pais) between 1 and 80);`
  - Bloque `do $$` que borra todo CHECK de `public.perfiles` cuya definición (`pg_get_constraintdef`) contenga `zona_horaria`.
  - `alter table public.perfiles add constraint perfiles_zona_horaria_formato check (zona_horaria is null or zona_horaria ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$');` (la zona exacta la valida la app con `Intl`).
- [x] `npx supabase@2.90.0 db push --linked --dry-run` → solo `20261124100000_zona_otro.sql` (17 nov).
- [ ] Commit en `fase-a`: `git add supabase/migrations/20261124100000_zona_otro.sql src/lib/tipos.ts; git commit -m "feat: columna perfiles.pais y zona horaria libre (migración)"`.
- No depende de nada. A-4 depende de esto.

### Tarea A-1 (agente): el enlace se gasta al pulsar «Entrar»

**Archivos:** borrar `src/app/auth/confirm/route.ts`; crear `src/app/auth/confirm/page.tsx`, `src/app/auth/confirm/acciones.ts`, `tests/unit/a1-enlace.test.ts`; modificar `src/app/login/page.tsx:8`, `tests/unit/z5a-puerta.test.ts`, `tests/integracion/emails-resend.test.ts` (solo si nombra la ruta borrada).
**Migración:** no. **Depende de:** nada.
**Interfaces:** produce `entrar(formData: FormData): Promise<void>` (acción del servidor; lee `token_hash`, `type`, `siguiente`). La URL del email no cambia (`src/lib/acceso.ts:18`).
- [ ] Test que falla: la página no llama a `verifyOtp`; con sesión ya iniciada redirige a `/entrando` (o `/entrando?siguiente=perfil`); `entrar` con `type` distinto de `magiclink` o `token_hash` vacío lleva a `/login?error=enlace`; con `verifyOtp` correcto, a `/entrando`; con error, a `/login?error=enlace`; `login/page.tsx` contiene «Usa el último email que te llegó».
- [ ] Verlo fallar → implementar → verlo pasar → verificación → commit.

### Tarea A-2 (agente): caller que también es closer (Facu)

**Archivos:** `src/app/(panel)/closer/llamadas/page.tsx`, `src/app/(panel)/closer/llamadas/tablero-closers.tsx`, `src/app/(panel)/closer/acciones.ts`, `src/app/(panel)/closer/llamadas/acciones-fathom.ts`, `src/app/(panel)/closer/llamadas/exportar/route.ts`, `src/app/(panel)/closer/analisis/page.tsx`, `src/app/(panel)/closer/analisis/[id]/page.tsx`, `src/app/(panel)/closer/reporte/route.ts`, `src/app/(panel)/crm/page.tsx`, `src/lib/pipelines.ts`, `src/lib/agendas-datos.ts`, `src/lib/tablero-closers.ts`; crear `tests/unit/a2-caller-closer.test.ts`; solo si se rompen: `z5c-agendas`, `z5c-tambien-closer`, `exportar-agendas`, `ola2-agendas`, `ola2-crm`, `ola-cola-crm`, `citas-bajas`, `f0a-zona-a`, `f1bb-agendas-deshacer`, `z8c-limpieza`, `z5c-analisis` (todos en `tests/unit/`).
**Migración:** no. **Depende de:** nada. (D1: las que agendó con otro closer, solo mirar. D2: entran Análisis, PDF y CRM.)
**Interfaces (las fija el plan):**
- `nivelDefecto(tipo: TipoPipeline, rol: Perfil["rol"], tambienCloser = false): Nivel` → con `tambienCloser`, «Closers» = `"ver"`.
- `calcularNivel`: en un pipeline `closers`, a quien `esCloser(perfil)` le vale la fila de rol `closer` (no la de `caller`); la fila de la persona sigue mandando.
- `cargarCitasVentas(proyectoId, closerIds, agendadasPor, conSinCloser = false, equipoActivo = [], conVentas = true, modo: "y" | "o" = "y")`: con `"o"`, citas con `closer_id` en la lista **o** `agendada_por = agendadasPor`.
- `TableroClosers` recibe `soloMirarIds?: string[]` (tarjetas que solo se miran).
- Regla de página: `const doble = perfil.rol === "caller" && esCloser(perfil)`; `const mirar = perfil.rol === "caller" && !esCloser(perfil)`.
- [ ] Test que falla: `nivelDefecto("closers","caller",true)` = `"ver"`; `calcularNivel` con fila de rol caller «Sin acceso» en Closers y perfil también closer = `"ver"`; `closersVisibles` de Facu = solo él; las 4 comprobaciones usan `esCloser`; la página de Agendas ya no tiene `mirar = perfil.rol === "caller";` a secas.
- [ ] Verlo fallar → implementar → verlo pasar → verificación → commit.

### Tarea A-3 (agente): campana y «Latam» → «USA»

**Archivos:** `src/lib/avisos-ceo.ts`, `src/lib/mercado.ts`, `src/components/mercado-equipo.tsx`, `src/components/selector-mercado.tsx`, `src/app/(panel)/admin/popups.tsx`, `src/lib/mcp/lectura.ts`, `src/lib/mcp/equipo.ts`, `src/app/api/mcp/route.ts`, `src/app/(panel)/equipo/acciones.ts`, `src/app/(panel)/equipo/alta.tsx`, `src/app/(panel)/equipo/cliente.tsx`, `src/app/(panel)/guiones/editor.tsx`; crear `tests/unit/a4-usa.test.ts`; solo si se rompen: `tests/unit/avisos-ceo.test.ts`, `campana-avisos.test.ts`, `avisos-diario.test.ts`, `ola2-kpis.test.ts`, `z5a-servidor.test.ts`, `ola-arreglos.test.ts`, `mcp-ficha-textos.test.ts`.
**Migración:** no. **Depende de:** nada.
- [ ] Test que falla: la consulta de «citas sin closer» de `avisosCeo` filtra `fecha >= ahora`; ninguna línea que no sea comentario de esos archivos dice «Latam» o «LATAM»; `MERCADOS` y `OPCIONES_FILTRO_MERCADO` dicen `"USA"`; los valores internos `"latam"` siguen igual.
- [ ] Verlo fallar → implementar → verlo pasar → verificación → commit.

### Añadido el 17 nov tras la ronda 1 (OK de Jose)

- **A-3** suma 2 cosas: (1) `src/lib/mcp/lectura.ts:254-259` (herramienta `agenda` del MCP) usa `doble`/`mirar` y el modo «o», como Agendas: tras A-2, Facu solo veía las citas que agendó Y en las que es closer; (2) `tests/unit/ola-arreglos.test.ts:41` usa `fileURLToPath` en vez de `URL.pathname` (falla en Windows desde `35b348b`, 15 nov; en Linux pasa).
- **A-2b** (el agente de A-2, en su copia, después de A-3 y A-4 por el tope de 2): `src/app/(panel)/crm/tablero.tsx` reenvía `soloMirarIds` al `TableroClosers` (Facu ve en su CRM las que agendó con otro closer, solo mirar) y `src/app/(panel)/kpis/page.tsx:287-297` usa `doble` y el modo «o» (sus métricas de Agendas vuelven a contar las que agendó). Test en `tests/unit/a2-caller-closer.test.ts`.

### Tarea A-4 (agente): zona «Otro»

**Archivos:** `src/app/(panel)/perfil/foto-zona.ts`, `src/lib/zona-persona.ts`, `src/app/onboarding/zona/page.tsx`, `src/app/(panel)/perfil/acciones.ts` (incluye el texto «Latam» de `:80`), `src/app/(panel)/perfil/cliente.tsx`, `src/app/(panel)/perfil/page.tsx`; crear `tests/unit/a5-zona-otro.test.ts`; solo si se rompen: `tests/unit/foto-zona.test.ts`, `z5b-arreglos.test.ts`, `z8d-limpieza.test.ts`.
**Migración:** sí, A-0. **Depende de:** A-0 (columna `pais` y tipo).
**Interfaces:**
- `zonaValida(v: unknown): string | null` (misma firma; acepta cualquier zona que `new Intl.DateTimeFormat("en", { timeZone })` acepte y cumpla el formato de la migración).
- `todasLasZonas(): string[]` (`Intl.supportedValuesOf("timeZone")`, más las 6 si faltan).
- `horaEnZona(zona: string, ahora: Date): string` → `"HH:MM"`.
- `paisValido(v: unknown): string | null` (recortado, 1-80 caracteres).
- `guardarMiZona(zona: string, pais?: string | null)`; con una de las 6 zonas, `pais` se guarda `null`; con «Otro», `pais` obligatorio.
- [ ] Test que falla: las 6 pasan; `"America/Lima"` pasa; `"Marte/Base"` y `""` no; `horaEnZona("Europe/Madrid", new Date("2026-11-17T20:00:00Z"))` = `"21:00"`; `paisValido("  Perú ")` = `"Perú"`; `paisValido("x".repeat(81))` = `null`; la pantalla de onboarding tiene «Otro».
- [ ] Verlo fallar → implementar → verlo pasar → verificación → commit.

### Rondas, orden e integración · Fase A

| Ronda | Agentes (en paralelo) | Por qué juntos | Tiempo |
|---|---|---|---|
| — | A-0 (ORQ) | prepara la base | 15 min |
| 1 | A-2 y A-1 | no comparten archivos ni dependen de A-0 | 60 min |
| — | integrar A-1, luego A-2 | | 15 min |
| 2 | A-3 y A-4 | A-4 necesita A-0 | 45 min |
| — | integrar A-3, luego A-4 | | 15 min |
| — | revisor + correcciones + migración + PR (CI 6-8 min) + producción | | 75 min |

**Total Fase A: unas 3 h 45 min.**

### Pasos de ejecución (los mismos en cada fase)

- [ ] 1. Rama de integración desde `origin/main`; tarea ORQ si la hay; commit.
- [ ] 2. Por cada ronda: crear las copias y lanzar los agentes de la ronda en un mismo mensaje. No tocar sus archivos mientras trabajan.
- [ ] 3. Al volver cada agente: `git -C ..\VENTAS-copias\<x> diff --stat <base>..HEAD`. Si hay un archivo fuera de su lista, se rechaza ese cambio (`git checkout <base> -- <archivo>` en su rama, nuevo commit) y se avisa a Jose.
- [ ] 4. Integrar en el orden de la tabla: `git merge --no-ff fase-x-<x>`. Después de cada uno: `npx next typegen; npx tsc --noEmit; npx eslint .; npx vitest run tests/unit`.
- [ ] 5. Revisor de solo lectura (prompt R) sobre `git diff origin/main...fase-x`. Corregir lo grave (ORQ, o el mismo agente con su lista).
- [ ] 6. Migraciones: `npx supabase@2.90.0 db push --linked --dry-run`, enseñar la salida a Jose y, con su OK, `npx supabase@2.90.0 db push --linked` **antes** de fusionar. Comprobar en la base, con `--read-only`, que existe lo nuevo.
- [ ] 7. `git push -u origin fase-x`; `gh pr create`. Esperar los 4 checks en verde sobre el mismo commit. «invalid response from the upstream server» → `gh run rerun <id> --failed`.
- [ ] 8. Fusionar. Esperar producción lista: `gh api repos/eternitydevzz/Dashboard-de-ventas/commits/<sha de main>/status --jq '.statuses[] | select(.context=="Vercel") | .state'` → `success`, y `gh api "repos/eternitydevzz/Dashboard-de-ventas/deployments?per_page=1" --jq '.[0] | .environment, .sha'` → `Production` y ese sha.
- [ ] 9. Comprobar en https://dashboard.eternity.llc cada tarea (tabla de cada fase) y los errores de los últimos 30 min en `errores_app` (sección 2).
- [ ] 10. Borrar copias y ramas. Rellenar la sección 8 de `PENDIENTES-JOSE.md` en la rama de la fase siguiente (o en un PR de docs si es la última).
- [ ] 11. Informe a Jose: qué salió mal, fallos que quedan, qué no se probó con datos reales, mejoras y nota del 1 al 10.

### Comprobación en producción · Fase A

| Tarea | Cómo | Escribe en producción |
|---|---|---|
| A1 | `curl -s -o NUL -w "%{http_code}" "https://dashboard.eternity.llc/auth/confirm?token_hash=x&type=magiclink"` → 200 (página, no redirección) y no llama a Supabase. La prueba con un enlace real la hace Jose con su propia cuenta si quiere (pedirlo y abrirlo 2 veces); el orquestador no la hace. | no |
| A2 | Solo lectura: citas de Facu como closer y como `agendada_por`. La pantalla de Facu: sin verificar (no se entra como otra persona). | no |
| A3 | `select count(*) from citas where closer_id is null and estado in ('pendiente','confirmacion_pendiente','confirmada') and fecha >= now()` (hoy 0) = número de la campana. Las 28 pasadas ya no cuentan. | no |
| A4 | Abrir Equipo, Agendas (filtro), Popups y Guiones: «USA», nunca «Latam». | no |
| A5 | Abrir Mi perfil y `/onboarding/zona`: sale «Otro» y la hora de cada zona. Sin guardar. | no |

---

## 7. Fase B · rama `fase-b` · 1 PR

### Tarea B-1 (agente): «Formularios (N)» en la ficha y en el popup

**Archivos:** crear `src/lib/formularios-lead.ts`, `src/components/formularios-lead.tsx`, `tests/unit/formularios-lead.test.ts`; modificar `src/app/(panel)/leads/resumen.ts`, `src/app/(panel)/leads/[id]/page.tsx`, `src/components/popup-lead.tsx`; solo si se rompen: `tests/unit/resumen-lead.test.ts`, `ola-arreglos.test.ts`, `f3-reproductor.test.ts`, `mcp-ficha-textos.test.ts`.
**Migración:** no (ya existe el índice `webhook_eventos_lead_idx`, `20261121100000_datos.sql:9`). **Depende de:** Fase A fusionada.
**Interfaces:**
- `type EnvioFormulario = { id: string; fecha: string; entrada: string; respuestas: Respuesta[]; vaciado: boolean }`.
- `enviosDelLead(filas: { id: string; recibido_en: string; tipo: string | null; payload: unknown; entradas: { nombre: string } | null }[]): EnvioFormulario[]` (pura; respuestas con `interpretar(payload).lead.respuestas`; más nuevo primero; `vaciado` si `payload` es `{}`; `entrada` = nombre de la Entrada, o `tipo`, o «Sin Entrada»).
- `cargarEnviosLead(proyectoId: string, leadId: string): Promise<EnvioFormulario[]>` (`webhook_eventos` con `proyecto_id` y `lead_id`, `order recibido_en desc`, `limit 50`; si falla, lanza).
- `resumenLead` devuelve además `formularios: EnvioFormulario[]`.
- La lista «Respuestas del formulario» de siempre se queda (supuesto: la decisión añade un apartado, no quita el otro).
- [ ] Test que falla: 3 filas → 3 envíos ordenados; `payload` `{}` → `vaciado: true` y 0 respuestas; fila sin Entrada usa `tipo`; dos envíos con la misma pregunta conservan cada uno su respuesta.
- [ ] Verlo fallar → implementar → verlo pasar → verificación → commit.

### Rondas · Fase B

| Ronda | Agente | Tiempo |
|---|---|---|
| 1 | B-1 | 60 min |
| — | integrar, revisor, PR, producción | 50 min |

**Total Fase B: unas 1 h 50 min.** Producción: con `select lead_id, count(*) from webhook_eventos where lead_id is not null group by 1 order by 2 desc limit 5` elegir un lead y comprobar que la ficha enseña ese número. Si abrir la ficha escribe algo (sin verificar), usar Kevin o Pier.

---

## 8. Fase C · rama `fase-c` · 1 PR

### Tarea C-0 (ORQ): migración y tipos

**Archivos:**
- Crear: `supabase/migrations/20261125100000_reporte_diario.sql`
- Modificar: `src/lib/tipos.ts` (al final): `MercadoReporte = "es" | "latam"`; `ParteReporte = "por_persona" | "totales_dia" | "totales_mes" | "va_mal" | "objetivos"`; `ConfigReporte = { mercado: MercadoReporte; activo: boolean; hora: string; emails: string[]; whatsapps: string[]; partes: ParteReporte[] }`.
- [ ] La migración:
  - `reporte_config (proyecto_id uuid references proyectos on delete cascade, mercado text check in ('es','latam'), activo boolean not null default true, hora text not null default '21:00' check (hora ~ '^([01][0-9]|2[0-3]):(00|15|30|45)$'), emails text[] not null default array['info@eternity.llc'], whatsapps text[] not null default '{}', partes text[] not null default array['por_persona','totales_dia','totales_mes','va_mal','objetivos'], actualizado_en timestamptz not null default now(), primary key (proyecto_id, mercado))`.
  - `reporte_envios (proyecto_id uuid references proyectos on delete cascade, mercado text, fecha date, creado_en timestamptz default now(), primary key (proyecto_id, mercado, fecha))`.
  - RLS activada en las 2, sin políticas (solo `service_role`), como `avisos_diario`.
  - Cron `reporte-diario`, `'*/15 * * * *'`, solo si existe el proyecto `ZGWJLBH58RJtl2iGhykp`, `net.http_post` a `'https://dashboard.eternity.llc/api/avisos/reporte/' || p.id` con la cabecera `x-eternity-secreto` (copia de `20261109120100_avisos_diario.sql`).
- [ ] Prueba en seco → commit en `fase-c`.
- Nota: entre subir la migración y fusionar, el cron llama a una ruta que aún no existe (404, sin efecto).

### Tarea C-1 (agente): los números del reporte

**Archivos:** crear `src/lib/reporte-diario.ts`, `src/lib/reporte-diario-datos.ts`, `tests/unit/reporte-diario.test.ts`.
**Migración:** C-0. **Depende de:** C-0.
**Interfaces (produce):**
- `type DatosReporte = { mercado: MercadoReporte; fecha: string; personas: { nombre: string; rol: "caller" | "closer"; llamadas: number; agendas: number; ventas: number }[]; dia: { llamadas: number; agendas: number; ventas: number; cash: number }; mes: { llamadas: number; agendas: number; ventas: number; cash: number }; vaMal: string[]; objetivos: { nombre: string; cifra: string; hecho: number; meta: number }[] }`.
- `armarReporte(base: Base, o: { mercado: MercadoReporte; mercados: Record<string, Mercado>; zona: string; ahora: Date; avisos: AvisoCeo[]; avances: Avance[] }): DatosReporte` (pura). Gente del mercado como `calcularRanking` (`kpis.ts:184-190`), números con `calcularKpis(base, rangoDe("hoy" | "mes", zona), zona)`.
- `textoReporte(d: DatosReporte, partes: ParteReporte[]): { asunto: string; texto: string; html: string }` (html con `plantillaEmail`; solo las partes elegidas).
- `datosReporte(proyecto: Proyecto, mercado: MercadoReporte, ahora: Date): Promise<DatosReporte>` (carga con `cargarBase`, `mercadosDelProyecto`, `avisosCeo`, `cargarObjetivos` + `calcularAvances`).
- Zonas: `es` → `Europe/Madrid`; `latam` → `America/New_York`.
- [ ] Test que falla: los totales del día = `calcularKpis` para el mismo rango y gente; un caller de España no sale en el reporte USA; `2026-11-18T02:00:00Z` en `latam` → fecha `2026-11-17`; sin `"objetivos"` no aparece «Objetivos»; el asunto lleva la fecha y «España» o «USA».
- [ ] Verlo fallar → implementar → verlo pasar → verificación → commit.

### Tarea C-2 (agente): pantalla «Reporte» en Administración

**Archivos:** crear `src/app/(panel)/admin/reporte.tsx`, `src/app/(panel)/admin/acciones-reporte.ts`, `src/lib/reporte-config.ts`, `tests/unit/reporte-config.test.ts`; modificar `src/app/(panel)/admin/page.tsx` (añadir la pestaña `{ v: "reporte", t: "Reporte" }` y su bloque; la pestaña «Reportes» de las preguntas se queda, D3 = no); solo si se rompen: `tests/unit/precargas.test.ts`, `z5b-arreglos.test.ts`.
**Migración:** C-0. **Depende de:** C-0.
**Interfaces (produce):**
- `ZONA_REPORTE: Record<MercadoReporte, string>`; `configPorDefecto(mercado: MercadoReporte): ConfigReporte` (activo, `"21:00"`, `["info@eternity.llc"]`, `[]`, las 5 partes).
- `validarConfig(entrada: unknown, mercado: MercadoReporte): ConfigReporte` (lanza `ErrorUsuario`: hora en cuartos de hora, emails válidos 1-10, WhatsApp `+` y 8-15 cifras 0-10, partes conocidas, al menos 1).
- `leerConfigsReporte(proyectoId: string): Promise<Record<MercadoReporte, ConfigReporte>>` (sin fila = por defecto; si la lectura falla, lanza).
- `guardarConfigReporte(mercado: MercadoReporte, entrada: unknown)` en `acciones-reporte.ts` (CEO o director con Administración, como `admin/acciones.ts`).
- No toca la pestaña «Reportes» (preguntas), `preguntas-reporte.tsx` ni `guardarPreguntasReporte`.
- [ ] Test que falla: `validarConfig` rechaza `"21:10"`, `"25:00"`, un email sin @ y 11 emails; acepta la config por defecto; `leerConfigsReporte` sin filas devuelve las 2 por defecto; `admin/page.tsx` tiene `t: "Reporte"` y sigue teniendo `t: "Reportes"`.
- [ ] Verlo fallar → implementar → verlo pasar → verificación → commit.

### Tarea C-3 (agente): quitar la sección Reportes

**Archivos (D3 = no: se quitan solo la pantalla y el botón):** borrar `src/app/(panel)/reportes/page.tsx`, `formulario.tsx`, `acciones.ts`; modificar `src/app/(panel)/layout.tsx:74` (botón), `src/lib/permisos.ts:63-75` (`rutaInicio` no elige `reportes`, que ya no tiene página), `src/app/onboarding/page.tsx:14-16` (textos que prometen el reporte), `src/app/(panel)/admin/cliente.tsx:50` (solo el texto); crear `tests/unit/c3-sin-reportes.test.ts`; tests a borrar o adaptar solo en lo que prueba la pantalla borrada: `tests/unit/f1c-sin-no-responde.test.ts`, `ola-velocidad.test.ts`, `plantilla-email.test.ts`, `z5d-numeros-reportes.test.ts`, `z5e-reportes-hoy.test.ts`, `z8d-reportes.test.ts`, `bloque7.test.ts`, `csv-prioridad-reportes.test.ts`; `tests/integracion/arreglos-auditoria.test.ts`, `bloque7.test.ts`, `emails-resend.test.ts`, `reportes-avisos.test.ts`, `permisos.test.ts`, `seguridad.test.ts`.
**Se queda:** el permiso «Reportes» (`permisos-constantes.ts`), la pestaña de preguntas, `admin/preguntas-reporte.tsx`, `guardarPreguntasReporte`, `src/lib/reportes.ts`, el icono de `barra-lateral.tsx` y la tabla `reportes`.
**Migración:** no. **Depende de:** nada de C-1 ni C-2 (va en la ronda 2 por el tope de 2 agentes).
- [ ] Test que falla: no existe `src/app/(panel)/reportes/page.tsx`; `layout.tsx` no contiene `"/reportes"`; `rutaInicio` de alguien que solo tiene `reportes` y `manuales` devuelve `/manuales`; `src/lib/reportes.ts` sigue existiendo.
- [ ] Verlo fallar → implementar → verlo pasar → verificación → commit. Los tests de integración los pasa el orquestador con Docker al integrar.

### Tarea C-4 (agente): el envío a su hora

**Archivos:** crear `src/lib/reporte-envio.ts`, `src/app/api/avisos/reporte/[proyectoId]/route.ts`, `tests/unit/reporte-envio.test.ts`; modificar `src/proxy.ts:15` (añadir `/api/avisos/reporte/`), `tests/unit/z5a-puerta.test.ts` (añadir la ruta a las públicas).
**Migración:** C-0. **Depende de:** C-1 y C-2 integrados.
**Interfaces:**
- Consume: `datosReporte`, `textoReporte` (C-1); `leerConfigsReporte`, `ZONA_REPORTE` (C-2); `enviarEmail` (`src/lib/email.ts:10`).
- Produce: `enviarReporte(proyectoId: string, mercado: MercadoReporte, ahora = new Date()): Promise<{ estado: "apagado" | "fuera_de_hora" | "ya_enviado" | "enviado" } | { estado: "fallo"; motivo: string }>`. Igual que `enviarDiario` (`src/lib/avisos-diario.ts:13-41`): manda si la hora local ≥ la configurada; reserva `(proyecto, mercado, fecha local)` en `reporte_envios` con `upsert ... ignoreDuplicates`; si el email falla, suelta la reserva.
- La ruta: copia de `src/app/api/avisos/diario/[proyectoId]/route.ts` (misma clave y límite); llama a `enviarReporte` para `es` y `latam`.
- WhatsApp: no se manda (Fase D). Los números solo se guardan.
- [ ] Test que falla: 20:59 de Madrid → `fuera_de_hora`; 21:00 → `enviado`; segunda llamada → `ya_enviado`; `activo: false` → `apagado`; `2026-11-18T02:00:00Z` en `latam` reserva `2026-11-17`; email que falla → `fallo` y borra la reserva; la ruta sin clave → 401.
- [ ] Verlo fallar → implementar → verlo pasar → verificación → commit.

### Rondas · Fase C

| Ronda | Agentes | Por qué juntos | Tiempo |
|---|---|---|---|
| — | C-0 (ORQ) | | 20 min |
| 1 | C-1 y C-2 | independientes; los 2 solo necesitan C-0 | 75 min |
| — | integrar C-2, luego C-1 | | 15 min |
| 2 | C-3 y C-4 | C-4 necesita C-1 y C-2; C-3 no depende de nadie (va aquí por el tope de 2); no comparten archivos | 75 min |
| — | integrar C-3, luego C-4; tests de integración en local con Docker (`npx supabase start`) | C-3 toca 8 tests de integración | 30 min |
| — | revisor + correcciones + migración + PR + producción | | 90 min |

**Total Fase C: unas 5 h 05 min.** Producción: abrir Administración → Reporte sin guardar (vale la configuración por defecto); a las 21:00 de Madrid (20:00 UTC en noviembre) mirar `select * from reporte_envios` y que el email llegue a info@eternity.llc (lo mira Jose o Cristian); a las 21:00 de Nueva York (02:00 UTC), igual para USA. Comprobar que `/reportes` ya no está en el menú.

**Total A + B + C: unas 10 h 40 min de trabajo (225 + 110 + 305 min), en varias sesiones.** Regla de Jose: lo primero es la Fase A completa con datos reales; hasta que Jose la vea, no se empieza la B.

---

## 9. Fase D · bloqueada

Bloqueada hasta que Cristian decida el servidor. El WhatsApp de la Fase C (números guardados en `reporte_config.whatsapps`) se manda en la Fase D.

- **Herramienta (Jose, 17 nov):** WAHA, de código abierto. PENDIENTES-JOSE.md dice «Open WA». Son 2 proyectos distintos (comprobado con `gh search repos`): WAHA = `devlikeapro/waha` (WhatsApp HTTP API, REST, licencia Apache-2.0, 7.838 estrellas); Open WA = `open-wa/wa-automate-nodejs` (librería de Node). **Decidido (Jose, D9): WAHA sustituye a Open WA.** Al llegar a la Fase D, actualizar la sección 6 de PENDIENTES-JOSE.md (dice «Open WA»).
- **Lo que pide Jose para la D:** recordatorios a los closers, y a los CEO avisos de agendas y recordatorios. PENDIENTES-JOSE.md ya trae los avisos al agendar una cita y al cerrar una venta (al closer, al caller y al CEO o grupo). Los **recordatorios** son nuevos. **Decidido (Jose, D10, «en principio»):** van al closer, al caller y al CEO, y los avisos del CEO son los de la sección 6 (cita agendada y venta cerrada). Falta decidir cuánto antes de la cita sale el recordatorio; se pregunta al empezar la Fase D.
- Sigue valiendo lo de PENDIENTES-JOSE.md, sección 6: solo para el equipo (al lead le escribe GHL), un número que no sea el principal, servidor 24 h fuera de Vercel y la clave en las variables de entorno de Vercel. Riesgo: no es la API oficial de WhatsApp; puede bloquear el número.

## 10. Fuera de los agentes (sección 7 de PENDIENTES-JOSE.md)

- Cristian: borrar en GHL el contacto y la cita de «Jose Prueba Claude»; después, el lead `75a4319e-dfac-46be-8347-cf356cb78c2c` (solo con OK de Jose y enseñando la fila).
- Revisar los registros de Vercel después del 18 nov a las 00:23 UTC (atasco de la lectura de GHL). Sin sesión de Vercel no lo puede hacer el orquestador: lo hace Cristian, o se mira `errores_app` (solo enseña lo que la app guarda).
- Supabase (panel de Cristian): copia del 13 nov, duración del enlace mágico, contraseñas filtradas.
- Ver en un teléfono el guion del móvil (botones de 36 px).
- Sin causa: KPIs 3 px más ancho en móvil; 404 de un manual el 13 nov.
- Bloqueado: Fase 7 · Velocidad (~30.000 leads).
- Otro plan: roles closer y director, Safari, controles de Administración, móvil al tocar, carga con todo el equipo.
- Límites conocidos (los 9 de la lista). Nuevo de este plan: `kpis/page.tsx:287` y `mcp/lectura.ts:254` siguen tratando a Facu como caller (si D2 dice «después»).

## 11. Decisiones de Jose (17 nov) y dudas que quedan

| # | Pregunta | Decisión |
|---|---|---|
| D1 | Citas que Facu agendó con otro closer | **Solo mirar** esa tarjeta |
| D2 | Análisis IA, PDF de closers y «Closers» del CRM | **Entran** en A-2; KPIs y MCP, después |
| D3 | Quitar también la pestaña de preguntas y el permiso «Reportes» | **No**: se quitan solo la pantalla y el botón |
| D4 | Reporte España = gente de España; USA = gente de `latam` | **Sí** |
| D5 | Reporte encendido por defecto | **Sí** |
| D6 | Preparar la copia | **Lo hace el orquestador**: `npm ci` y Supabase hechos; Vercel sin sesión (los emails no llegan a info@) → se usa GitHub y `errores_app` |
| D7 | Pruebas que escriben fuera de Kevin y Pier | **Las decide el orquestador**: ninguna. Solo se mira; el reporte se comprueba con su envío real de las 21:00 |
| D8 | Reescribir el plan | **Cambios pequeños** (copia del original en el scratchpad) |
| D9 | ¿WAHA sustituye a Open WA? | **Sí** |
| D10 | Recordatorios y avisos de la Fase D | **En principio**: al closer, al caller y al CEO; avisos de cita agendada y venta cerrada |

Consecuencia de D3 (dicha una vez, sin reabrir la decisión): el permiso «Reportes» seguirá saliendo en Permisos y en la ficha de cada persona sin abrir nada, y Administración tendrá 2 pestañas parecidas: «Reportes» (preguntas) y «Reporte» (la nueva).

Duda que queda (no bloquea A, B ni C): cuánto antes de la cita sale el recordatorio (al empezar la Fase D).

## 11 bis. Mis criterios (decididos por Claude, no por Jose ni por Cristian)

- Hora del reporte en cuartos de hora (el cron llama cada 15 min); máximo 10 emails y 10 WhatsApp por reporte.
- Ruta nueva del cron: `/api/avisos/reporte/<proyecto>` (al lado de la del email de las 8:00).
- Sin fila en `reporte_config` = configuración por defecto (encendido, 21:00, info@eternity.llc, las 5 partes).
- Formularios del lead: máximo 50 envíos por ficha; la lista «Respuestas del formulario» de siempre se queda.
- Zona «Otro»: cualquier zona que acepte `Intl`; país de 1 a 80 letras.
- A1: si ya hay sesión, se entra directo sin gastar el enlace.
- C-3: `rutaInicio` deja de elegir «Reportes» para que nadie acabe en una página que no existe.

## 11 ter. Riesgos

| Riesgo | Qué pasa | Cómo se evita |
|---|---|---|
| Un agente toca algo fuera de su lista | Choque al integrar | `git diff --stat` al volver; se rechaza ese cambio |
| Tests de integración que solo pasan en CI | El PR falla tarde | El orquestador los pasa en local con Docker antes del PR |
| La migración se sube y luego el PR no se fusiona | El cron de C llama a una ruta que no existe | Responde 404 sin efecto; se fusiona lo antes posible |
| El primer reporte sale solo esa misma noche | Email con números raros a info@ | Revisor y tests antes; comprobarlo a las 21:00 |
| Sin registros de Vercel | Errores que solo van a `console.error` no se ven | `errores_app` + campana; Cristian mira Vercel si hace falta |

---

## 12. Prompts de los agentes

`<BASE>` = commit de la rama de integración al lanzar la ronda. `<COPIA>` = `C:\Users\Usuario\Desktop\VENTAS-copias\<x>`. Las respuestas de Jose (D1-D8) ya están puestas en cada prompt. El orquestador sustituye `<BASE>` y `<COPIA>` al lanzar; el resto se pega tal cual.

### Prompt A-1

```
## Objetivo
Que el enlace mágico del email solo se gaste al pulsar «Entrar», no al abrirlo. Hoy lo gasta cualquier GET (lector de correo, antivirus, vista previa o una segunda apertura) y la persona ve «Ese enlace ya se usó o ha caducado».

## Contexto (copiado de docs/PENDIENTES-JOSE.md, A1, y comprobado)
- src/app/auth/confirm/route.ts:13-15 llama a supabase.auth.verifyOtp({ token_hash, type: "magiclink" }) en el GET. Si va bien, redirige a /entrando (con ?siguiente=perfil si llega siguiente=perfil); si no, a /login?error=enlace.
- El enlace lo crea src/lib/acceso.ts:15-18: `${urlApp()}/auth/confirm?token_hash=…&type=magiclink[&siguiente=perfil]`. Esa URL NO cambia.
- Cada enlace nuevo invalida el anterior.
- src/proxy.ts:53 deja pasar /auth/confirm sin sesión (vale para la página y su acción). No lo toques.
- La sesión se crea con createSessionClient() de @/lib/supabase/server.
- Decisión: el GET enseña una página con el logo (/marca/eternity.png, como src/app/onboarding/zona/page.tsx) y un botón «Entrar»; el enlace se gasta al pulsarlo (acción del servidor). Si ya hay sesión, entrar sin error (redirigir a /entrando o /entrando?siguiente=perfil). El error dice «usa el último email que te llegó».
- Texto nuevo de src/app/login/page.tsx:8: «Ese enlace ya se usó o ha caducado (dura 24 horas). Usa el último email que te llegó: cada enlace nuevo anula los anteriores. También puedes entrar con tu contraseña o pedir otro aquí abajo («¿No puedes entrar?»).»

## Estado final
- Borrado src/app/auth/confirm/route.ts (no puede convivir con page.tsx).
- Creados src/app/auth/confirm/page.tsx y src/app/auth/confirm/acciones.ts con `export async function entrar(formData: FormData): Promise<void>` ("use server"): lee token_hash, type y siguiente; si type !== "magiclink", o token_hash vacío o de más de 500 caracteres → redirect("/login?error=enlace") sin llamar a verifyOtp; verifyOtp correcto → redirect a /entrando (con siguiente); error → /login?error=enlace.
- tests/unit/a1-enlace.test.ts nuevo y tests/unit/z5a-puerta.test.ts adaptado (hoy importa GET de la ruta borrada, línea 32).

## Archivos (lista cerrada; no toques nada más)
- src/app/auth/confirm/route.ts (borrar)
- src/app/auth/confirm/page.tsx (crear)
- src/app/auth/confirm/acciones.ts (crear)
- src/app/login/page.tsx
- tests/unit/a1-enlace.test.ts (crear)
- tests/unit/z5a-puerta.test.ts
- tests/integracion/emails-resend.test.ts (solo si nombra la ruta borrada)

## Test primero
1. Escribe tests/unit/a1-enlace.test.ts con: (a) la página sin sesión NO llama a verifyOtp; (b) con sesión redirige a /entrando y a /entrando?siguiente=perfil; (c) entrar con type "signup" o token_hash vacío → /login?error=enlace sin llamar a verifyOtp; (d) entrar con verifyOtp sin error → /entrando; (e) con error → /login?error=enlace; (f) login/page.tsx contiene «Usa el último email que te llegó».
2. npx vitest run tests/unit/a1-enlace.test.ts → debe FALLAR. Guarda la salida.
3. Implementa. 4. Vuelve a ejecutarlo → PASA. Guarda la salida.

## Reglas comunes (obligatorias)
- Trabajas solo en la copia <COPIA>, rama fase-a-a1.
- Antes de escribir la página y la acción, lee en node_modules/next/dist/docs/ las guías de páginas (searchParams), acciones del servidor (formularios, "use server", redirect) y cookies. Es Next 16.4.3 y React 19.3: no des nada por sabido.
- Verificación final, todo en verde y en este orden: npx next typegen; npx tsc --noEmit; npx eslint .; npx vitest run tests/unit/a1-enlace.test.ts tests/unit/z5a-puerta.test.ts
- Commit: git add <archivo> uno por uno, solo los de tu lista; los borrados con git rm <archivo>. Mensaje: "fix: el enlace mágico se gasta al pulsar Entrar, no al abrirlo".
- PROHIBIDO: npm install o npm ci; tocar package.json o package-lock.json; git add -A o git add .; git stash; git push; abrir PR; tocar main; producción; la base de datos (ni leer); supabase/; el navegador; .env*; scripts/salida/; contraseñas; entrar como otra persona; lanzar subagentes.
- PARA y pregunta (escribe la pregunta y termina) si: necesitas un archivo fuera de la lista; un test falla 2 veces seguidas por la misma causa; algo choca con las decisiones de arriba; falta un dato.
- No inventes. Lo que no hayas comprobado, escríbelo como «sin verificar».

## Qué devuelves
1) hash del commit; 2) salida de git diff --stat <BASE>..HEAD; 3) la salida del test fallando y pasando, y la de cada comando de verificación con números (tests pasados/fallados, errores de tsc y eslint); 4) qué no pudiste probar; 5) dudas.
```

### Prompt A-2

```
## Objetivo
Que quien es caller y también closer (Facu: rol "caller" con tambien_closer = true) use Agendas y el pipeline «Closers» como un closer, y además vea las citas que agendó como caller.

## Contexto (copiado de docs/PENDIENTES-JOSE.md, A2, y comprobado en el código)
- esCloser está en src/lib/tipos.ts:6: p.rol === "closer" || !!p.tambien_closer.
- src/app/(panel)/closer/llamadas/page.tsx:51: `mirar = perfil.rol === "caller"` pone a Facu en «solo mirar» (sin «Reagendar», solo 3 pestañas, solo las citas que agendó).
- src/lib/pipelines.ts:19-30: nivelDefecto(tipo, rol) y calcularNivel miran solo el rol; «Closers» sale «Sin acceso» a un caller.
- Exigen rol === "closer" en vez de esCloser(perfil): src/app/(panel)/closer/acciones.ts:217 y :290, src/app/(panel)/closer/llamadas/acciones-fathom.ts:24, src/app/(panel)/closer/llamadas/exportar/route.ts:20.
- Además (encontrado al revisar): src/lib/agendas-datos.ts:44 (closersVisibles trata a todo caller igual); src/lib/tablero-closers.ts:20-28 (cargarCitasVentas filtra closer_id IN ids Y agendada_por = X, no «o»); src/app/(panel)/closer/llamadas/tablero-closers.tsx:58 (soloMirar es de todo el tablero); src/app/(panel)/crm/page.tsx:86-87 y :172 (pipeline Closers del CRM); src/app/(panel)/closer/analisis/page.tsx:25, closer/analisis/[id]/page.tsx:17 y closer/reporte/route.ts:16.
- Decisión de Cristian: como un closer (sus citas con todas las acciones y pestañas; mueve en «Closers») y además ve las que agendó como caller. Las que agendó con OTRO closer: solo mirar esa tarjeta (decisión de Jose, D1): se ven, no se mueven y no tienen acciones.
- Un caller que NO es closer sigue exactamente igual que hoy.

## Interfaces que debes usar (las fija el plan)
- nivelDefecto(tipo: TipoPipeline, rol: Perfil["rol"], tambienCloser = false): Nivel → con tambienCloser, «closers» = "ver".
- calcularNivel: en un pipeline de tipo "closers", si esCloser(perfil), vale la fila de rol "closer" (no la de "caller"); la fila de la persona sigue mandando.
- cargarCitasVentas(proyectoId, closerIds, agendadasPor, conSinCloser = false, equipoActivo = [], conVentas = true, modo: "y" | "o" = "y"): con "o", citas con closer_id en closerIds O agendada_por = agendadasPor. Las llamadas que ya existen no cambian.
- TableroClosers: prop nueva soloMirarIds?: string[] (esas tarjetas no se mueven ni tienen acciones).
- En las páginas: const doble = perfil.rol === "caller" && esCloser(perfil); const mirar = perfil.rol === "caller" && !esCloser(perfil).

## Archivos (lista cerrada; no toques nada más)
src/app/(panel)/closer/llamadas/page.tsx; src/app/(panel)/closer/llamadas/tablero-closers.tsx; src/app/(panel)/closer/acciones.ts; src/app/(panel)/closer/llamadas/acciones-fathom.ts; src/app/(panel)/closer/llamadas/exportar/route.ts; src/app/(panel)/closer/analisis/page.tsx; src/app/(panel)/closer/analisis/[id]/page.tsx; src/app/(panel)/closer/reporte/route.ts; src/app/(panel)/crm/page.tsx; src/lib/pipelines.ts; src/lib/agendas-datos.ts; src/lib/tablero-closers.ts; tests/unit/a2-caller-closer.test.ts (crear). Solo si se rompen por tu cambio: tests/unit/z5c-agendas.test.ts, z5c-tambien-closer.test.ts, exportar-agendas.test.ts, ola2-agendas.test.ts, ola2-crm.test.ts, ola-cola-crm.test.ts, citas-bajas.test.ts, f0a-zona-a.test.ts, f1bb-agendas-deshacer.test.ts, z8c-limpieza.test.ts, z5c-analisis.test.ts.
## Test primero
1. tests/unit/a2-caller-closer.test.ts con: nivelDefecto("closers","caller",true) === "ver"; nivelDefecto("closers","caller") === "sin_acceso"; calcularNivel con fila {rol:"caller", nivel:"sin_acceso"} en Closers y perfil {rol:"caller", tambien_closer:true} → "ver"; closersVisibles(Facu, gente, null).ids igual a ["facu"]; closersVisibles(caller normal) igual que hoy; closer/acciones.ts, acciones-fathom.ts y exportar/route.ts ya no contienen `rol !== "closer")` y sí `esCloser(`; llamadas/page.tsx no contiene `mirar = perfil.rol === "caller";`.
2. Ejecútalo → FALLA. 3. Implementa. 4. Ejecútalo → PASA.

## Reglas comunes (obligatorias)
- Trabajas solo en la copia <COPIA>, rama fase-a-a2.
- Antes de tocar páginas o acciones, lee en node_modules/next/dist/docs/ lo que uses (páginas de servidor, searchParams, acciones del servidor). Es Next 16.4.3 y React 19.3.
- Verificación final, todo en verde y en este orden: npx next typegen; npx tsc --noEmit; npx eslint .; npx vitest run tests/unit/a2-caller-closer.test.ts y todos los tests de tu lista.
- Commit: git add <archivo> uno por uno, solo los de tu lista. Mensaje: "fix: quien es caller y closer usa Agendas y Closers como closer".
- PROHIBIDO: npm install o npm ci; package.json o package-lock.json; git add -A o git add .; git stash; git push; PR; main; producción; base de datos (ni leer); supabase/; navegador; .env*; scripts/salida/; contraseñas; entrar como otra persona; subagentes.
- PARA y pregunta si: necesitas un archivo fuera de la lista (por ejemplo src/lib/mcp/lectura.ts o kpis/page.tsx: NO son tuyos); un test falla 2 veces seguidas por la misma causa; algo choca con la decisión; falta un dato.
- No inventes. Lo no comprobado, «sin verificar».

## Qué devuelves
1) hash del commit; 2) git diff --stat <BASE>..HEAD; 3) salida del test fallando y pasando, y de cada comando de verificación con números; 4) qué no pudiste probar (la pantalla real de Facu no se puede ver); 5) dudas.
```

### Prompt A-3

```
## Objetivo
Dos cambios pequeños: (1) la campana del CEO deja de contar las citas ya pasadas sin closer; (2) en todo lo visible, «Latam» pasa a «USA». «España» se queda. El valor interno "latam" NO cambia (ni en tipos, ni en la base, ni en la URL ?mercado=latam, ni en el enum del MCP).

## Contexto (copiado de docs/PENDIENTES-JOSE.md, A3 y A4, y comprobado)
- src/lib/avisos-ceo.ts:23 cuenta citas con closer_id null y estado en ABIERTAS, sin mirar la fecha. Hay 28 viejas de GHL (17 oct–2 nov) que se quedan en la base como están. Arreglo: añadir .gte("fecha", <ahora en ISO>) a esa consulta. El email de las 8:00 usa el mismo número (src/lib/avisos-diario.ts:26): está bien que cambie igual.
- Textos visibles con «Latam» (no comentarios): src/lib/mercado.ts:7 y :48 (t: "Latam"); src/components/mercado-equipo.tsx:7 («LATAM»); src/app/(panel)/admin/popups.tsx:18; src/lib/mcp/lectura.ts:68; src/lib/mcp/equipo.ts:49 (pais: "Latam"); src/app/api/mcp/route.ts:75 y :128 (descripciones: «latam» = USA); src/app/(panel)/equipo/acciones.ts:74; src/app/(panel)/equipo/alta.tsx:79; src/app/(panel)/equipo/cliente.tsx:107; src/app/(panel)/guiones/editor.tsx:84, :86, :87; src/components/selector-mercado.tsx:6.
- src/app/(panel)/perfil/acciones.ts:80 también dice «Latam», pero NO es tuyo (lo cambia otro agente).
- Los comentarios con «Latam» no hace falta cambiarlos.

## Archivos (lista cerrada; no toques nada más)
src/lib/avisos-ceo.ts; src/lib/mercado.ts; src/components/mercado-equipo.tsx; src/components/selector-mercado.tsx; src/app/(panel)/admin/popups.tsx; src/lib/mcp/lectura.ts; src/lib/mcp/equipo.ts; src/app/api/mcp/route.ts; src/app/(panel)/equipo/acciones.ts; src/app/(panel)/equipo/alta.tsx; src/app/(panel)/equipo/cliente.tsx; src/app/(panel)/guiones/editor.tsx; tests/unit/a4-usa.test.ts (crear). Solo si se rompen por tu cambio: tests/unit/avisos-ceo.test.ts, campana-avisos.test.ts, avisos-diario.test.ts, ola2-kpis.test.ts, z5a-servidor.test.ts, ola-arreglos.test.ts, mcp-ficha-textos.test.ts.

## Test primero
1. tests/unit/a4-usa.test.ts con: (a) avisosCeo con db simulada: la consulta de citas lleva gte("fecha", …) con una fecha a menos de 1 minuto de ahora; (b) MERCADOS y OPCIONES_FILTRO_MERCADO tienen t: "USA" para v: "latam"; (c) leyendo como texto los 12 archivos de textos, ninguna línea que no sea comentario contiene /Latam|LATAM/; (d) mercadoValido("latam") sigue siendo "latam".
2. Ejecútalo → FALLA. 3. Implementa. 4. Ejecútalo → PASA.

## Reglas comunes (obligatorias)
- Trabajas solo en la copia <COPIA>, rama fase-a-a3.
- Si tocas JSX o acciones del servidor, lee antes en node_modules/next/dist/docs/ la guía correspondiente. Es Next 16.4.3 y React 19.3.
- Verificación final, en este orden, todo en verde: npx next typegen; npx tsc --noEmit; npx eslint .; npx vitest run tests/unit/a4-usa.test.ts tests/unit/avisos-ceo.test.ts tests/unit/campana-avisos.test.ts tests/unit/avisos-diario.test.ts tests/unit/mercado.test.ts tests/unit/popups.test.ts tests/unit/ranking-mercado.test.ts y los demás de tu lista.
- Commit: git add <archivo> uno por uno, solo los de tu lista. Mensaje: "fix: campana sin citas pasadas y Latam pasa a USA en lo visible".
- PROHIBIDO: npm install o npm ci; package.json o package-lock.json; git add -A o git add .; git stash; git push; PR; main; producción; base de datos (ni leer); supabase/; navegador; .env*; scripts/salida/; contraseñas; entrar como otra persona; subagentes.
- PARA y pregunta si: necesitas un archivo fuera de la lista; un test falla 2 veces seguidas por la misma causa; algo choca con la decisión; falta un dato.
- No inventes. Lo no comprobado, «sin verificar».

## Qué devuelves
1) hash; 2) git diff --stat <BASE>..HEAD; 3) salida del test fallando y pasando, y de cada comando con números; 4) qué no pudiste probar; 5) dudas.
```

### Prompt A-4

```
## Objetivo
Añadir «Otro» a la zona horaria de cada caller y closer: la persona escribe de dónde es y elige su hora en un desplegable que enseña la hora de ahora en cada zona. Se guardan los dos (perfiles.pais y perfiles.zona_horaria).

## Contexto (copiado de docs/PENDIENTES-JOSE.md, A5, y comprobado)
- Hoy hay 6 zonas en src/app/(panel)/perfil/foto-zona.ts:16-23 (America/Bogota, America/Mexico_City, America/Chicago, America/New_York, America/Argentina/Buenos_Aires, Europe/Madrid) y zonaValida (:25) solo acepta esas.
- Decisión: no añadir países; añadir «Otro».
- La base YA está preparada (migración 20261124100000_zona_otro.sql, del orquestador): columna perfiles.pais (texto 1-80 o null) y el CHECK de zona_horaria ahora solo pide el formato ^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$. El tipo de perfil en src/lib/tipos.ts ya tiene pais?: string | null (no toques tipos.ts).
- Usan zonaValida/ZONAS: src/lib/zona-persona.ts:1,10,13; src/app/onboarding/zona/page.tsx:5,28; src/app/(panel)/perfil/acciones.ts:12,118 (guardarMiZona en :114); src/app/(panel)/perfil/cliente.tsx:9,134; src/app/(panel)/perfil/page.tsx:10,48,53; src/app/onboarding/page.tsx:9,129 (NO es tuyo: mantén la firma de zonaValida para que siga valiendo).
- src/app/(panel)/perfil/acciones.ts:80 dice «Elige Latam o España.»: cámbialo a «Elige USA o España.» (es tuyo).
- nombreZona (zona-persona.ts:13): para una zona fuera de las 6, devuelve la propia zona.

## Interfaces que debes usar (las fija el plan)
- zonaValida(v: unknown): string | null — acepta cualquier zona que new Intl.DateTimeFormat("en", { timeZone: v }) acepte y cumpla el formato de la migración. Las 6 de siempre deben pasar siempre.
- todasLasZonas(): string[] — Intl.supportedValuesOf("timeZone") más las 6 si faltan, sin repetir.
- horaEnZona(zona: string, ahora: Date): string — "HH:MM" en 24 h.
- paisValido(v: unknown): string | null — recortado, 1 a 80 caracteres.
- guardarMiZona(zona: string, pais?: string | null) — con una de las 6 zonas guarda pais = null; con «Otro», pais obligatorio.

## Archivos (lista cerrada; no toques nada más)
src/app/(panel)/perfil/foto-zona.ts; src/lib/zona-persona.ts; src/app/onboarding/zona/page.tsx; src/app/(panel)/perfil/acciones.ts; src/app/(panel)/perfil/cliente.tsx; src/app/(panel)/perfil/page.tsx; tests/unit/a5-zona-otro.test.ts (crear). Solo si se rompen por tu cambio: tests/unit/foto-zona.test.ts, z5b-arreglos.test.ts, z8d-limpieza.test.ts.

## Test primero
1. tests/unit/a5-zona-otro.test.ts con: las 6 zonas de siempre pasan zonaValida; "America/Lima" pasa; "Marte/Base", "" y 5 no pasan; horaEnZona("Europe/Madrid", new Date("2026-11-17T20:00:00Z")) === "21:00"; horaEnZona("America/New_York", new Date("2026-11-18T02:00:00Z")) === "21:00"; paisValido("  Perú ") === "Perú"; paisValido("x".repeat(81)) === null; todasLasZonas() incluye las 6; el texto de onboarding/zona/page.tsx contiene «Otro».
2. Ejecútalo → FALLA. 3. Implementa. 4. Ejecútalo → PASA.

## Reglas comunes (obligatorias)
- Trabajas solo en la copia <COPIA>, rama fase-a-a4.
- Antes de tocar páginas, formularios o acciones, lee en node_modules/next/dist/docs/ las guías de acciones del servidor y formularios. Es Next 16.4.3 y React 19.3.
- Verificación final, en este orden, todo en verde: npx next typegen; npx tsc --noEmit; npx eslint .; npx vitest run tests/unit/a5-zona-otro.test.ts tests/unit/foto-zona.test.ts tests/unit/z5b-arreglos.test.ts tests/unit/z8d-limpieza.test.ts
- Commit: git add <archivo> uno por uno, solo los de tu lista. Mensaje: "feat: zona horaria «Otro» con país y hora de cada zona".
- PROHIBIDO: npm install o npm ci; package.json o package-lock.json; git add -A o git add .; git stash; git push; PR; main; producción; base de datos (ni leer); supabase/; src/lib/tipos.ts; navegador; .env*; scripts/salida/; contraseñas; entrar como otra persona; subagentes.
- PARA y pregunta si: necesitas un archivo fuera de la lista; un test falla 2 veces seguidas por la misma causa; algo choca con la decisión; falta un dato.
- No inventes. Lo no comprobado, «sin verificar».

## Qué devuelves
1) hash; 2) git diff --stat <BASE>..HEAD; 3) salida del test fallando y pasando, y de cada comando con números; 4) qué no pudiste probar; 5) dudas.
```

### Prompt B-1

```
## Objetivo
En la ficha del lead y en su popup, un apartado «Formularios (N)» con CADA envío que llegó del lead: fecha, Entrada y sus respuestas. Hoy solo hay una lista unida y una respuesta nueva pisa a la de la misma pregunta.

## Contexto (copiado de docs/PENDIENTES-JOSE.md, Fase B, y comprobado)
- unirRespuestas (src/lib/leads.ts:55, usada en :254) pisa la respuesta de la misma pregunta. NO la cambies: el apartado nuevo es aparte. La lista «Respuestas del formulario» de siempre se queda.
- Cada envío original está en webhook_eventos: payload (jsonb), entrada_id (FK a entradas, puede ser null), tipo (texto, por ejemplo «entrada: <nombre>»), recibido_en, lead_id, proyecto_id. Hay índice por lead_id. Hay leads con hasta 9 envíos.
- Las respuestas se sacan con interpretar(payload).lead.respuestas (src/lib/entrada.ts:74; la parte de respuestas es :89-117). No copies esa lógica: llama a interpretar.
- Límite: limpiar_payload_envios deja payload = {} en los envíos de más de 12 meses. Ese envío se enseña como «Contenido borrado (más de 12 meses)».
- La ficha es src/app/(panel)/leads/[id]/page.tsx (sección «Respuestas del formulario» en :121-134). El popup (src/components/popup-lead.tsx, de cliente) pide sus datos a /api/leads/[id]/resumen, que devuelve resumenLead de src/app/(panel)/leads/resumen.ts (ya comprueba permisos: jefe, su caller o su closer).
- Fechas en la zona del proyecto (fechaHora de @/lib/formato, como el resto de la ficha).

## Interfaces que debes usar (las fija el plan)
- src/lib/formularios-lead.ts:
  - export type EnvioFormulario = { id: string; fecha: string; entrada: string; respuestas: Respuesta[]; vaciado: boolean }
  - export function enviosDelLead(filas: { id: string; recibido_en: string; tipo: string | null; payload: unknown; entradas: { nombre: string } | null }[]): EnvioFormulario[] — pura; más nuevo primero; vaciado si payload es {} o no es un objeto; entrada = nombre de la Entrada o, si no hay, tipo, o «Sin Entrada».
  - export async function cargarEnviosLead(proyectoId: string, leadId: string): Promise<EnvioFormulario[]> — select id, recibido_en, tipo, payload, entradas(nombre) de webhook_eventos con proyecto_id y lead_id, order recibido_en desc, limit 50; si la consulta falla, lanza Error con el mensaje.
- resumenLead devuelve además formularios: EnvioFormulario[].
- src/components/formularios-lead.tsx: export function FormulariosLead({ envios }: { envios: EnvioFormulario[] }) — usable desde servidor y cliente (import type, sin imports de servidor).

## Archivos (lista cerrada; no toques nada más)
src/lib/formularios-lead.ts (crear); src/components/formularios-lead.tsx (crear); tests/unit/formularios-lead.test.ts (crear); src/app/(panel)/leads/resumen.ts; src/app/(panel)/leads/[id]/page.tsx; src/components/popup-lead.tsx. Solo si se rompen por tu cambio: tests/unit/resumen-lead.test.ts, ola-arreglos.test.ts, f3-reproductor.test.ts, mcp-ficha-textos.test.ts.

## Test primero
1. tests/unit/formularios-lead.test.ts con: 3 filas desordenadas → 3 envíos del más nuevo al más viejo; payload {} → vaciado true y respuestas []; fila con entradas null y tipo "entrada: Quiz" → entrada "entrada: Quiz"; dos envíos con la misma pregunta («¿Cuánto inviertes?») y respuestas distintas → cada envío conserva la suya; cargarEnviosLead con db simulada que da error → lanza.
2. Ejecútalo → FALLA. 3. Implementa. 4. Ejecútalo → PASA.

## Reglas comunes (obligatorias)
- Trabajas solo en la copia <COPIA>, rama fase-b-b1.
- Antes de tocar la página o el componente, lee en node_modules/next/dist/docs/ las guías de componentes de servidor y de cliente. Es Next 16.4.3 y React 19.3.
- Verificación final, en este orden, todo en verde: npx next typegen; npx tsc --noEmit; npx eslint .; npx vitest run tests/unit/formularios-lead.test.ts tests/unit/resumen-lead.test.ts tests/unit/ola-arreglos.test.ts tests/unit/f3-reproductor.test.ts tests/unit/mcp-ficha-textos.test.ts
- Commit: git add <archivo> uno por uno, solo los de tu lista. Mensaje: "feat: la ficha y el popup del lead enseñan todos sus formularios".
- PROHIBIDO: npm install o npm ci; package.json o package-lock.json; git add -A o git add .; git stash; git push; PR; main; producción; base de datos (ni leer); supabase/; src/lib/tipos.ts; navegador; .env*; scripts/salida/; contraseñas; entrar como otra persona; subagentes.
- PARA y pregunta si: necesitas un archivo fuera de la lista; un test falla 2 veces seguidas por la misma causa; algo choca con la decisión; falta un dato.
- No inventes. Lo no comprobado, «sin verificar».

## Qué devuelves
1) hash; 2) git diff --stat <BASE>..HEAD; 3) salida del test fallando y pasando, y de cada comando con números; 4) qué no pudiste probar; 5) dudas.
```

### Prompt C-1

```
## Objetivo
Calcular el contenido del reporte diario (España o USA) con las MISMAS funciones de números que KPIs, para que cuadren, y escribirlo como texto y HTML de email. No envía nada: eso es otro agente.

## Contexto (copiado de docs/PENDIENTES-JOSE.md, Fase C, y comprobado)
- 2 reportes: España a las 21:00 de Madrid (día de Madrid) y USA a las 21:00 de Nueva York (día de Nueva York). Mercado interno: "es" → Europe/Madrid; "latam" → America/New_York (en pantalla se dice «USA»).
- Partes: "por_persona" (llamadas, agendas, ventas), "totales_dia", "totales_mes", "va_mal" (lo del email de las 8:00: avisosCeo de src/lib/avisos-ceo.ts:19, devuelve AvisoCeo[] con .texto) y "objetivos" (src/lib/objetivos.ts: cargarObjetivos :34 y calcularAvances :147).
- Números: calcularKpis(base, rango, zona) de src/lib/kpis.ts:148 (callers: llamadas, agendados, lowTicketVentas; closers: ventas, cash). Base de cargarBase(proyecto) (src/lib/metricas.ts:43). Rango con rangoDe("hoy" | "mes", zona) de src/lib/formato.ts:110. Filtrar la gente por mercado como calcularRanking (src/lib/kpis.ts:184-190) con mercadosDelProyecto(proyectoId) de src/lib/mercado-datos.ts:17.
- Decisión de Cristian: «Llamadas» = cualquier botón de resultado, 1 por lead y día; «Por persona» y Objetivos cuentan solo a callers en llamadas. No cambies kpis.ts, metricas.ts ni objetivos.ts: solo úsalos.
- Personas del reporte (decisión de Jose, D4): reporte "es" = callers y closers con mercado España; reporte "latam" = los de mercado latam (USA).
- HTML con plantillaEmail de src/lib/plantilla-email.ts:31 (mira sus opciones en el archivo).
- Tipos ya puestos por el orquestador en src/lib/tipos.ts: MercadoReporte, ParteReporte, ConfigReporte (no toques tipos.ts).

## Interfaces que debes producir (las usa el agente del envío)
- src/lib/reporte-diario.ts (pura, sin base):
  - export type DatosReporte = { mercado: MercadoReporte; fecha: string; personas: { nombre: string; rol: "caller" | "closer"; llamadas: number; agendas: number; ventas: number }[]; dia: { llamadas: number; agendas: number; ventas: number; cash: number }; mes: { llamadas: number; agendas: number; ventas: number; cash: number }; vaMal: string[]; objetivos: { nombre: string; cifra: string; hecho: number; meta: number }[] }
  - export function armarReporte(base: Base, o: { mercado: MercadoReporte; mercados: Record<string, Mercado>; zona: string; ahora: Date; avisos: AvisoCeo[]; avances: Avance[] }): DatosReporte
  - export function textoReporte(d: DatosReporte, partes: ParteReporte[]): { asunto: string; texto: string; html: string } — asunto «Eternity · Reporte España del DD/MM/AAAA» o «Eternity · Reporte USA del DD/MM/AAAA»; solo las partes elegidas.
- src/lib/reporte-diario-datos.ts ("server-only"): export async function datosReporte(proyecto: Proyecto, mercado: MercadoReporte, ahora: Date): Promise<DatosReporte>.

## Archivos (lista cerrada; no toques nada más)
src/lib/reporte-diario.ts (crear); src/lib/reporte-diario-datos.ts (crear); tests/unit/reporte-diario.test.ts (crear).

## Test primero
1. tests/unit/reporte-diario.test.ts con una base de prueba pequeña (2 callers de España, 1 caller USA, 1 closer USA): los totales del día de armarReporte = los de calcularKpis con el mismo rango y la misma gente; el caller de España no sale en el reporte "latam"; la fecha del reporte "latam" con ahora = 2026-11-18T02:00:00Z es "2026-11-17"; textoReporte sin "objetivos" no contiene «Objetivos»; el asunto lleva «USA» para "latam" y la fecha.
2. Ejecútalo → FALLA. 3. Implementa. 4. Ejecútalo → PASA.

## Reglas comunes (obligatorias)
- Trabajas solo en la copia <COPIA>, rama fase-c-c1.
- No hay código de Next en tu lista; si llegas a necesitarlo, para y pregunta.
- Verificación final, en este orden, todo en verde: npx next typegen; npx tsc --noEmit; npx eslint .; npx vitest run tests/unit/reporte-diario.test.ts tests/unit/ola2-kpis.test.ts
- Commit: git add <archivo> uno por uno, solo los de tu lista. Mensaje: "feat: contenido del reporte diario con los números de KPIs".
- PROHIBIDO: npm install o npm ci; package.json o package-lock.json; git add -A o git add .; git stash; git push; PR; main; producción; base de datos (ni leer); supabase/; src/lib/tipos.ts; navegador; .env*; scripts/salida/; contraseñas; entrar como otra persona; subagentes.
- PARA y pregunta si: necesitas un archivo fuera de la lista; un test falla 2 veces seguidas por la misma causa; los números no cuadran con KPIs; algo choca con la decisión; falta un dato.
- No inventes. Lo no comprobado, «sin verificar».

## Qué devuelves
1) hash; 2) git diff --stat <BASE>..HEAD; 3) salida del test fallando y pasando, y de cada comando con números; 4) qué no pudiste probar; 5) dudas.
```

### Prompt C-2

```
## Objetivo
Pantalla nueva en Administración, «Reporte»: para cada uno de los 2 reportes (España y USA), hora de envío, emails, números de WhatsApp, qué partes lleva e interruptor. Guarda en la tabla reporte_config.

## Contexto (copiado de docs/PENDIENTES-JOSE.md, Fase C, y comprobado)
- La base YA tiene (migración 20261125100000_reporte_diario.sql, del orquestador): reporte_config (proyecto_id, mercado 'es'|'latam', activo boolean default true, hora text default '21:00' con CHECK de cuartos de hora 00/15/30/45, emails text[] default {info@eternity.llc}, whatsapps text[] default {}, partes text[] default las 5, actualizado_en; clave proyecto_id + mercado). RLS sin políticas: se lee y escribe con db() de @/lib/datos (servidor).
- Tipos ya puestos en src/lib/tipos.ts: MercadoReporte = "es" | "latam"; ParteReporte = "por_persona" | "totales_dia" | "totales_mes" | "va_mal" | "objetivos"; ConfigReporte = { mercado; activo; hora; emails; whatsapps; partes } (no toques tipos.ts).
- En pantalla: «España» y «USA» (nunca «Latam»). Partes: «Por persona», «Totales del día», «Totales del mes», «Lo que va mal», «Objetivos». Junto a WhatsApp: «Se mandará cuando esté la Fase D».
- Administración: src/app/(panel)/admin/page.tsx. Pestañas en :44-54. Añade una pestaña NUEVA { v: "reporte", t: "Reporte" } (justo después de { v: "reportes", t: "Reportes" }, :48) con su bloque, como los demás `tab === …`. La pestaña «Reportes» (preguntas del reporte manual, bloque de :357) SE QUEDA tal cual (decisión de Jose, D3): no la toques, ni sus imports (:34 y :35).
- Permisos de las acciones: como las demás de src/app/(panel)/admin/acciones.ts (CEO, o director con Administración). Mira cómo lo hace allí y copia el patrón (seguro(), ErrorUsuario de @/lib/resultado).

## Interfaces que debes producir (las usa el agente del envío)
- src/lib/reporte-config.ts:
  - export const ZONA_REPORTE: Record<MercadoReporte, string> = { es: "Europe/Madrid", latam: "America/New_York" }
  - export function configPorDefecto(mercado: MercadoReporte): ConfigReporte
  - export function validarConfig(entrada: unknown, mercado: MercadoReporte): ConfigReporte — lanza ErrorUsuario: hora "HH:MM" con minutos 00/15/30/45; emails válidos, sin repetir, 1 a 10; WhatsApp «+» y 8-15 cifras, 0 a 10; partes solo las 5 conocidas, al menos 1.
  - export async function leerConfigsReporte(proyectoId: string): Promise<Record<MercadoReporte, ConfigReporte>> — sin fila = configPorDefecto; si la lectura falla, lanza.
- src/app/(panel)/admin/acciones-reporte.ts: export async function guardarConfigReporte(mercado: MercadoReporte, entrada: unknown) ("use server", upsert por proyecto_id + mercado).
- src/app/(panel)/admin/reporte.tsx: export function PantallaReporte({ configs }: { configs: Record<MercadoReporte, ConfigReporte> }).

## Archivos (lista cerrada; no toques nada más)
src/app/(panel)/admin/reporte.tsx (crear); src/app/(panel)/admin/acciones-reporte.ts (crear); src/lib/reporte-config.ts (crear); tests/unit/reporte-config.test.ts (crear); src/app/(panel)/admin/page.tsx. Solo si se rompen por tu cambio: tests/unit/precargas.test.ts, tests/unit/z5b-arreglos.test.ts.

## Test primero
1. tests/unit/reporte-config.test.ts con: validarConfig acepta configPorDefecto("es"); rechaza hora "21:10" y "25:00"; rechaza "sin-arroba"; rechaza 11 emails; rechaza "+12" y acepta "+34600111222"; rechaza la parte "ventas"; leerConfigsReporte con db simulada sin filas → las 2 por defecto; con error → lanza; admin/page.tsx contiene `t: "Reporte"` y sigue conteniendo `t: "Reportes"`.
2. Ejecútalo → FALLA. 3. Implementa. 4. Ejecútalo → PASA.

## Reglas comunes (obligatorias)
- Trabajas solo en la copia <COPIA>, rama fase-c-c2.
- Antes de tocar la página, el formulario o las acciones, lee en node_modules/next/dist/docs/ las guías de acciones del servidor, formularios y componentes de cliente. Es Next 16.4.3 y React 19.3.
- Verificación final, en este orden, todo en verde: npx next typegen; npx tsc --noEmit; npx eslint .; npx vitest run tests/unit/reporte-config.test.ts tests/unit/precargas.test.ts tests/unit/z5b-arreglos.test.ts
- Commit: git add <archivo> uno por uno, solo los de tu lista. Mensaje: "feat: pantalla Reporte en Administración".
- PROHIBIDO: npm install o npm ci; package.json o package-lock.json; git add -A o git add .; git stash; git push; PR; main; producción; base de datos (ni leer); supabase/; src/lib/tipos.ts; navegador; .env*; scripts/salida/; contraseñas; entrar como otra persona; subagentes.
- PARA y pregunta si: necesitas un archivo fuera de la lista; un test falla 2 veces seguidas por la misma causa; algo choca con la decisión; falta un dato.
- No inventes. Lo no comprobado, «sin verificar».

## Qué devuelves
1) hash; 2) git diff --stat <BASE>..HEAD; 3) salida del test fallando y pasando, y de cada comando con números; 4) qué no pudiste probar; 5) dudas.
```

### Prompt C-3

```
## Objetivo
Quitar la sección Reportes (el reporte manual de fin de día): SOLO la pantalla y el botón del menú. Los reportes ya rellenados se quedan en la base (tabla reportes): no se toca la base.

## Contexto (copiado de docs/PENDIENTES-JOSE.md, Fase C, y comprobado)
- Decisión de Cristian: «Se quita la sección Reportes (pantalla y botón). Los reportes ya rellenados se quedan en la base».
- Decisión de Jose (D3 = no): el permiso «Reportes», la pestaña «Reportes» de Administración (preguntas), src/app/(panel)/admin/preguntas-reporte.tsx, guardarPreguntasReporte de admin/acciones.ts y src/lib/reportes.ts SE QUEDAN. No los toques.
- Pantalla: src/app/(panel)/reportes/page.tsx, formulario.tsx y acciones.ts → borrar.
- Botón: src/app/(panel)/layout.tsx:74 → quitar la entrada de /reportes.
- Inicio: src/lib/permisos.ts:63-75. rutaInicio manda a la primera sección permitida (orden de SECCIONES_TODAS) cuando la de su rol no está; RUTA.reportes = "/reportes" (:67) dejará de existir. Cambia rutaInicio para que nunca elija "reportes" (sáltala al buscar la primera). No cambies nada más de permisos.ts.
- Textos: src/app/onboarding/page.tsx:14-15 («Tu reporte de fin de día», en caller y closer) → quitar ese punto; :16 («Las agendas, ventas y reportes del equipo», director) → «Las agendas y ventas del equipo»; src/app/(panel)/admin/cliente.tsx:50 → cambiar solo el texto de ayuda («Cuando alguien envía su reporte…») por «La app manda aquí los avisos del equipo y el workflow de GHL envía el email y el WhatsApp al director y al CEO.».
- NO es lo mismo y se queda: el «reporte de ayer» del CEO al entrar (avisos-acciones.ts, ventana-entrada.tsx, mensajes-entrada.ts), el PDF «Generar reporte» de KPIs (closer/reporte/route.ts), el email de las 8:00, src/lib/mcp/equipo.ts:81, src/lib/tipos.ts.

## Archivos (lista cerrada; no toques nada más)
Borrar: src/app/(panel)/reportes/page.tsx, src/app/(panel)/reportes/formulario.tsx, src/app/(panel)/reportes/acciones.ts.
Modificar: src/app/(panel)/layout.tsx, src/lib/permisos.ts (solo rutaInicio), src/app/onboarding/page.tsx, src/app/(panel)/admin/cliente.tsx (solo :50).
Crear: tests/unit/c3-sin-reportes.test.ts.
Tests que puedes borrar o adaptar, SOLO en la parte que usa la pantalla borrada (lo demás de cada archivo se queda): tests/unit/f1c-sin-no-responde.test.ts, plantilla-email.test.ts, z5d-numeros-reportes.test.ts, z5e-reportes-hoy.test.ts, z8d-reportes.test.ts, bloque7.test.ts, csv-prioridad-reportes.test.ts; tests/integracion/arreglos-auditoria.test.ts, bloque7.test.ts, emails-resend.test.ts, permisos.test.ts, reportes-avisos.test.ts. Solo si fallan por tu cambio: tests/unit/ola-velocidad.test.ts, tests/integracion/seguridad.test.ts.

## Test primero
1. tests/unit/c3-sin-reportes.test.ts con: no existe src/app/(panel)/reportes/page.tsx; layout.tsx no contiene "/reportes"; rutaInicio de un caller que solo tiene permitidas "reportes" y "manuales" devuelve "/manuales"; src/lib/reportes.ts sigue existiendo; onboarding/page.tsx no contiene «reporte de fin de día».
2. Ejecútalo → FALLA. 3. Implementa. 4. Ejecútalo → PASA.
5. Antes de borrar un test entero, comprueba que TODO lo que prueba es la pantalla borrada; si mezcla, borra solo esos casos (lo de lib/reportes se queda). En tu informe, lista cada test borrado o cambiado y por qué.

## Reglas comunes (obligatorias)
- Trabajas solo en la copia <COPIA>, rama fase-c-c3.
- Antes de tocar el layout o la página de onboarding, lee en node_modules/next/dist/docs/ la guía de layouts. Es Next 16.4.3 y React 19.3.
- Verificación final, en este orden, todo en verde: npx next typegen; npx tsc --noEmit; npx eslint .; npx vitest run tests/unit (entera: borras pantalla y tests). Los tests de integración necesitan Supabase local: NO los ejecutes; dilo en tu informe.
- Commit: git add o git rm <archivo> uno por uno, solo los de tu lista. Mensaje: "feat: se quita la pantalla Reportes (los reportes guardados se quedan)".
- PROHIBIDO: npm install o npm ci; package.json o package-lock.json; git add -A o git add .; git stash; git push; PR; main; producción; base de datos (ni leer); supabase/; src/lib/tipos.ts; navegador; .env*; scripts/salida/; contraseñas; entrar como otra persona; subagentes.
- PARA y pregunta si: necesitas un archivo fuera de la lista; un test falla 2 veces seguidas por la misma causa; algo de lo que «se queda» depende de lo que borras; falta un dato.
- No inventes. Lo no comprobado, «sin verificar».

## Qué devuelves
1) hash; 2) git diff --stat <BASE>..HEAD; 3) salida del test fallando y pasando, y de cada comando con números; 4) lista de tests borrados o cambiados con el porqué; 5) qué no pudiste probar; 6) dudas.
```

### Prompt C-4

```
## Objetivo
Mandar cada día, una sola vez, el reporte España a su hora de Madrid y el USA a su hora de Nueva York, por email. El cron de Supabase llama cada 15 minutos a una ruta nueva.

## Contexto (copiado de docs/PENDIENTES-JOSE.md, Fase C, y comprobado)
- Patrón a copiar: el email de las 8:00. src/lib/avisos-diario.ts:13-41 (enviarDiario: mira la hora local, reserva la fecha con upsert ignoreDuplicates en avisos_diario, manda, y si falla borra la reserva para que el siguiente intento reintente) y src/app/api/avisos/diario/[proyectoId]/route.ts (POST, id con /^[0-9a-f-]{36}$/i, clave x-eternity-secreto comparada con igual() contra proyectos.webhook_secreto, límite dentroDelLimite en los fallos, maxDuration = 60).
- La base YA tiene (migración del orquestador): reporte_envios (proyecto_id, mercado, fecha date; clave las 3) y el cron cada 15 min a https://dashboard.eternity.llc/api/avisos/reporte/<proyectoId>.
- La puerta: src/proxy.ts:15 deja pasar sin sesión solo /api/ghl/leer/, /api/avisos/diario/ y /api/mcp. Añade "/api/avisos/reporte/" con startsWith. tests/unit/z5a-puerta.test.ts:45 tiene la lista de rutas públicas: añade "/api/avisos/reporte/x".
- Ya existen en tu rama (de otros agentes): de src/lib/reporte-diario-datos.ts, datosReporte(proyecto: Proyecto, mercado: MercadoReporte, ahora: Date): Promise<DatosReporte>; de src/lib/reporte-diario.ts, textoReporte(d: DatosReporte, partes: ParteReporte[]): { asunto; texto; html }; de src/lib/reporte-config.ts, leerConfigsReporte(proyectoId): Promise<Record<MercadoReporte, ConfigReporte>> y ZONA_REPORTE. Email: enviarEmail({ para, asunto, texto, html }) de src/lib/email.ts:10 → { enviado, motivo }.
- La fecha del reporte es la del día en la zona del reporte (Madrid para "es", Nueva York para "latam").
- Se manda si el reporte está activo y la hora local (HH:MM) es igual o mayor que la configurada; la reserva evita el segundo envío del día.
- WhatsApp: NO se manda (Fase D). Los números solo están guardados.

## Interfaces que debes producir
- src/lib/reporte-envio.ts ("server-only"): export async function enviarReporte(proyectoId: string, mercado: MercadoReporte, ahora = new Date()): Promise<{ estado: "apagado" | "fuera_de_hora" | "ya_enviado" | "enviado" } | { estado: "fallo"; motivo: string }>
- src/app/api/avisos/reporte/[proyectoId]/route.ts: POST que, tras la clave, llama a enviarReporte para "es" y para "latam" (uno no bloquea al otro) y responde { ok, es: estado, latam: estado }; 500 si alguno es "fallo" (con console.error del motivo, como la ruta del email de las 8:00).

## Archivos (lista cerrada; no toques nada más)
src/lib/reporte-envio.ts (crear); src/app/api/avisos/reporte/[proyectoId]/route.ts (crear); tests/unit/reporte-envio.test.ts (crear); src/proxy.ts (solo la línea 15); tests/unit/z5a-puerta.test.ts.

## Test primero
1. tests/unit/reporte-envio.test.ts con db, email y datos simulados: "es" a las 20:59 de Madrid (2026-11-17T19:59:00Z) → fuera_de_hora; a las 21:00 (2026-11-17T20:00:00Z) → enviado y el email va a los emails de la config; segunda llamada → ya_enviado (la reserva no inserta); activo false → apagado; "latam" con 2026-11-18T02:00:00Z reserva la fecha "2026-11-17"; enviarEmail con enviado false → fallo y borra la reserva; la ruta sin cabecera x-eternity-secreto → 401.
2. Ejecútalo → FALLA. 3. Implementa. 4. Ejecútalo → PASA.

## Reglas comunes (obligatorias)
- Trabajas solo en la copia <COPIA>, rama fase-c-c4.
- Antes de escribir la ruta y tocar proxy.ts, lee en node_modules/next/dist/docs/ las guías de route handlers (RouteContext) y de proxy. Es Next 16.4.3 y React 19.3.
- Verificación final, en este orden, todo en verde: npx next typegen; npx tsc --noEmit; npx eslint .; npx vitest run tests/unit/reporte-envio.test.ts tests/unit/z5a-puerta.test.ts tests/unit/avisos-diario.test.ts
- Commit: git add <archivo> uno por uno, solo los de tu lista. Mensaje: "feat: envío diario del reporte España y USA a su hora".
- PROHIBIDO: npm install o npm ci; package.json o package-lock.json; git add -A o git add .; git stash; git push; PR; main; producción; base de datos (ni leer); supabase/; src/lib/tipos.ts; navegador; .env*; scripts/salida/; contraseñas; entrar como otra persona; subagentes; mandar emails de verdad.
- PARA y pregunta si: necesitas un archivo fuera de la lista; un test falla 2 veces seguidas por la misma causa; las interfaces de arriba no existen o no coinciden; falta un dato.
- No inventes. Lo no comprobado, «sin verificar».

## Qué devuelves
1) hash; 2) git diff --stat <BASE>..HEAD; 3) salida del test fallando y pasando, y de cada comando con números; 4) qué no pudiste probar; 5) dudas.
```

### Prompt R · revisor de solo lectura (uno por fase)

```
## Objetivo
Revisar, SIN cambiar nada, el diff completo de la fase <FASE> contra lo que pide docs/PENDIENTES-JOSE.md y docs/PLAN-EJECUCION.md. Decir lo que está mal o falta, con archivo:línea y prueba.

## Contexto
- Rama: <RAMA>, en C:\Users\Usuario\Desktop\VENTAS. Diff: git diff origin/main...<RAMA>.
- Qué pide la fase: docs/PENDIENTES-JOSE.md, sección <SECCIÓN>; reglas y decisiones de Cristian en las secciones 1 y 2; tareas, interfaces y listas de archivos en docs/PLAN-EJECUCION.md, sección <SECCIÓN DEL PLAN>; decisiones de Jose de la sección 11 (D1-D8).
- Decisiones de Cristian cerradas: no las discutas; solo di si el código las cumple.

## Qué miras, en este orden
1. ¿Cada tarea hace lo que pide su decisión? Caso por caso.
2. ¿Hay archivos cambiados que no están en ninguna lista? (git diff --stat).
3. Fallos: permisos (quién puede llamar a cada acción o ruta), errores tragados, fechas y zonas horarias, valores internos cambiados por error ("latam"), textos visibles.
4. Tests: ¿prueban el comportamiento o solo el texto? ¿Falta el caso de la sección 3 del plan?
5. Migraciones: ¿solo añaden? ¿número correcto? ¿se pueden aplicar dos veces sin romper?

## Reglas
- Solo lectura: Read, Grep, Glob y git diff/log/show. PROHIBIDO editar, crear archivos, git add/commit/push, npm, base de datos, producción, navegador, subagentes.
- No inventes. Cada hallazgo con archivo:línea y la línea copiada. Lo no comprobado, «sin verificar».

## Qué devuelves
Lista ordenada de más grave a menos: [GRAVE | MEDIO | MENOR] archivo:línea — qué pasa — por qué (prueba) — arreglo propuesto en una frase. Al final: lo que revisaste y no encontraste mal, en 3 líneas.
```
