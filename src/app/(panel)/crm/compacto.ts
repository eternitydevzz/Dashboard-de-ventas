// Velocidad (C5, 13 nov 2026): el CRM mandaba cada lead como objeto, con los nombres de los campos y los ids largos de
// columna, caller y closer repetidos en cada uno (1,8 MB por carga, medido el 28 oct). Como en KPIs → Leads
// (lib/leads-vista.ts): ids y textos repetidos van una sola vez en listas y cada lead lleva su posición en ellas.
// Sin "server-only": compacta el servidor (page.tsx) y descompacta el navegador (tablero.tsx). No se pierde nada
// (tests/unit/crm-compacto.test.ts); la fecha de alta vuelve en UTC con milisegundos (el día y la hora no cambian).
import type { LeadTarjeta } from "./tablero";

type Fila = [
  id: string,
  nombre: string,
  apellido: string,
  email: string | null,
  telefono: string | null,
  pais: string | null,
  etapa: number,
  caller: number,
  closer: number,
  estado: number,
  alta: number,
  etiquetas: number[],
  invertir: number,
  oferta: number,
  otroPipeline: 0 | 1,
];
export type LeadsCrm = { ids: string[]; textos: string[]; filas: Fila[] };

// Posición de un valor en su lista (la crea al vuelo); -1 = null
function lista() {
  const valores: string[] = [];
  const indice = new Map<string, number>();
  const pos = (v: string | null | undefined) => {
    if (v == null) return -1;
    let i = indice.get(v);
    if (i === undefined) {
      i = valores.push(v) - 1;
      indice.set(v, i);
    }
    return i;
  };
  return { valores, pos };
}

export function compactarCrm(leads: LeadTarjeta[]): LeadsCrm {
  const ids = lista();
  const textos = lista();
  const filas = leads.map((l): Fila => [
    l.id,
    l.nombre,
    l.apellido,
    l.email,
    l.telefono,
    l.pais,
    ids.pos(l.etapa_id),
    ids.pos(l.caller_id),
    ids.pos(l.closer_id),
    textos.pos(l.estado_caller),
    Date.parse(l.creado_en),
    (l.etiquetas ?? []).map(textos.pos),
    textos.pos(l.invertir),
    textos.pos(l.oferta),
    l.otroPipeline ? 1 : 0,
  ]);
  return { ids: ids.valores, textos: textos.valores, filas };
}

export function descompactarCrm({ ids, textos, filas }: LeadsCrm): LeadTarjeta[] {
  const id = (i: number) => (i >= 0 ? ids[i] : null);
  const texto = (i: number) => (i >= 0 ? textos[i] : null);
  return filas.map(([lid, nombre, apellido, email, telefono, pais, etapa, caller, closer, estado, alta, etiquetas, invertir, oferta, otro]) => ({
    id: lid,
    nombre,
    apellido,
    email,
    telefono,
    pais,
    etapa_id: id(etapa),
    caller_id: id(caller),
    closer_id: id(closer),
    estado_caller: texto(estado) as string,
    creado_en: new Date(alta).toISOString(),
    etiquetas: etiquetas.map((i) => textos[i]),
    invertir: texto(invertir),
    oferta: texto(oferta),
    otroPipeline: otro === 1,
  }));
}
