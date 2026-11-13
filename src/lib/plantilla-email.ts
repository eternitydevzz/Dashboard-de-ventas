// Emails con el aspecto glass de la app (Cristian, 11 oct 2026). Gmail, Yahoo y parte de Outlook no admiten el
// desenfoque (backdrop-filter, según caniemail.com), así que el vidrio se imita: degradado de fondo con los colores
// de la app, tarjeta blanca translúcida con borde fino, filo de luz arriba y sombra suave. Todo en estilos en línea
// y con tablas, que es lo que respetan los programas de correo. Lo que escribe el equipo se escapa siempre.

type OpcionesEmail = {
  titulo: string;
  intro?: string;
  filas?: [string, string][];
  boton?: { texto: string; url: string };
  pie?: string;
  urlBase: string; // dirección pública de la app (para el logo)
};

const C = {
  fondo: "#eef2f9",
  fondo2: "#e4eaf5",
  texto: "#0f1a33",
  texto2: "#46546f",
  texto3: "#66738f",
  borde: "rgba(15,26,51,0.09)",
  granate: "#7b1a22",
};
const FUENTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const escaparHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const conSaltos = (s: string) => escaparHtml(s).replace(/\r?\n/g, "<br>");
const urlSegura = (u: string) => /^https:\/\//i.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(u);

export function plantillaEmail(o: OpcionesEmail): string {
  const base = o.urlBase.replace(/\/$/, "");
  const filas = (o.filas ?? [])
    .map(
      ([p, r], i) =>
        `<tr><td style="padding:10px 14px;${i ? `border-top:1px solid ${C.borde};` : ""}font-size:13px;color:${C.texto2};vertical-align:top;width:45%">${conSaltos(p)}</td>` +
        `<td style="padding:10px 14px;${i ? `border-top:1px solid ${C.borde};` : ""}font-size:14px;font-weight:600;color:${C.texto};vertical-align:top">${conSaltos(r)}</td></tr>`
    )
    .join("");
  const bloqueFilas = filas
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;background-color:#f7f9fd;background-color:rgba(255,255,255,0.6);border:1px solid ${C.borde};border-radius:14px;border-collapse:separate">${filas}</table>`
    : "";
  const bloqueBoton =
    o.boton && urlSegura(o.boton.url)
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr><td style="border-radius:12px;background-color:${C.granate}">` +
        `<a href="${escaparHtml(o.boton.url)}" style="display:inline-block;padding:13px 22px;font-family:${FUENTE};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px">${escaparHtml(o.boton.texto)}</a></td></tr></table>`
      : "";

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escaparHtml(o.titulo)}</title></head>
<body style="margin:0;padding:0;background-color:${C.fondo}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.fondo};background-image:linear-gradient(135deg,${C.fondo} 0%,${C.fondo2} 55%,#f1e6ea 100%)"><tr><td align="center" style="padding:36px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 6px 16px 6px;font-family:${FUENTE}">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle"><img src="${escaparHtml(base)}/marca/eternity.png" width="40" height="40" alt="Eternity" style="display:block;border:0;border-radius:11px"></td>
<td style="vertical-align:middle;padding-left:12px"><div style="font-size:15px;font-weight:700;color:${C.texto}">Eternity</div><div style="font-size:12px;color:${C.texto3}">Panel de ventas</div></td>
</tr></table></td></tr>
<tr><td style="background-color:#fbfcfe;background-color:rgba(255,255,255,0.72);border:1px solid ${C.borde};border-top:1px solid rgba(255,255,255,0.9);border-radius:22px;box-shadow:0 1px 2px rgba(15,26,51,0.04),0 8px 32px rgba(15,26,51,0.08);padding:28px;font-family:${FUENTE}">
<h1 style="margin:0;font-size:20px;line-height:1.3;font-weight:700;color:${C.texto}">${escaparHtml(o.titulo)}</h1>
${o.intro ? `<p style="margin:8px 0 0 0;font-size:14px;line-height:1.55;color:${C.texto2}">${conSaltos(o.intro)}</p>` : ""}
${bloqueFilas}${bloqueBoton}
</td></tr>
${o.pie ? `<tr><td style="padding:16px 6px 0 6px;font-family:${FUENTE};font-size:12px;line-height:1.5;color:${C.texto3}">${conSaltos(o.pie)}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
}
