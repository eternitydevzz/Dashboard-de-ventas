# Calendario propio para cada closer · diseño

> 25 nov 2026. Aprobado por Jose en el chat (opción B). Proyecto: **Maestria**.

## Para qué
Hoy Yara, Stefy (Estefanía Rodríguez), Alba, Valentina y Aitzi llaman en frío y mandan al lead el enlace de
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
| A | Duplicar landing + calendario + Entrada por closer | 5 copias de todo; cambiar una pregunta = 5 cambios. Descartada |
| **B** | **Una landing; un calendario por closer; el enlace dice cuál** | **Elegida (Jose).** Se duplica solo el calendario; lo de hoy no cambia |
| C | Un calendario de equipo en GHL y que el enlace fuerce al closer | No se sabe si el widget de GHL lo permite. Descartada |

## Cómo funciona
```
Enlace ?closer=yara → landing busca el calendario de Yara → preguntas → Entrada del dashboard (como hoy)
→ iframe con el calendario de Yara → el lead reserva → GHL manda sus emails/SMS
→ lectura de cada 60 s: cita con Yara como closer y como «agendó» → avisos y workflows del dashboard
```

### 1 · GHL (configuración; lo hace Claude con Playwright)
- Copiar «0. Calendar Principal» 5 veces («0. Calendar Yara», …), cada copia con **solo** esa persona como usuario.
  Mismo formulario, duración, avisos y redirección a la thank-you que el original.
- Workflows de GHL cuyo disparador filtra por «0. Calendar Principal»: añadir los 5 calendarios nuevos. Se apunta
  antes la lista de workflows tocados y cómo estaban.

### 2 · Dashboard (configuración; Claude con Playwright en dashboard.eternity.llc)
- Ficha de cada una: marcar «También closer»; poner su usuario de GHL y su calendario nuevo.
  Comprobado: con «También closer», % 0 y sin país, **no** les entran citas del reparto (`src/lib/rotacion.ts:11-13,32-35`).
- Administración → Integraciones GHL: añadir los 5 calendarios a los que se leen (si no, el dashboard no ve sus citas,
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
- Si las 5 tienen usuario de GHL (se mira en su ficha y en GHL).
- Con ella como caller y closer, los avisos de WhatsApp «al closer» y «al caller» pueden llegarle dos veces.
- KPIs: la pregunta abierta de Cristian sobre Facu (`docs/PENDIENTES-JOSE.md:138`) vale también para ellas.
