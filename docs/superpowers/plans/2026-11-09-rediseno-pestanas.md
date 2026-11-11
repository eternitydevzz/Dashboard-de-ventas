# Rediseño de 4 pestañas · Plan

> Actualizado el 11 nov 2026. **Estado: hecho y en producción.** Queda lo de «Lo que falta», abajo. La versión anterior del plan, con los pasos de cada tarea, está en el historial de git (commit `57561b6`).

**Objetivo:** que Entradas, Workflows, Etiquetas y UTMs (Administración) y UTMs (KPIs) se vean como KPIs → Leads, con números grandes, círculos, barras y gráficos, en vez de listas de texto.

## Lo que falta

Nada de esto lo pidió Cristian como obligatorio. Son pruebas que no se hicieron en la app real y una medición.

1. **Probar «Eliminar» un workflow en la app.** Los 4 tests de `borrarWorkflow` pasan, pero no se pulsó en producción para no borrar nada de Maestria. Cómo: en el proyecto **Test**, crear un workflow de cita, pulsar la × y comprobar:
   - salen las 2 ventanas de la app, en rojo;
   - Cancelar en cualquiera de las dos no borra nada;
   - aceptando las dos, desaparece de la lista.
2. **Probar «Conectar una landing»** (ahora en una ventana) en **Test**: se crea, aparece su tarjeta y la ventana se puede cerrar. Después borrar esa Entrada de prueba.
3. **Mirar el móvil (375 px, en una pestaña aparte) y el modo oscuro** de las 4 pestañas en la app. La maqueta sí se comprobó así; el código no.
4. **Medir cuánto tarda KPIs → UTMs en Maestria «Todo».** Ahora también lee las marcas del embudo de `cargarLeadsKpis` (1 minuto en memoria). El plan decía medir antes y después y no se hizo; el «antes» ya no se puede medir. Si tarda mucho, avisar a Cristian.

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
