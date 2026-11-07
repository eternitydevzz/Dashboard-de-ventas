// Workflows 4b (boceto glass aprobado por Cristian el 7 nov 2026): los textos del lienzo y del historial, sin base de
// datos. Se prueba en tests/unit/workflows-vista.test.ts.
import type { Condicion, Disparador, Paso } from "@/lib/workflows";

export type Nombres = {
  entradas: Record<string, string>;
  pipelinesGhl: Record<string, { nombre: string; etapas: Record<string, string> }>;
  pipelinesDashboard: Record<string, { nombre: string; etapas: Record<string, string> }>;
};
export type Icono = "rayo" | "reloj" | "persona" | "etiqueta" | "diana" | "rama" | "mover";
export type Caja = { clave: string; titulo: string; detalle: string | null; icono: Icono };

export function duracionTexto(seg: number) {
  const s = Math.max(0, Math.round(seg));
  if (s < 60) return `${s} segundos`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m} min ${r} s` : m === 1 ? "1 minuto" : `${m} minutos`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h} h ${m} min` : h === 1 ? "1 hora" : `${h} horas`;
}

const donde = (mapa: Nombres["pipelinesGhl"], pipeline: string, etapa: string | null) => ({
  titulo: mapa[pipeline]?.nombre ?? pipeline,
  detalle: etapa ? `Columna «${mapa[pipeline]?.etapas[etapa] ?? etapa}»` : "Primera columna",
});

export function describirPaso(p: Paso, n: Nombres): Caja {
  switch (p.tipo) {
    case "esperar":
      return { clave: "Esperar", titulo: duracionTexto(p.segundos), detalle: null, icono: "reloj" };
    case "contacto_ghl": {
      const k = Object.keys(p.campos ?? {}).length;
      return { clave: "GHL · Contacto", titulo: "Crear o actualizar", detalle: k ? (k === 1 ? "1 campo" : `${k} campos`) : "Solo nombre, email y teléfono", icono: "persona" };
    }
    case "etiquetas_ghl": {
      const base = (p.base ?? "").trim().toLowerCase();
      const fijas = p.fijas ?? [];
      if (!base) return { clave: "GHL · Etiquetas", titulo: fijas.join(", ") || "Sin etiquetas", detalle: null, icono: "etiqueta" };
      return { clave: "GHL · Etiquetas", titulo: `${base}-completo`, detalle: ["o -incompleto", ...(fijas.length ? [`+ ${fijas.join(", ")}`] : [])].join(" · "), icono: "etiqueta" };
    }
    case "oportunidad_ghl":
      return { clave: "GHL · Oportunidad", ...donde(n.pipelinesGhl, p.pipeline_id, p.etapa_id), icono: "diana" };
    case "quitar_etiqueta_ghl":
      return { clave: "GHL · Quitar etiqueta", titulo: p.etiqueta, detalle: null, icono: "etiqueta" };
    case "mover_dashboard":
      return { clave: "Mover en el dashboard", ...donde(n.pipelinesDashboard, p.pipeline_id, p.etapa_id), icono: "mover" };
    case "rama":
      return { clave: "Rama", titulo: `Según ${p.caminos[0]?.condicion.campo ?? "un campo"}`, detalle: `${p.caminos.length + 1} caminos`, icono: "rama" };
  }
}

export function condicionTexto(c: Condicion) {
  if (c.operador === "existe") return `tiene ${c.campo}`;
  if (c.operador === "no_existe") return `no tiene ${c.campo}`;
  if (c.operador === "contiene") return `contiene «${c.valor ?? ""}»`;
  return `es «${c.valor ?? ""}»`;
}

export function disparadorTexto(d: Disparador, n: Nombres) {
  return { titulo: "Llega un lead a la Entrada", detalle: n.entradas[d.entrada_id] ?? "Entrada borrada" };
}

export type Tono = "ok" | "mal" | "espera" | "neutro";
export function estadoEjecucion(e: { estado: string; coincide: boolean | null }): { texto: string; tono: Tono } {
  if (e.estado === "esperando") return { texto: "Esperando", tono: "espera" };
  if (e.estado === "error") return { texto: "Error", tono: "mal" };
  if (e.estado === "parada") return { texto: "Parada", tono: "neutro" };
  if (e.coincide === true) return { texto: "Coincide", tono: "ok" };
  if (e.coincide === false) return { texto: "No coincide", tono: "mal" };
  return { texto: "Enviado a GHL", tono: "ok" };
}

const NOMBRE_PASO: Record<string, string> = {
  contacto_ghl: "contacto",
  etiquetas_ghl: "etiquetas",
  oportunidad_ghl: "oportunidad",
  quitar_etiqueta_ghl: "quitar etiqueta",
  mover_dashboard: "mover",
};

// Las pastillas del historial («18:07 contacto»), en la hora del proyecto
export function pasosDelRegistro(registro: ({ tipo?: string; pasos?: string[]; hora?: string } & Record<string, unknown>)[] | null, zona: string) {
  const hora = (iso: string) => new Intl.DateTimeFormat("es-ES", { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  const r: { hora: string; texto: string }[] = [];
  for (const x of Array.isArray(registro) ? registro : []) {
    if (!x?.hora) continue;
    if (x.tipo === "tramo")
      for (const p of x.pasos ?? []) {
        const tipo = p.match(/\(([a-z_]+)\)$/)?.[1] ?? "";
        r.push({ hora: hora(x.hora), texto: NOMBRE_PASO[tipo] ?? tipo });
      }
    else if (x.tipo === "comparacion") r.push({ hora: hora(x.hora), texto: "comparado con lo de hoy" });
    else if (x.tipo === "parada") r.push({ hora: hora(x.hora), texto: "parada" });
  }
  return r;
}
