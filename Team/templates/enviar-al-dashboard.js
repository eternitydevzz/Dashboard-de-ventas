// Enviar un formulario de una landing al dashboard de ventas (dashboard.eternity.llc) con el JSON v1.
// Plan GHL, punto 3 (Cristian, 7 nov 2026). Explicación completa: Team/Template-landing.md
//
// La landing SOLO manda datos. Etiquetas, pipeline y GHL los decide el dashboard (su Entrada y su workflow).
// La dirección es la de la Entrada de esa landing (Administración → Entradas → «Copiar dirección»):
//   https://dashboard.eternity.llc/api/webhooks/entrada/<clave>
// La clave es secreta: no la pegues en documentos del equipo. En un servidor, va en una variable de entorno.
//
// Dos versiones: NAVEGADOR (la página manda desde el navegador de la persona) y SERVIDOR (Node / Vercel).
// Respuestas del dashboard: 200 guardado · 400 JSON mal escrito · 404 dirección mala o Entrada apagada ·
// 413 más de 500 KB · 422 sin email ni teléfono (se guarda el envío, no crea lead) · 429 demasiados (esperar) · 500 error.

// ---------------------------------------------------------------- NAVEGADOR ----------------------------------------
// Uso:  enviarAlDashboard(URL_DE_LA_ENTRADA, { form: "agenda", step: "completo", name, email, phone, quiz, quiz_completed: true })
// 3 intentos de 5 s. No reintenta si el dashboard dice que el envío está mal (400, 404, 413, 422). Devuelve true / false.
// `source` es el nombre de la landing (p. ej. "codigomaestria"). Usa el mismo `event_id` en todos los envíos de la
// misma persona (datos de contacto y, después, el cuestionario): así el dashboard los junta.
function enviarAlDashboard(url, datos, opciones) {
  opciones = opciones || {};
  var q = new URLSearchParams(location.search);
  var seguimiento = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "fbclid", "gclid", "ttclid"].forEach(function (k) {
    if (q.get(k)) seguimiento[k] = q.get(k);
  });
  var cuerpo = Object.assign(
    {
      template: "v1",
      source: opciones.source || "",
      event_id: opciones.eventId || (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()),
      submitted_at: new Date().toISOString(),
      page_url: location.href.slice(0, 1000),
      referrer: (document.referrer || "").slice(0, 1000),
      user_agent: navigator.userAgent,
      language: navigator.language || "",
      timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone || ""),
    },
    seguimiento,
    datos
  );
  var intento = 0;
  function uno() {
    intento++;
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 5000);
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo), keepalive: true, signal: ctrl.signal })
      .then(function (r) {
        clearTimeout(t);
        if (r.ok) return true;
        if (r.status !== 429 && r.status < 500) return false; // el envío está mal: reintentar no sirve
        throw new Error("dashboard " + r.status);
      })
      .catch(function (e) {
        clearTimeout(t);
        if (intento >= 3) { if (window.console) console.warn("[dashboard] no se pudo enviar:", e.message); return false; }
        return new Promise(function (r) { setTimeout(r, 600 * intento); }).then(uno);
      });
  }
  return uno();
}

// ---------------------------------------------------------------- SERVIDOR (Node 18+ / Vercel) --------------------
// Uso en una función de Vercel:
//   await enviarAlDashboardServidor(process.env.DASHBOARD_ENTRADA_URL, { source: "biblioteca", form: "registro", ... }, req)
// 2 intentos de 5 s. Manda la IP de la persona en `ip` (desde un servidor el dashboard no la puede leer él solo).
// Nunca lanza: devuelve true / false (si falla, que quede en el registro de Vercel).
async function enviarAlDashboardServidor(url, datos, req) {
  if (!url) { console.warn("[dashboard] falta la dirección de la Entrada (variable de entorno)"); return false; }
  const cabecera = (req && req.headers && (req.headers["x-forwarded-for"] || (req.headers.get && req.headers.get("x-forwarded-for")))) || "";
  const cuerpo = { template: "v1", submitted_at: new Date().toISOString(), ip: String(cabecera).split(",")[0].trim(), ...datos };
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(5000) });
      if (r.ok) return true;
      if (r.status !== 429 && r.status < 500) { console.warn("[dashboard] envío rechazado:", r.status); return false; }
    } catch (e) {
      console.warn("[dashboard] intento " + intento + "/2:", e.message);
    }
  }
  return false;
}

if (typeof module !== "undefined") module.exports = { enviarAlDashboard, enviarAlDashboardServidor };
