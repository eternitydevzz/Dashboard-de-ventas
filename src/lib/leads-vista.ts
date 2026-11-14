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
type EtapaVista = { id: string; nombre: string; pipeline_id: string; color: string };
type PersonaVista = { id: string; nombre: string; rol: string; baja?: boolean }; // baja: ya no está en el equipo

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

// Un lead compacto: [id, nombre, teléfono, email, país, alta (segundos), pipeline, columna, 🔗, caller, closer, estado,
// estrellas (0 = sin estrellas; la base solo deja 1-5), oferta, fuente, etiquetas, respuestas, marcas]. Las posiciones
// apuntan a las listas de `LeadsCompactos`; -1 = ninguno.
// Cristian, 14 nov (Ola 2, «la velocidad, lo más importante»): estado y oferta van como posición en `textos`, y 🔗
// ([pipeline, columna, pipeline, columna…]), etiquetas y respuestas (cada [pregunta, respuesta] es otra lista) como
// posición en `listas`: miles de leads repiten la misma lista. Medido con los 4.690 leads del 14 nov (datos personales
// tapados): props 868 → 681 KB; con el HTML pintado, 1.168 → 968 KB (comprimido, 218 → 208 KB). Lo pintado, igual.
type LeadCompacto = [string, string, string | null, string | null, string | null, number, number, number, number, number, number, number, number, number, number, number, number, number];
export type LeadsCompactos = {
  pipelines: PipelineVista[];
  etapas: EtapaVista[];
  gente: PersonaVista[];
  textos: string[]; // estados, ofertas, fuentes, etiquetas, preguntas y respuestas, sin repetir
  listas: number[][]; // 🔗, etiquetas y respuestas, sin repetir
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
  // Lo que ya salió va una sola vez: cada uno lleva su posición (textos por el texto; listas por sus números)
  const sinRepetir = <T>(clave: (x: T) => string) => {
    const lista: T[] = [];
    const indice = new Map<string, number>();
    const pos = (x: T) => {
      const k = clave(x);
      let i = indice.get(k);
      if (i === undefined) {
        i = lista.length;
        lista.push(x);
        indice.set(k, i);
      }
      return i;
    };
    return { lista, pos };
  };
  const textos = sinRepetir<string>((t) => t);
  const listas = sinRepetir<number[]>((l) => l.join(","));
  const texto = textos.pos;
  const tarjetasDe = new Map<string, number[]>();
  for (const t of d.tarjetas) tarjetasDe.set(t.lead_id, [...(tarjetasDe.get(t.lead_id) ?? []), pipe(t.pipeline_id), etapa(t.etapa_id)]);
  const leads = d.leads.map((l): LeadCompacto => [
    l.id,
    `${l.nombre ?? ""} ${l.apellido ?? ""}`.trim(),
    l.telefono,
    l.email,
    l.pais,
    Math.round(new Date(l.creado_en).getTime() / 1000),
    pipe(l.pipeline_id),
    etapa(l.etapa_id),
    listas.pos(tarjetasDe.get(l.id) ?? []),
    persona(l.caller_id),
    persona(l.closer_id),
    texto(l.estado_caller),
    l.estrellas_caller ?? 0,
    l.oferta ? texto(l.oferta) : -1,
    l.fuente ? texto(l.fuente) : -1,
    listas.pos((l.etiquetas ?? []).map(texto)),
    listas.pos((l.respuestas ?? []).map((r) => listas.pos([texto(r.pregunta), texto(r.respuesta ?? "")]))),
    d.marcas.get(l.id) ?? 0,
  ]);
  return { pipelines: d.pipelines, etapas: d.etapas, gente: d.gente, textos: textos.lista, listas: listas.lista, leads };
}

// [a, b, c, d] → [[a, b], [c, d]]
const deDos = (l: number[]) => Array.from({ length: l.length / 2 }, (_, i) => [l[2 * i], l[2 * i + 1]] as const);

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
    tarjetas: deDos(c.listas[tarjetas]).flatMap(([tp, te]) => {
      const pipelineId = id(c.pipelines, tp);
      return pipelineId ? [{ pipelineId, etapaId: id(c.etapas, te) }] : [];
    }),
    callerId: id(c.gente, caller),
    closerId: id(c.gente, closer),
    estado: c.textos[estado],
    estrellas: estrellas || null,
    oferta: oferta >= 0 ? c.textos[oferta] : null,
    fuente: fuente >= 0 ? c.textos[fuente] : null,
    etiquetas: c.listas[etiquetas].map((i) => c.textos[i]),
    respuestas: c.listas[respuestas].map((i) => ({ pregunta: c.textos[c.listas[i][0]], respuesta: c.textos[c.listas[i][1]] })),
    marcas,
  }));
  return { pipelines: c.pipelines, etapas: c.etapas, gente: c.gente, leads };
}
