# Rediseño de 4 pestañas · Plan

> Actualizado el 11 nov 2026. **Estado: hecho, en producción y probado.** Quedan 2 fallos pequeños, apuntados en «Lo que falta». La versión anterior del plan, con los pasos de cada tarea, está en el historial de git (commit `57561b6`).

**Objetivo:** que Entradas, Workflows, Etiquetas y UTMs (Administración) y UTMs (KPIs) se vean como KPIs → Leads, con números grandes, círculos, barras y gráficos, en vez de listas de texto.

## Lo que falta

Los 2 fallos que encontraron las pruebas del 11 nov. Cristian: «Apúntalos para después».

1. **KPIs → UTMs en el móvil tiene scroll lateral.** El contenido mide 487 px en una pantalla de 406: los nombres largos de las campañas en el círculo «Por campaña» empujan la tarjeta. Arreglo propuesto: `min-w-0` en las tarjetas de la rejilla de círculos (`src/app/(panel)/kpis/utms.tsx`; mirar también `admin/etiquetas-utms.tsx`, que tiene la misma rejilla). Cómo se comprueba: pestaña aparte a 375 px, sin scroll lateral.
2. **Las etiquetas del pico se montan.** Los 2 días enormes (1408 y 807) son seguidos y sus etiquetas quedan una encima de la otra: se lee «1 807↑». Arreglo propuesto: si 2 etiquetas quedan a menos de su ancho, la segunda va más arriba (en `LineaDias`, `utms.tsx`). Cómo se comprueba: en Maestria «Todo» se leen «1408↑» y «807↑».

Mejora vista (no es un fallo): al crear una Entrada, la ventana «Conectar una landing» se queda abierta con «Entrada creada…» y hay que cerrarla para ver la tarjeta. Se podría cerrar sola.

## Pruebas hechas el 11 nov (todo bien, salvo lo de arriba)

- **Eliminar un workflow:** probado en el proyecto **Test**, en el navegador de Claude con la cuenta de CEO.
  - Salen las 2 ventanas de la app, las 2 en rojo («¿Eliminar «Cita agendada»?» y «¿Eliminar para siempre?»).
  - Cancelar en la segunda no borra nada.
  - Aceptando las dos sale «Workflow eliminado» y Test vuelve a «Todavía no hay workflows».
- **«Conectar una landing»:** también en **Test**.
  - La ventana se abre con las 5 preguntas y crea la Entrada; aparece su tarjeta y el resumen pasa a 1 / 1.
  - Después se borró con su × (ventana de la app) y Test volvió a 0 / 0.
- **Proyecto casi vacío (Test):** las 4 pestañas lo dicen bien: «Todavía no hay ninguna landing», «Sin datos.», «Ningún lead de estas fechas tiene campaña».
- **Modo oscuro:** las 4 pestañas se ven bien. **Móvil:** bien, salvo el fallo 1.
- **Velocidad de KPIs → UTMs en Maestria «Todo»:** 3,4 s, 2,5 s y 2,7 s. La pestaña Leads tarda 2,7 s y 2,5 s: lo mismo.

## Lo que se hizo (comprobado en dashboard.eternity.llc con Playwright)

| PR | Qué |
|---|---|
| [#127](https://github.com/eternitydevzz/Dashboard-de-ventas/pull/127) | Las 4 pestañas con la maqueta v1. Tests nuevos: `entradas-por-dia`, `borrar-workflow` y `utms-graficos` |
| [#129](https://github.com/eternitydevzz/Dashboard-de-ventas/pull/129) | Arreglos vistos en producción: el pico de UTMs no se cortaba (eran 2 días, 1408 y 807); el círculo de etiquetas sumaba etiquetas como si fueran leads (14.959); «97.7 %» pasa a «97,7 %»; «Lo manda su workflow» salía repetido |
| [#130](https://github.com/eternitydevzz/Dashboard-de-ventas/pull/130) | Las 2 últimas fechas del gráfico se montaban («09/1110/11») |

- **Entradas:**
  - 4 números arriba: envíos hoy, Entradas activas, envíos con error y workflows en prueba.
  - Tarjetas en 2 columnas, con el número grande de leads y un gráfico de envíos por día (14 días, en la hora del proyecto).
  - «Conectar una landing» se abre en una ventana.
- **Workflows:**
  - 5 números arriba.
  - Cada tarjeta lleva los pasos en iconos, una **llave** que abre el editor y una **×** para eliminar.
- **Etiquetas y UTMs:** aviso de los leads sin canal, círculos por canal y por etiqueta, ranking de canales, y cada fila de las listas para editar con sus leads.
- **KPIs → UTMs:**
  - 5 números arriba.
  - Círculos sin «Sin dato».
  - Leads por día con el pico cortado y marcado.
  - Embudo de 6 pasos por utm_source.
  - Ranking de campañas.
  - Debajo siguen los filtros, el generador de enlaces y la tabla.
- Maquetas guardadas en el repo:
  - `docs/maqueta-rediseno-v1.html`: la elegida.
  - `docs/maqueta-rediseno-v2.html`: dos propuestas que no se eligieron, guardadas por si sirven ideas como el diagrama fuente → campaña → cita.

## Decisiones de Cristian (no se reabren)

- 9 nov:
  - Referencia visual: KPIs → Leads.
  - Entradas y Workflows: «Resumen arriba + tarjetas».
  - Tracking: leads por día, embudo por UTM y ranking de campañas («otra cosa»: «Nada más, sigue»).
- 9 nov: todo en un solo PR («si no, no termino nunca»).
- 11 nov:
  - Maqueta: «La v1 me gustó más», con «una x para eliminar» y «un símbolo de herramienta para editar» en Workflows.
- 11 nov · eliminar un workflow:
  - «Preguntar 2 veces».
  - Con la ventana de la app, nunca la del navegador («pon un estilo que tenga sentido»).
  - Los leads en espera: «Sí, se cancelan».
- 11 nov · gráficos:
  - «Sin dato» y «Sin canal» aparte, y embudo por utm_source y no por canal: «Sí, las dos».
  - El pico: «Cortar y marcarlo».
  - Aprobó empezar el código («Sí, empieza»).
- 11 nov: capturas después de fusionar, en producción («PR, fusionar y capturas»).

## Decisiones que tomó Claude (para que Cristian las sepa)

- **Un workflow en real con Entrada no se puede eliminar:** pide antes «Volver a lo de hoy». Si no, la Entrada se quedaría sin mandar a GHL, porque «Qué hacer en GHL» está apagado mientras manda el workflow. Si se equivoca, cuesta un clic más.
- **El corte del pico:** se corta si hay de 1 a 3 días con más del triple que el siguiente, un 15 % por encima del primer día normal (`corteGrafico` en `src/lib/utms.ts`).
- **El círculo de etiquetas** pone en el centro cuántas etiquetas hay, no la suma, porque un lead tiene varias.
- **El gráfico pequeño de cada Entrada** cuenta **envíos**, no leads: una persona puede mandar varios.
- **Los días se cuentan en la hora del proyecto:** Maestria y Test van en hora de Nueva York (`proyectos.zona_horaria`).

## Reglas que siguen valiendo para tocar estas pantallas

- No se quita ninguna función: solo cambia cómo se ve.
- **El repo es público:** en maquetas o docs nunca van nombres de leads, emails, teléfonos ni direcciones de Entradas.
- Colores solo con los tokens de `src/app/globals.css`, en claro y en oscuro.
- Confirmaciones siempre con `confirmar` de `src/components/dialogos.tsx`.
- Revisar con Playwright en la app publicada después de fusionar, trayendo la pestaña al frente. Para el móvil, una pestaña aparte.
- Fusionar solo en verde: `gh pr checks N > f && gh pr merge N --merge`.
- Los tests de integración necesitan Docker; corren en GitHub con cada PR. En el Mac, `npx next typegen && npx tsc --noEmit && npx eslint . && npx vitest run tests/unit`.
