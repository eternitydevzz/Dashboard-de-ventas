# Rediseño de 4 pestañas · Plan

> Actualizado el 11 nov 2026. **Estado: terminado.** Hecho, en producción y probado; no queda nada pendiente. La versión anterior del plan, con los pasos de cada tarea, está en el historial de git (commit `57561b6`).

**Objetivo:** que Entradas, Workflows, Etiquetas y UTMs (Administración) y UTMs (KPIs) se vean como KPIs → Leads, con números grandes, círculos, barras y gráficos, en vez de listas de texto.

## Lo que falta

**Nada.** Los 2 fallos y la mejora que salieron de las pruebas están arreglados en el PR [#139](https://github.com/eternitydevzz/Dashboard-de-ventas/pull/139) y comprobados en producción el 11 nov:
- **Móvil:** KPIs → UTMs y Etiquetas y UTMs ya no tienen scroll lateral (406 = 406).
- **Etiquetas del pico:** los 2 días seguidos comparten etiqueta, «1408↑ · 807↑» (`etiquetasPico` en `src/lib/utms.ts`, con test).
- **«Conectar una landing»:** la ventana se cierra sola al crear y el «Entrada creada…» sale como aviso. Probado en Test; la Entrada de prueba se borró.

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
| [#139](https://github.com/eternitydevzz/Dashboard-de-ventas/pull/139) | Scroll lateral en el móvil, etiquetas del pico montadas y la ventana de «Conectar una landing» se cierra sola |

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
