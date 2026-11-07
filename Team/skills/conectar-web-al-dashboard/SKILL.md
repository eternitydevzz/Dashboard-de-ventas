---
name: conectar-web-al-dashboard
description: Conecta una landing o formulario web al dashboard de ventas de Eternity (dashboard.eternity.llc) con el JSON v1, sin «Inbound Webhook» de GHL. Crea su Entrada, cambia la landing para que envíe al dashboard, prueba con leads de prueba y apaga el webhook de GHL. Úsala siempre que pidan «conectar la landing al dashboard», «quitar el webhook de GHL de esta landing», «que este formulario mande al dashboard», «nueva Entrada para la landing X» o «pasar la landing al JSON v1».
---

# Conectar una web al dashboard

Lo que hay que saber está en `Team/Template-landing.md` (qué es el JSON v1, la tabla de campos, las respuestas del dashboard y el código). Léelo entero antes de empezar. El código listo está en `Team/templates/enviar-al-dashboard.js`.

## Reglas
- **La landing solo manda datos.** Etiquetas, pipeline y GHL los decide la Entrada del dashboard (y su workflow).
- **La clave de la dirección es secreta:** nunca la escribas en documentos, chats ni en el código del navegador sin que el usuario lo sepa; en un servidor, en una variable de entorno.
- **Una landing cada vez.** Hasta que funciona en producción no se pasa a la siguiente.
- **Pruebas solo con leads de prueba:** `info+<landing>N@eternity.llc` y teléfonos de ficción 555-01xx. Si hay calendario, comprobar el día antes de reservar y cancelar la cita al terminar (las citas mandan email y SMS).
- **Pregunta antes de:** publicar la landing, encender «Mandar a GHL», apagar un workflow o webhook de GHL, y borrar cualquier cosa.

## Pasos
1. **Leer lo de hoy.** Abre el código de la landing y apunta el JSON que manda y a dónde. Con Playwright, lee su workflow de GHL: campos, etiqueta, pipeline, columna y ramas. Si el editor de GHL no carga, pide capturas al usuario.
2. **Crear su Entrada** en Administración → Entradas → «Conectar una landing nueva»: nombre `Web · <landing> <form>`, landing, formulario, desde dónde envía (navegador o servidor) y pipeline del dashboard. En «Cambiar ajustes» → «Qué hacer en GHL»: los campos (lo que llega → campo de GHL, UTM incluidos), sus pipelines de GHL, etiqueta base `<landing>-<form>` en minúsculas, etiquetas fijas si las usaba GHL y espera de 300 s. **Deja «Mandar a GHL» apagado.** Si el workflow de GHL tenía ramas (por ejemplo, por `utm_source`), crea el workflow con «Probar como workflow» y edítalo en Administración → Workflows hasta que haga lo mismo.
3. **Cambiar la landing** para que mande el JSON v1 a la dirección de su Entrada:
   - desde el **navegador**: `enviarAlDashboard(url, datos, { source, eventId })`;
   - desde un **servidor**: `enviarAlDashboardServidor(process.env.DASHBOARD_ENTRADA_URL, datos, req)` y la variable en Vercel (Production y Preview).
   Quita la URL del webhook de GHL. Mismo `event_id` en todos los envíos de la misma persona.
4. **Probar** en el preview con leads de prueba: completo, incompleto y uno que llega tarde. En el dashboard: 1 lead, su pipeline y el envío en verde (Administración → Entradas). En GHL: contacto, campos, etiquetas y oportunidades.
5. **Con el OK del usuario:** encender «Mandar a GHL», publicar la landing y apagar su workflow de GHL (o solo su rama, si el webhook lo comparten otras webs).
6. **Probar una vez en producción** y vigilar 24 h: Administración → Entradas sin rojos.
7. **Apuntar cómo volver atrás** (commit anterior de la landing + encender el workflow de GHL) y pasar al usuario los contactos de prueba para que los borre.

## Al terminar
Di qué salió mal, qué no se probó con datos reales, qué falta y una puntuación del 0 al 10.
