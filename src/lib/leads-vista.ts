// 1c (Cristian, 26 oct 2026): los datos de la pestaña «Leads» de KPIs. Sin "server-only": lo usan el servidor (para
// compactar) y el navegador (para descompactar y calcular). No toca la base: solo cambia cómo viajan los datos.
//
// Compactar = los nombres (pipelines, columnas, personas, etiquetas, preguntas y respuestas) van una sola vez en listas
// y cada lead lleva solo su posición en ellas. Medido el 26 oct con 4.688 leads: 3,65 MB → 0,71 MB (límite de Vercel,
// 4,5 MB). Se guarda igual que en la base: nada se recalcula ni se pierde (lo comprueba tests/unit/leads-vista.test.ts).
import { esContacto } from "@/lib/estados-caller";
import type { Respuesta } from "@/lib/tipos";

export type LeadDeLaBase = {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string | null;
  telefono: string | null;
  pais: string | null;
  etiquetas: string[] | null;
  respuestas: Respuesta[] | null;
  pipeline_id: string | null;
  etapa_id: string | null;
  caller_id: string | null;
  closer_id: string | null;
  estado_caller: string;
  creado_en: string;
  fuente: string | null;
  estrellas_caller: number | null;
  oferta: string | null;
};
export const CAMPOS_LEAD = "id, nombre, apellido, email, telefono, pais, etiquetas, respuestas, pipeline_id, etapa_id, caller_id, closer_id, estado_caller, creado_en, fuente, estrellas_caller, oferta";
export type Tarjeta = { lead_id: string; pipeline_id: string; etapa_id: string | null };
export type PipelineVista = { id: string; nombre: string };
export type EtapaVista = { id: string; nombre: string; pipeline_id: string; color: string };
export type PersonaVista = { id: string; nombre: string; rol: string; baja?: boolean }; // baja: ya no está en el equipo

// Hasta dónde llegó cada lead (embudo de la misma tanda; reglas de KPIs). Se guarda como suma de estos números.
export const MARCA = { contactado: 1, contesta: 2, agendado: 4, asistio: 8, compro: 16 } as const;

// Embudo por lead, con lo que ya carga «Por persona» (lib/metricas.ts → cargarBase, sin perfiles de prueba):
// contactado = llamada o WhatsApp apuntado, o agendó · contesta = llamada que no fue «no contesta», o agendó (agendar
// no apunta una llamada) · agendado = tiene alguna cita · asistió = cita en un estado de «asistió» · compró = tiene venta.
// Cuenta lo de cualquier persona real del equipo (como el Funnel), en cualquier fecha: «hasta hoy».
export function marcasEmbudo(
  actividades: { lead_id: string; tipo: string; resultado: string | null }[],
  citas: { lead_id: string; estado: string }[],
  ventas: { lead_id: string }[],
  asistidas: readonly string[]
) {
  const m = new Map<string, number>();
  const poner = (id: string, marca: number) => m.set(id, (m.get(id) ?? 0) | marca);
  for (const a of actividades) {
    // C11 (punto 16): contesta = el lead avanzó (los botones apuntan «cambio_etapa» con su estado)
    if (esContacto(a)) poner(a.lead_id, MARCA.contactado | MARCA.contesta);
    if (a.tipo !== "llamada" && a.tipo !== "whatsapp") continue;
    poner(a.lead_id, MARCA.contactado);
  }
  for (const c of citas) {
    poner(c.lead_id, MARCA.contactado | MARCA.contesta | MARCA.agendado);
    if (asistidas.includes(c.estado)) poner(c.lead_id, MARCA.asistio);
  }
  for (const v of ventas) poner(v.lead_id, MARCA.compro);
  return m;
}

// Un lead compacto: [id, nombre, teléfono, email, país, alta (segundos), pipeline, columna, 🔗 [[pipeline, columna]…],
// caller, closer, estado, estrellas, oferta, fuente, etiquetas, respuestas [[pregunta, respuesta]…], marcas]. Las
// posiciones apuntan a las listas de `LeadsCompactos`; -1 = ninguno.
export type LeadCompacto = [string, string, string | null, string | null, string | null, number, number, number, [number, number][], number, number, string, number | null, string | null, number, number[], [number, number][], number];
export type LeadsCompactos = {
  pipelines: PipelineVista[];
  etapas: EtapaVista[];
  gente: PersonaVista[];
  textos: string[]; // fuentes, etiquetas, preguntas y respuestas, sin repetir
  leads: LeadCompacto[];
};

export type LeadVista = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  pais: string | null;
  alta: number; // milisegundos
  pipelineId: string | null;
  etapaId: string | null;
  tarjetas: { pipelineId: string; etapaId: string | null }[]; // 🔗 en otros pipelines
  callerId: string | null;
  closerId: string | null;
  estado: string;
  estrellas: number | null;
  oferta: string | null;
  fuente: string | null;
  etiquetas: string[];
  respuestas: Respuesta[];
  marcas: number;
};

export function compactarLeads(d: { leads: LeadDeLaBase[]; tarjetas: Tarjeta[]; pipelines: PipelineVista[]; etapas: EtapaVista[]; gente: PersonaVista[]; marcas: Map<string, number> }): LeadsCompactos {
  const posicion = <T extends { id: string }>(lista: T[]) => {
    const m = new Map(lista.map((x, i) => [x.id, i]));
    return (id: string | null | undefined) => (id ? m.get(id) ?? -1 : -1);
  };
  const pipe = posicion(d.pipelines);
  const etapa = posicion(d.etapas);
  const persona = posicion(d.gente);
  const textos: string[] = [];
  const indice = new Map<string, number>();
  const texto = (t: string) => {
    let i = indice.get(t);
    if (i === undefined) {
      i = textos.length;
      textos.push(t);
      indice.set(t, i);
    }
    return i;
  };
  const tarjetasDe = new Map<string, [number, number][]>();
  for (const t of d.tarjetas) tarjetasDe.set(t.lead_id, [...(tarjetasDe.get(t.lead_id) ?? []), [pipe(t.pipeline_id), etapa(t.etapa_id)]]);
  const leads = d.leads.map((l): LeadCompacto => [
    l.id,
    `${l.nombre ?? ""} ${l.apellido ?? ""}`.trim(),
    l.telefono,
    l.email,
    l.pais,
    Math.round(new Date(l.creado_en).getTime() / 1000),
    pipe(l.pipeline_id),
    etapa(l.etapa_id),
    tarjetasDe.get(l.id) ?? [],
    persona(l.caller_id),
    persona(l.closer_id),
    l.estado_caller,
    l.estrellas_caller,
    l.oferta,
    l.fuente ? texto(l.fuente) : -1,
    (l.etiquetas ?? []).map(texto),
    (l.respuestas ?? []).map((r) => [texto(r.pregunta), texto(r.respuesta ?? "")]),
    d.marcas.get(l.id) ?? 0,
  ]);
  return { pipelines: d.pipelines, etapas: d.etapas, gente: d.gente, textos, leads };
}

export function descompactarLeads(c: LeadsCompactos): { pipelines: PipelineVista[]; etapas: EtapaVista[]; gente: PersonaVista[]; leads: LeadVista[] } {
  const id = <T extends { id: string }>(lista: T[], i: number) => (i >= 0 ? lista[i]?.id ?? null : null);
  const leads = c.leads.map(([lid, nombre, telefono, email, pais, alta, p, e, tarjetas, caller, closer, estado, estrellas, oferta, fuente, etiquetas, respuestas, marcas]): LeadVista => ({
    id: lid,
    nombre,
    telefono,
    email,
    pais,
    alta: alta * 1000,
    pipelineId: id(c.pipelines, p),
    etapaId: id(c.etapas, e),
    tarjetas: tarjetas.flatMap(([tp, te]) => {
      const pipelineId = id(c.pipelines, tp);
      return pipelineId ? [{ pipelineId, etapaId: id(c.etapas, te) }] : [];
    }),
    callerId: id(c.gente, caller),
    closerId: id(c.gente, closer),
    estado,
    estrellas,
    oferta,
    fuente: fuente >= 0 ? c.textos[fuente] : null,
    etiquetas: etiquetas.map((i) => c.textos[i]),
    respuestas: respuestas.map(([pr, rs]) => ({ pregunta: c.textos[pr], respuesta: c.textos[rs] })),
    marcas,
  }));
  return { pipelines: c.pipelines, etapas: c.etapas, gente: c.gente, leads };
}
