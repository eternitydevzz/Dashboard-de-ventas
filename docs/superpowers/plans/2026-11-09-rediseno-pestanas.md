# Rediseño de 4 pestañas · Plan de implementación

> **Para quien lo ejecute:** se hace en el chat principal, paso a paso, sin agentes (regla de Cristian). Sub-skill: superpowers:executing-plans. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que Entradas, Workflows, Etiquetas y UTMs (Administración) y UTMs (KPIs) se vean como KPIs → Leads: números grandes, círculos, barras y gráficos, en vez de listas de texto.

**Cómo:** primero una maqueta en un solo `.html` con datos reales de Maestria. Cristian la aprueba. Solo entonces se cambia el código de las 4 pestañas, todo en **un solo PR** (decisión de Cristian, 9 nov: «si no, no termino nunca»), reutilizando los componentes que ya usa KPIs → Leads.

**Tecnología:** Next.js 16 + Tailwind 4, componentes propios (`src/components`), tests con Vitest (`npm run test:unit`).

**De dónde sale:** lo que pidió Cristian el 9 nov 2026 (no hay spec aparte). Sus respuestas:
- Referencia visual: **KPIs → Leads** (los círculos de «De dónde vienen», el mapa y el embudo).
- Entradas y Workflows: **resumen arriba + tarjetas** (números grandes arriba; cada Entrada en una tarjeta compacta con un gráfico pequeño de leads por día; lo de configurar va dentro, plegado).
- «Tracking» en Etiquetas y UTMs: **leads por día, embudo por UTM y ranking de campañas**, y «otra cosa» que falta por aclarar (ver «Pendiente de decidir»).
- Archivos: rama nueva `diseno/rediseno-pestanas`, en la carpeta `VENTAS/wt-rediseno`; nada se sube hasta que Cristian lo apruebe.

## Reglas para todo el plan

- **Primero la maqueta y la aprobación de Cristian** (Tarea 2). No se toca código de la app antes.
- **No se quita ninguna función.** Crear, copiar dirección, cambiar ajustes, pasar a real, renombrar, unir, borrar, filtros y generador de enlaces: todo sigue. Cambia cómo se ve y dónde está, no lo que hace.
- **El repo es PÚBLICO** (`gh repo view` → `PUBLIC`). En la maqueta solo van totales y nombres de Entradas, workflows, canales y etiquetas. Nunca nombres de leads, emails, teléfonos ni direcciones de Entradas.
- **Colores solo con los tokens** de `src/app/globals.css` (regla 1 de `docs/manual-branding.md`), en claro y en oscuro.
- Textos en español de España.
- Revisar pantallas con Playwright, trayendo la pestaña al frente. Para mirar el móvil se abre una pestaña aparte; no se cambia el tamaño de la ventana de Cristian.
- Fusionar solo en verde: `gh pr checks N > f && gh pr merge N --merge`.
- Si aparece un fallo en producción o algo fuera del plan: parar y preguntar a Cristian.

## Lo que hay que vigilar (no lo cubre ningún test solo)

1. **Proyecto sin datos** (Test no tiene GHL ni Entradas): cada pestaña tiene que decir «Todavía no hay…», no salir rota ni con círculos vacíos. Se comprueba en las Tareas 3-6 con el proyecto Test.
2. **Muchos elementos** (más de 40 etiquetas o 7 Entradas): los círculos enseñan los 6 primeros y «Otros» (`AnilloPartes` ya lo hace con `max`). La lista completa sigue debajo.
3. **Móvil a 375 px:** sin scroll lateral. Se mira en una pestaña aparte.
4. **Modo oscuro** (es el que sale por defecto): se mira cada pestaña en los dos modos.
5. **Lentitud:** UTMs carga todos los leads (Maestria tiene 4640). Los gráficos nuevos se calculan con esos mismos datos, sin pedir más a la base, salvo el embudo (Tarea 6).

---

### Tarea 1: Datos reales para la maqueta

**Archivos:** crear `scratchpad/datos-maqueta.json` (fuera del repo; solo totales).

- [ ] Sacar de producción, proyecto Maestria, solo lectura:
  - Por Entrada: nombre, estado (recibiendo / apagada / en prueba / la manda su workflow), leads totales, leads por día de los últimos 14 días, envíos con error.
  - Por workflow: nombre, modo (prueba / real), pasos, leads, con error, esperando.
  - Por canal y por etiqueta: leads.
  - Para UTMs: leads por `utm_source`, `utm_campaign` y `utm_content`, leads por día (30 días) y el embudo de KPIs → Leads (Leads → Contactados → Agendados → Ventas) separado por canal.
- [ ] Comprobar: abrir el JSON y buscar `@`, `+34` y `entrada/`. No tiene que salir nada.

### Tarea 2: Maqueta `.html` (punto de parada: la aprueba Cristian)

**Archivos:** crear `docs/maqueta-rediseno.html`. Un solo archivo, sin librerías externas, con los datos de la Tarea 1 pegados dentro.

- [ ] Arriba, un selector con las 4 pestañas y un botón claro/oscuro. Copiar los tokens de `globals.css` y la clase `vidrio` del manual de branding.
- [ ] **Entradas:**
  - Arriba, 4 números grandes: leads de hoy, Entradas activas, envíos con error y workflows en prueba.
  - Debajo, una tarjeta por Entrada: nombre, una pastilla con su estado, leads totales, un gráfico pequeño de 14 días y «Copiar dirección».
  - «Ver últimos leads», «Cambiar ajustes» y «Para el programador» van plegados dentro de cada tarjeta.
  - «Conectar una landing nueva» pasa a un botón que abre una ventana.
- [ ] **Workflows:**
  - Arriba, números grandes: workflows, en real, en prueba, leads hoy y con error.
  - Una tarjeta por workflow: modo, pasos en miniatura (iconos) y un círculo de «coincide / no coincide» si está en prueba.
  - Al pulsar una tarjeta se abre el diagrama que hay hoy.
- [ ] **Etiquetas y UTMs (Administración):**
  - Arriba, círculos de leads por canal y por etiqueta (top 6 + «Otros») y barras con los canales.
  - Debajo, las mismas listas para editar canales y etiquetas que hay hoy, con mejor aspecto.
- [ ] **UTMs (KPIs):**
  - Números grandes arriba.
  - Círculos por `utm_source`, campaña y etiqueta, en lugar de las 3 tablas.
  - Gráfico de leads por día.
  - Embudo por canal: Leads → Contactados → Agendados → Ventas, con %.
  - Ranking de campañas con barras.
  - Debajo, la tabla de leads y el generador de enlaces.
- [ ] Comprobar con Playwright: capturas de las 4 secciones en claro y en oscuro, más una a 375 px en una pestaña aparte. Sin scroll lateral.
- [ ] Commit `docs: maqueta del rediseño de Entradas, Workflows, Etiquetas y UTMs`. Enseñar las capturas a Cristian. **Parar hasta que la apruebe.** Lo que cambie se aplica en la maqueta antes de seguir.

### Tarea 3: Entradas en el código

**Archivos:**
- Modificar `src/app/(panel)/admin/entradas.tsx`.
- Modificar `src/lib/entradas-datos.ts`: añadir `leadsPorDia`.
- Test: `tests/unit/entradas-por-dia.test.ts`.

**Interfaz que crea:** `porDia(envios: { entrada_id: string; recibido_en: string }[], dias: number, hoy: Date): Map<string, number[]>`, una función pura con un array de `dias` números por Entrada, del más antiguo al de hoy. `leadsPorDia(entradaIds: string[], dias: number)` la llama con los envíos de `webhook_eventos` de esos días.

- [ ] Test que falla: 3 envíos de la Entrada A (hoy, hoy y hace 2 días) con `dias=3` → `[1, 0, 2]`. Una Entrada sin envíos → `[0, 0, 0]`. Un envío de hace 5 días no cuenta.
- [ ] `npm run test:unit -- entradas-por-dia` → FALLA.
- [ ] Escribir `porDia` y `leadsPorDia` en `entradas-datos.ts`.
- [ ] `npm run test:unit -- entradas-por-dia` → PASA.
- [ ] Rehacer `entradas.tsx` como en la maqueta aprobada. Reutilizar `Kpi` (`components/ui.tsx`) para los números grandes y `GraficoLeads` para el gráfico pequeño, si en tamaño mini se lee bien; si no, un SVG de barras dentro del mismo archivo.
- [ ] `npm run lint && npx tsc --noEmit && npm run test:unit` → todo en verde.
- [ ] Mirar con Playwright: Maestria y Test, claro y oscuro, y móvil en una pestaña aparte. Crear y copiar dirección siguen funcionando, comprobado en Test.
- [ ] Commit en la rama (sin PR todavía).

### Tarea 4: Workflows en el código

**Archivos:** modificar `src/app/(panel)/admin/workflows.tsx`. `workflows-editor.tsx` y el diagrama no se tocan.

- [ ] Rehacer la lista como en la maqueta: números grandes arriba con `Kpi` y tarjetas. Los números salen de lo que la pestaña ya carga hoy (leads, con error, esperando, coincidencias en prueba), sin consultas nuevas.
- [ ] Lint, tipos y unitarios en verde. Mirar con Playwright como en la Tarea 3. «Pasar a real» y «Parar la prueba» siguen ahí (comprobar que se ven; no pulsarlos en Maestria).
- [ ] Commit en la rama (sin PR todavía).

### Tarea 5: Etiquetas y UTMs (Administración) en el código

**Archivos:** modificar `src/app/(panel)/admin/etiquetas-utms.tsx`, `canales.tsx` y `etiquetas.tsx`.

- [ ] Añadir arriba `AnilloPartes` (leads por canal y por etiqueta, `max=6`) y `Barras` por canal, como en la maqueta. Las cuentas por etiqueta ya llegan («24 leads»). Las de canal salen de la misma consulta.
- [ ] Las listas para editar se quedan con las mismas acciones y el aspecto de la maqueta.
- [ ] Lint, tipos y unitarios en verde. Mirar con Playwright en Maestria y Test. Renombrar se prueba solo en Test.
- [ ] Commit en la rama (sin PR todavía).

### Tarea 6: UTMs (KPIs) en el código

**Archivos:**
- Modificar `src/app/(panel)/kpis/utms.tsx`.
- Modificar `src/lib/utms.ts`: añadir `porDiaUtm` y `rankingCampanas`.
- Test: `tests/unit/utms-graficos.test.ts`.

**Interfaces que crea (funciones puras sobre `FilaUtm[]`, que ya está cargado):**
- `porDiaUtm(filas: FilaUtm[], desde: number, hasta: number): PuntoSerie[]`: el mismo tipo que usa `GraficoLeads`.
- `rankingCampanas(filas: FilaUtm[], max: number): Barra[]`: el tipo de `components/barras.tsx`, ordenado de más a menos, con `pct` sobre el total.
- Embudo: se reutiliza `embudo()` de `src/lib/leads-cifras.ts` con los `LeadVista` de `cargarLeadsKpis`, filtrados por los ids de las filas UTM visibles. No se inventa una regla nueva.

- [ ] Tests que fallan:
  - 3 filas con `alta` en 2 días distintos → 2 puntos con 2 y 1.
  - `rankingCampanas` con campañas A×3, B×1 y «Sin dato»×2 → `[A 50 %, Sin dato 33 %, B 17 %]` con `max=3`.
  - Filas vacías → `[]` en las dos.
- [ ] `npm run test:unit -- utms-graficos` → FALLA. Escribir las dos funciones. → PASA.
- [ ] Rehacer `utms.tsx` como en la maqueta: `Kpi`, `AnilloPartes` en lugar de las 3 tablas, `GraficoLeads`, `EmbudoVidrio` por canal y `Barras`. Debajo siguen los filtros, la tabla y `GeneradorEnlaces`.
- [ ] Medir cuánto tarda en cargar, antes y después, en Maestria «Todo». Si tarda más de 1 s más, avisar a Cristian.
- [ ] Lint, tipos y unitarios en verde. Mirar con Playwright como en la Tarea 3.
- [ ] Commit en la rama (sin PR todavía).

### Tarea 7: Un solo PR con las 4 pestañas

- [ ] `npm run lint && npx tsc --noEmit && npm run test:unit` en verde con todo junto.
- [ ] Push de la rama y PR único `feat: rediseño de Entradas, Workflows, Etiquetas y UTMs`, con las capturas antes/después de cada pestaña.
- [ ] Fusionar solo en verde: `gh pr checks N > f && gh pr merge N --merge`.
- [ ] Mirar las 4 pestañas en dashboard.eternity.llc con Playwright (Maestria y Test, claro y oscuro) y enseñárselas a Cristian.

## Pendiente de decidir (Cristian)

1. ~~«Otra cosa» en tracking~~: Cristian, 11 nov: «Nada más, sigue».
3. Decidido por Claude en la maqueta (11 nov), para que Cristian lo confirme:
   - «Sin dato» y «Sin canal» van aparte, no dentro de los círculos: el 98,6 % de los leads no tiene UTM y el 97,8 % no tiene canal.
   - El embudo de UTMs se hace por `utm_source` y no por canal, porque el canal sale de la cita: solo lo tienen los que agendaron, así que su embudo daría siempre 100 %.
   - El pico de 2182 leads del 26/10 aplasta el gráfico de leads por día. Falta decidir cómo enseñarlo.
2. Los tests de integración necesitan Supabase local con Docker, que no se usa en el Mac. Corren en GitHub al abrir el PR; aquí solo se corren los unitarios.
