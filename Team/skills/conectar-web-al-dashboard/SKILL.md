---
name: conectar-web-al-dashboard
description: Conecta una web nueva o una landing que ya existe (página de GHL o web propia en Vercel) al dashboard de ventas de Eternity (dashboard.eternity.llc) con el JSON v1, sin «Inbound Webhook» de GHL. Crea su Entrada y su workflow, pone el código en la web y prueba con 1 lead de prueba. Úsala siempre que pidan «conectar la web al dashboard», «conectar esta landing», «que este formulario mande al dashboard», «nueva Entrada para la web X», «quitar el webhook de GHL de esta landing» o «pasar la landing al JSON v1».
---

# Conectar una web al dashboard

El manual del equipo es `Team/Template-landing.md` (JSON v1, campos, respuestas, código y «si algo falla»). Léelo antes de empezar. El código listo está en `Team/templates/enviar-al-dashboard.js`.

## Primero, preguntar (en una sola pregunta)
1. **¿Página de GHL o web propia en Vercel?** (y dónde está su código: funnel y página de GHL, o carpeta/repo).
2. **¿Web nueva o ya mandaba a un webhook de GHL?** Nueva = paso rápido. Ya existía = paso rápido + lo de «Si ya existía».
3. **Proyecto del dashboard, pipeline y qué tiene que pasar en GHL** (campos, pipeline/columna de GHL, etiquetas). Si no lo sabe, proponer: etiqueta base `<web>-<formulario>` y el pipeline del dashboard con el mismo nombre en GHL.

## Reglas
- **La web solo manda datos.** Etiquetas, pipeline y GHL los decide la Entrada (y su workflow).
- **La dirección es secreta:** no escribirla en documentos, chats ni commits. En un servidor, en una variable de entorno.
- **Siempre con workflow** (decisión de Cristian, 7 nov 2026): se crea con «Probar como workflow» y nace en prueba.
- **Pruebas solo con leads de prueba:** `info+<web>N@eternity.llc` y teléfonos 555-01xx. Si hay calendario, cancelar la cita al terminar.
- **Navegador:** dashboard y GHL con Playwright; `page.bringToFront()` y `visibilityState === "visible"` antes de cada clic.
- **Preguntar antes de:** publicar la web, «Pasar a real», apagar un workflow o webhook de GHL y borrar cualquier cosa.

## Paso rápido (web nueva, ~1 minuto)
1. **Entrada:** Administración → Entradas → «Conectar una landing nueva»: nombre `Web · <web> <formulario>`, landing, formulario, desde dónde manda («Desde la página» o «Desde un servidor») y pipeline → «Crear y ver su dirección».
2. **GHL:** en su tarjeta, «Cambiar ajustes» → «Qué hacer en GHL»: campos, pipeline de GHL, etiqueta base y **«Mandar a GHL» encendido** → Guardar. Después **«Probar como workflow»** (solo sale con «Mandar a GHL» encendido).
3. **Código** con la dirección de «Copiar dirección»:
   - **GHL:** el formulario tiene que ser código propio de la página (elemento HTML / código personalizado). Pegar `enviarAlDashboard` y llamarlo al enviar, con `source: "<web>"`. Si el formulario es nativo de GHL, parar y avisar: sin código propio no puede mandar al dashboard.
   - **Vercel:** desde el navegador, igual; desde una función, `enviarAlDashboardServidor(process.env.DASHBOARD_ENTRADA_URL, datos, req)` y la variable en Vercel (Production y Preview).
   - Mismo `event_id` en todos los envíos de la misma persona.
4. **1 lead de prueba:** en la tarjeta, envío en verde y 1 lead en su pipeline; a los ~2 min, en GHL, contacto, campos, etiqueta `<base>-completo`/`-incompleto` y oportunidad.
5. **Con el OK de Cristian:** publicar la web y «Pasar a real» el workflow (la app apaga sola «Mandar a GHL»).

## Si ya existía (tenía webhook de GHL)
- Antes del paso 1: leer el código de la web (JSON que manda y a dónde) y, con Playwright, su workflow de GHL (campos, etiquetas, pipeline, columna y ramas). Si el editor de GHL no carga, pedir capturas.
- En el paso 2: copiar eso en «Qué hacer en GHL» y ajustar el workflow en Administración → Workflows → «Editar» (ramas por `utm_source`, más pasos) hasta que haga lo mismo.
- En el paso 3: quitar la dirección del webhook de GHL y apuntarla para volver atrás.
- Después del paso 5, con el OK: apagar el workflow de GHL (o solo su rama) y vigilar 24 h que la Entrada no tenga rojos.

## Al terminar
Dar a Cristian: la Entrada creada, dónde se cambió el código, cómo volver atrás, los contactos de prueba para borrar, qué no se probó con datos reales y una puntuación del 0 al 10.
