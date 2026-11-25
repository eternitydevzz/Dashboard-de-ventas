# Calendario propio para cada closer · diseño

> 25 nov 2026. Aprobado por Jose en el chat (opción B). Proyecto: **Maestria**.

## Para qué
**Personas (Jose, 25 nov):** Yara, Aitzi, Facu (Facu Cepeda), Paula (Paula Gamba), Cris (Cristian, CEO) y Jose (CEO).
Stefy, Alba y Valentina se quedan fuera. Las 4 primeras son callers; Cristian y Jose son CEO (ver Tarea 2b).

Hoy llaman en frío y mandan al lead el enlace de
`codigomaestria.com/agenda`. El lead responde las preguntas y reserva en «0. Calendar Principal»
(`X7qpsbS2ChORZkwO4O3f`). El dashboard le pasa esa cita a Facu o a la rotación (regla de Cristian del 11 nov,
`src/lib/ghl-sync.ts:244-260`). Queremos que **cada una se agende la llamada a sí misma**: el lead reserva en el
calendario de ella, la cita es suya como closer y la agenda cuenta para ella (hace de caller y closer a la vez).

## Objetivos
- Un enlace por persona: `codigomaestria.com/agenda?closer=yara` (más los `utm_*` de siempre).
- La cita entra en el calendario de GHL de esa persona y en el dashboard queda con ella como closer y como «agendó».
- Siguen funcionando: los emails y SMS de GHL al lead, los workflows del dashboard, los WhatsApp del equipo, el paso
  a «Agendados» y la Entrada de la landing.

## Lo que no se hace
- No se duplica la landing ni la Entrada (una sola para todas).
- No cambia nada para el resto: el enlace sin `closer` y el Calendar Principal siguen como hoy, con el reparto.
- No se mueve la agenda de GHL a Vercel (el dominio sigue igual).

## Sería un fracaso si…
- Un lead se queda sin calendario (enlace mal escrito) → siempre sale el general.
- El dashboard le quita la cita a la closer y se la da a otro.
- El lead deja de recibir sus emails o SMS de GHL.
- El Calendar Principal empieza a tratarse como calendario personal de alguien.

## Opciones que se miraron
| | Qué es | Por qué no / por qué sí |
|---|---|---|
| A | Duplicar landing + calendario + Entrada por closer | 6 copias de todo; cambiar una pregunta = 6 cambios. Descartada |
| **B** | **Una landing; un calendario por closer; el enlace dice cuál** | **Elegida (Jose).** Se duplica solo el calendario; lo de hoy no cambia |
| C | Un calendario de equipo en GHL y que el enlace fuerce al closer | No se sabe si el widget de GHL lo permite. Descartada |

## Cómo funciona
```
Enlace ?closer=yara → landing busca el calendario de Yara → preguntas → Entrada del dashboard (como hoy)
→ iframe con el calendario de Yara → el lead reserva → GHL manda sus emails/SMS
→ lectura de cada 60 s: cita con Yara como closer y como «agendó» → avisos y workflows del dashboard
```

### 1 · GHL (configuración; lo hace Claude con Playwright)
- Copiar «0. Calendar Principal» una vez por persona (Facu: se mira antes si su calendario actual sirve) («0. Calendar Yara», …), cada copia con **solo** esa persona como usuario.
  Mismo formulario, duración, avisos y redirección a la thank-you que el original.
- Workflows de GHL cuyo disparador filtra por «0. Calendar Principal»: añadir los calendarios nuevos. Se apunta
  antes la lista de workflows tocados y cómo estaban.

### 2 · Dashboard (configuración; Claude con Playwright en dashboard.eternity.llc)
- Ficha de cada una: marcar «También closer»; poner su usuario de GHL y su calendario nuevo.
  Comprobado: con «También closer», % 0 y sin país, **no** les entran citas del reparto (`src/lib/rotacion.ts:11-13,32-35`).
- Administración → Integraciones GHL: añadir los calendarios nuevos a los que se leen (si no, el dashboard no ve sus citas,
  `src/lib/ghl-sync.ts:61-67`).

### 3 · Dashboard (código, con tests)
En la lectura de citas (`src/lib/ghl-sync.ts`), una cita cuyo calendario es el **calendario personal** de una persona:
- se queda con esa persona como closer (no pasa por el reparto por país ni por la rotación);
- «agendó» = esa persona (aunque el lead no tenga caller o tenga otro).

**Calendario personal** = el `ghl_calendar_id` de la ficha de **un único** miembro activo que es closer o «También
closer». Si dos fichas tienen el mismo calendario (p. ej. el Principal), no es personal de nadie y todo sigue como hoy.

### 4 · Landing (código del elemento CODE de GHL en `codigomaestria.com/agenda`)
- Leer `closer` de la dirección (minúsculas, sin espacios). Tabla `{ yara: '<id>', stefy: '<id>', … }`.
- Al enseñar el calendario, usar el id de esa persona en `bookingUrl` y `calendarId`. Si no está en la tabla o no
  viene, el general (`X7qpsbS2ChORZkwO4O3f`).
- Se manda también `closer` a la Entrada (dato informativo; el dashboard decide por el calendario).
- Base: el código en vivo de la página (no hay copia local al día ni repo). Se guarda una copia del código de antes.

## Orden y pruebas
1. Código del dashboard (punto 3) con tests: test primero; casos: calendario personal → closer y «agendó» suyos;
   Principal → reparto como hoy; calendario repetido en dos fichas → como hoy.
2. **Pasada completa solo con Yara**: su calendario en GHL, su ficha, la lectura, y una copia de la página
   (`/agenda-prueba`) con el código nuevo. Un lead de prueba reserva con `?closer=yara`. Se comprueba: cita en el
   calendario de Yara en GHL; en el dashboard con Yara de closer y «agendó»; email/SMS de GHL; WhatsApp; sin `closer`
   sale el general. Se borra la cita de prueba. **Jose lo ve antes de seguir.**
3. Las otras 4 y el cambio en la página real `/agenda`.
4. Enlaces finales para cada una.

## Queda para quien lo construya
- Nombres exactos de los calendarios copiados y del paso de prueba en GHL.
- Cómo pegar el código en el elemento CODE (lo que permita el editor de GHL).

## Riesgos sin verificar
- Si al copiar un calendario GHL copia sus avisos y su redirección (se comprueba en la pasada con Yara).
- Qué workflows de GHL filtran por el Calendar Principal (se mira en GHL antes de tocar).
- Si las 6 tienen usuario de GHL (se mira en su ficha y en GHL).
- Con ella como caller y closer, los avisos de WhatsApp «al closer» y «al caller» pueden llegarle dos veces.
- KPIs: la pregunta abierta de Cristian sobre Facu (`docs/PENDIENTES-JOSE.md:138`) vale también para ellas.

---

# Plan de implementación

> Lo ejecuta Claude en esta sesión, tarea a tarea, sin agentes (regla de Jose). Casillas `- [ ]` para seguir el avance.

**Objetivo:** que la cita reservada en el calendario personal de una closer quede con ella como closer y «agendó», y
que el enlace `?closer=` enseñe ese calendario.
**Arquitectura:** una función pura nueva decide de quién es un calendario; la lectura de GHL la usa antes del reparto.
El resto es configuración en GHL y en el dashboard (Playwright) y un cambio en el elemento CODE de la agenda.
**Tecnología:** Next.js + Supabase + Vitest (dashboard); HTML/JS pegado en GHL (agenda); Playwright MCP.

## Reglas para todas las tareas
- Nada cambia si el enlace no lleva `closer` o si la cita es del Calendar Principal (`X7qpsbS2ChORZkwO4O3f`).
- Test primero en el código del dashboard. `npx vitest run tests/unit` y `npx tsc --noEmit` en verde antes de cada commit.
- Antes de cambiar algo en GHL: apuntar cómo estaba (captura o texto) para poder volver atrás.
- Datos de prueba: un lead inventado de Jose; se borra la cita de prueba al acabar.

## Lo que puede fallar y no cubre ninguna otra prueba (cada uno con su test en la tarea que toca)
1. `?closer=Yara ` (mayúsculas o espacios) → tiene que salir el calendario de Yara (Tarea 4).
2. `?closer=pepe` (no existe) o sin `closer` → el Calendar Principal (Tarea 4).
3. El lead ya tenía una cita abierta con otro closer y reserva en el calendario de Yara → una sola cita, con Yara (Tarea 2).
4. GHL vuelve a mandar la misma cita en la lectura siguiente → sigue con Yara, no pasa al reparto (Tarea 2).
5. Una closer dada de baja con calendario puesto → su calendario deja de ser personal (Tarea 1).

---

### Tarea 1 · Quién es la dueña de un calendario
**Archivos:** crear `src/lib/calendario-personal.ts`; test `tests/unit/calendario-personal.test.ts`.
**Produce:** `duenaDeCalendario(miembros: MiembroCalendario[], calendarioId: string | null): string | null` y
`type MiembroCalendario = { perfil_id: string; ghl_calendar_id: string | null; perfiles: { rol: string; activo: boolean; tambien_closer: boolean } }`.

- [ ] Test (falla): `duenaDeCalendario` devuelve
  - `"yara"` con `[{yara, cal-yara, caller, activo, tambien_closer}]` y `"cal-yara"`;
  - `null` si dos miembros tienen `"cal-x"`; `null` si la única que lo tiene está `activo: false`;
  - `null` si es una caller **sin** «También closer»; `null` con `calendarioId` `null` o `""`;
  - compara sin espacios: `" cal-yara "` en la ficha cuenta como `"cal-yara"`.
- [ ] Implementar (sin base de datos; cuenta los miembros que son closer o «También closer», activos, con ese id).
- [ ] Test en verde. Commit `feat: función que dice de qué closer es un calendario de GHL`.

### Tarea 2 · La lectura de GHL respeta el calendario personal
**Archivos:** `src/lib/ghl-sync.ts` (select de `miembros_proyecto` en la línea 55; cita existente, línea 183; reparto,
líneas 248-260; inserción, línea 265); test nuevo `tests/unit/ghl-sync-calendario-personal.test.ts`, con la base en
memoria de `tests/unit/ghl-sync-agenda-unica.test.ts` copiada y `closerDeLaRotacion` simulada para devolver `"facu"`.
**Consume:** `duenaDeCalendario` (Tarea 1).

- [ ] Tests (fallan). Proyecto con `ghl_calendarios: ["cal-principal", "cal-yara"]`; miembros Yara (caller, «También
  closer», `ghl_calendar_id: "cal-yara"`, `ghl_user_id: "u-yara"`) y Facu (closer, `ghl_calendar_id: "cal-facu"`):
  - cita nueva y futura en `cal-yara` → `closer_id: "yara"`, `agendada_por: "yara"`, y `cambiarUsuarioCitaGhl` **no** se llama;
  - lo mismo aunque el lead tenga `caller_id: "caller-ana"` y el canal sea `callers` → `agendada_por: "yara"`;
  - cita nueva en `cal-principal` → `closer_id: "facu"` (el reparto, como hoy);
  - (riesgo 3) el lead tiene una cita abierta con Facu y reserva en `cal-yara` → 1 sola cita, `closer_id: "yara"`;
  - (riesgo 4) segunda lectura con la misma cita y `assignedUserId` de otro → sigue `closer_id: "yara"`.
- [ ] Implementar: añadir `activo` al select de `perfiles`; `const duena = duenaDeCalendario(miembros, calendarioId)`
  tras la línea 156; reparto solo si `!duena`; `closerFinal = duena ?? …`; `agendada_por: duena ?? agenda.agendada_por`;
  en la cita existente, `closer = duena ?? closerId ?? existe.closer_id`. Ojo: `duena` se calcula con **todos** los
  miembros (no con `closers`, que ya viene filtrado).
- [ ] `npx vitest run tests/unit` y `npx tsc --noEmit` en verde (los tests de GHL de siempre, sin tocarlos).
- [ ] Commit `feat: la cita del calendario personal de una closer se queda con ella`.

### Tarea 2b · «También closer» también para CEO (decisión de Jose, 25 nov)
**Archivos:** `src/app/(panel)/equipo/ficha-partes.tsx:99` (la casilla sale con `rol === "caller"`);
`src/app/(panel)/equipo/ficha-acciones.ts:106` (el servidor rechaza si no es caller); test en `tests/unit/`.
Comprobado: a un CEO no le cambia permisos (`permisos.ts:21`) ni pipelines (`pipelines.ts:21`); solo pasa a contar
como closer (`esCloser`, `tipos.ts:6`).
- [ ] Test (falla): `guardarTambienCloser` acepta un CEO y sigue rechazando closer y director; la ficha enseña la
  casilla para `caller` y `ceo`.
- [ ] Implementar: permitir `rol` `caller` o `ceo` en los dos sitios; mensaje «"También closer" es solo para callers y CEO.».
- [ ] Tests y `tsc` en verde. Commit `feat: un CEO también puede ser closer`.

### Tarea 3 · Publicar el dashboard
- [ ] Push de la rama, PR a `main`, checks en verde, fusionar (Vercel publica). Comprobar en Vercel que el despliegue
  de `main` está «Ready». Sin migración.

### Tarea 4 · Código nuevo de la agenda
**Archivos:** copia del código en vivo (lo de antes) y código nuevo, en la carpeta que diga Jose.
- [ ] Sacar el código del elemento CODE de `/agenda` (desde el editor de GHL con Playwright; si no se puede, de la
  página en vivo) y guardarlo tal cual.
- [ ] Cambio: `CLOSERS = { yara: '<id>' }` (de momento solo Yara); `closerDeUrl()` = `closer` de la dirección, en
  minúsculas y sin espacios; `bookingUrl`/`calendarId` = el de la tabla o el general; `closer` en lo que se manda a la Entrada.
- [ ] Prueba en el navegador (Playwright) sobre un HTML local: `?closer=yara`, `?closer=Yara%20`, `?closer=pepe` y sin
  `closer` → el iframe apunta al calendario que toca (riesgos 1 y 2).

### Tarea 5 · Yara de punta a punta (GHL + dashboard + página de prueba)
- [ ] GHL: leer «0. Calendar Principal» (usuarios, formulario, avisos, redirección). Copiarlo como «0. Calendar Yara»,
  con solo Yara. Apuntar su id.
- [ ] GHL: lista de workflows que arrancan con el Calendar Principal (nombre y disparador). Añadir «0. Calendar Yara».
- [ ] Dashboard: ficha de Yara → «También closer», su usuario de GHL y `ghl_calendar_id` = el de «0. Calendar Yara».
  Integraciones GHL → añadir el calendario a los que se leen.
- [ ] GHL: copiar el paso `/agenda` como `/agenda-prueba` y pegar el código nuevo (con el id real de Yara).
- [ ] Prueba real: lead de prueba entra por `/agenda-prueba?closer=yara&utm_source=callers`, responde y reserva.
  Comprobar: la cita en «0. Calendar Yara»; en el dashboard (Agendas → Llamadas) con Yara de closer y «agendó» antes
  de 2 min; el lead en «Agendados»; email o SMS de GHL al lead; WhatsApp al equipo. Y que `/agenda-prueba` sin
  `closer` enseña el general.
- [ ] Borrar la cita de prueba (en GHL y en el dashboard) con el OK de Jose. **PARAR: Jose lo ve antes de seguir.**

### Tarea 6 · Las otras 4 y la página real
- [ ] Repetir la Tarea 5 (sin la prueba completa) para Aitzi, Facu, Paula, Cristian y Jose: calendario, workflows,
  ficha e Integraciones. Facu ya tiene calendario propio en GHL: se mira si sirve antes de crear otro. Tabla `CLOSERS`
  con las 6 (`yara`, `aitzi`, `facu`, `paula`, `cris`, `jose`).
- [ ] Pegar el código nuevo en `/agenda` (la real). Comprobar sin `closer` (el general) y con cada `closer` (su
  calendario) en la página en vivo. Borrar `/agenda-prueba`.
- [ ] Entregar a Jose los 6 enlaces.

### Tarea 7 · Dejarlo escrito
- [ ] `docs/GUIA-GHL.md` sección 4 (Citas): los calendarios personales y la regla nueva; actualizar la lista de
  closers de la línea 25. `docs/PENDIENTES-JOSE.md`: fila en «Hecho». Commit y PR.
