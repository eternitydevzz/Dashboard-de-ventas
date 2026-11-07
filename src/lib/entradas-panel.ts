// Panel de endpoints (plan GHL, punto 0, Cristian 7 nov 2026): lo que el panel calcula sin base de datos.
// Se usa en el servidor (validar lo que se guarda) y en el navegador (textos y JSON de ejemplo).

export type EnviaDesde = "navegador" | "servidor";
export type DatosLanding = { landing: string | null; formulario: string | null; envia_desde: EnviaDesde | null; archivo: string | null };

const corto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

// Lo que se guarda de la landing: texto limpio o null. «Envía desde» fuera de navegador/servidor = «no lo sé» (null).
export function datosLandingValidos(x: Partial<Record<keyof DatosLanding, unknown>>): DatosLanding {
  const desde = x.envia_desde === "navegador" || x.envia_desde === "servidor" ? x.envia_desde : null;
  return { landing: corto(x.landing, 80), formulario: corto(x.formulario, 80), envia_desde: desde, archivo: corto(x.archivo, 120) };
}

// En pantalla la dirección va cortada (la clave entera no hace falta verla); «Copiar dirección» copia la entera.
export function direccionCorta(url: string) {
  const m = url.match(/^(.*\/api\/webhooks\/entrada\/)([0-9a-f]{48})$/);
  return m ? `${m[1]}${m[2].slice(0, 4)}…${m[2].slice(-4)}` : url;
}

// El JSON v1 del plan (punto 3), con la landing y el formulario de la Entrada. Sin claves ni datos reales.
export function jsonEjemplo({ landing, formulario }: Pick<DatosLanding, "landing" | "formulario">) {
  return {
    template: "v1",
    source: landing || "nombre-de-la-landing",
    form: formulario || "nombre-del-formulario",
    step: "completo",
    event_id: "id-unico-de-este-envio",
    submitted_at: "2026-11-07T13:00:00.000Z",
    name: "Ana Prueba",
    first_name: "Ana",
    last_name: "Prueba",
    email: "ana@ejemplo.com",
    phone: "+15550100000",
    quiz: { pregunta_1: "respuesta 1", pregunta_2: "respuesta 2" },
    quiz_completed: true,
    quiz_answered: 2,
    quiz_score: 10,
    page_url: "https://ejemplo.com/landing",
    referrer: "",
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    utm_content: "",
    utm_term: "",
    utm_id: "",
    fbclid: "",
    gclid: "",
    ttclid: "",
    ip: "",
    user_agent: "",
    language: "es",
    timezone: "America/New_York",
  };
}

// «hace 18 min», «hace 5 h», «hace 2 días»
export function haceCuanto(fecha: string | null, ahora = new Date()) {
  if (!fecha) return null;
  const min = Math.floor((ahora.getTime() - new Date(fecha).getTime()) / 60_000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hace 1 día" : `hace ${d} días`;
}

// El estado de la Entrada en palabras, y la frase de GHL (null = no se dice nada)
export function estadoEntrada(x: { activa: boolean; ghl_activo: boolean; envios: number; rojos: number }) {
  if (!x.activa) return { tono: "off" as const, texto: "Apagada: no recibe nada", ghl: null };
  if (!x.envios) return { tono: "ok" as const, texto: "Esperando el primer lead", ghl: null };
  const ghl = !x.ghl_activo ? "No se manda a GHL" : x.rojos ? null : "Todos llegaron a GHL";
  return { tono: "ok" as const, texto: "Recibiendo leads", ghl };
}
