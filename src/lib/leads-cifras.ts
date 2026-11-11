// 1c (Cristian, 26 oct 2026): filtros y cifras de la pestaña «Leads» de KPIs. Se calcula en el navegador con los
// leads ya cargados (lib/leads-vista.ts): cambiar un filtro no pide nada a la base.
import { MARCA, type LeadVista, type PipelineVista } from "@/lib/leads-vista";
import { SIN_PAIS, nombrePais } from "@/lib/formato";

export type FiltroLeads = {
  desde: number | null; // fecha de alta, en milisegundos (null = sin límite)
  hasta: number | null;
  pipelineId: string | null; // null = todos; si no, su pipeline principal o una tarjeta 🔗 allí
  pais: string; // "" = todos; un código («ES») o «Sin país» (también los aún sin calcular)
  sinCaller: boolean;
  q: string;
  oferta?: string; // "" o sin poner = todas; si no, la oferta de la Biblioteca («vip», «grupal»…)
};

export const enPipeline = (l: LeadVista, pipelineId: string) => l.pipelineId === pipelineId || l.tarjetas.some((t) => t.pipelineId === pipelineId);
export const paisDe = (l: LeadVista) => l.pais ?? SIN_PAIS;

// Todo menos la fuente (la comparación por fuente y los números de los botones usan esto)
export function filtrarSinFuente(leads: LeadVista[], f: Omit<FiltroLeads, "pipelineId">) {
  const t = f.q.trim().toLowerCase();
  const tel = t.replace(/\s/g, "");
  return leads.filter(
    (l) =>
      (f.desde === null || l.alta >= f.desde) &&
      (f.hasta === null || l.alta < f.hasta) &&
      (!f.pais || paisDe(l) === f.pais) &&
      (!f.sinCaller || !l.callerId) &&
      (!f.oferta || l.oferta === f.oferta) &&
      (!t ||
        l.nombre.toLowerCase().includes(t) ||
        (l.email ?? "").toLowerCase().includes(t) ||
        (!!tel && (l.telefono ?? "").replace(/\s/g, "").includes(tel)) ||
        nombrePais(l.pais).toLowerCase().includes(t) ||
        l.etiquetas.some((e) => e.toLowerCase().includes(t)))
  );
}

export function filtrarLeads(leads: LeadVista[], f: FiltroLeads) {
  const sinFuente = filtrarSinFuente(leads, f);
  return f.pipelineId ? sinFuente.filter((l) => enPipeline(l, f.pipelineId!)) : sinFuente;
}

const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 1000) / 10 : null);

// Embudo de la misma tanda: de estos leads, cuántos llegaron a cada paso (hasta hoy)
export function embudo(leads: Pick<LeadVista, "marcas">[]) { // también lo usa KPIs → UTMs con sus filas (rediseño, 11 nov 2026)
  const n = (m: number) => leads.filter((l) => (l.marcas & m) === m).length;
  const total = leads.length;
  const pasos = [
    { t: "Leads", n: total },
    { t: "Contactados", n: n(MARCA.contactado) },
    { t: "Contestan", n: n(MARCA.contesta) },
    { t: "Agendan", n: n(MARCA.agendado) },
    { t: "Asisten", n: n(MARCA.asistio) },
    { t: "Compran", n: n(MARCA.compro) },
  ];
  return pasos.map((p) => ({ ...p, pct: pct(p.n, total) }));
}

export function cifras(leads: LeadVista[]) {
  const total = leads.length;
  const sinCaller = leads.filter((l) => !l.callerId).length;
  const e = embudo(leads);
  const de = (t: string) => e.find((p) => p.t === t)!.n;
  return {
    total,
    sinCaller: { n: sinCaller, pct: pct(sinCaller, total) },
    contactados: { n: de("Contactados"), pct: pct(de("Contactados"), total) },
    agendados: { n: de("Agendan"), pct: pct(de("Agendan"), total) },
    compran: { n: de("Compran"), pct: pct(de("Compran"), total) },
  };
}

// Una fila por fuente (pipeline), con su embudo; «Todos» al principio (cada persona una vez)
export function compararFuentes(leads: LeadVista[], pipelines: PipelineVista[]) {
  const fila = (id: string | null, nombre: string, ls: LeadVista[]) => {
    const e = embudo(ls);
    return { id, nombre, sinCaller: ls.filter((l) => !l.callerId).length, pasos: e };
  };
  return [fila(null, "Todos", leads), ...pipelines.map((p) => fila(p.id, p.nombre, leads.filter((l) => enPipeline(l, p.id))))];
}

// L4 (Cristian, 26 oct: «al pasar el ratón tienen que salir los días o las horas»): leads por día de alta, en la zona
// del proyecto, con su reparto por fuente; si el periodo es de 2 días o menos («Hoy»), por horas. Sin «desde», desde el
// primero; sin «hasta», hasta ahora (máx. 400 puntos).
export type PuntoSerie = { corto: string; largo: string; total: number; fuentes: { t: string; n: number }[] };
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export function serieLeads(leads: LeadVista[], zona: string, desde: number | null, hasta: number | null, fuenteDe: (l: LeadVista) => string, ahora = Date.now()) {
  const porHoras = desde !== null && hasta !== null && hasta - desde <= 2 * 86_400_000;
  const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: zona });
  const fmtHora = new Intl.DateTimeFormat("en-GB", { timeZone: zona, hour: "2-digit", hourCycle: "h23" });
  const clave = (ms: number) => (porHoras ? `${fmtDia.format(new Date(ms))}T${fmtHora.format(new Date(ms))}` : fmtDia.format(new Date(ms)));
  const cuenta = new Map<string, LeadVista[]>();
  for (const l of leads) cuenta.set(clave(l.alta), [...(cuenta.get(clave(l.alta)) ?? []), l]);
  const fin = Math.min((hasta ?? ahora + 1) - 1, ahora);
  const claves: string[] = [];
  if (porHoras) {
    for (let t = desde!; t <= fin && claves.length < 400; t += 3_600_000) if (!claves.includes(clave(t))) claves.push(clave(t));
  } else {
    const inicio = desde ?? (leads.length ? Math.min(...leads.map((l) => l.alta)) : ahora);
    const d = new Date(`${fmtDia.format(new Date(inicio))}T12:00:00Z`);
    const ultimo = fmtDia.format(new Date(fin));
    while (d.toISOString().slice(0, 10) <= ultimo && claves.length < 400) {
      claves.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  return {
    porHoras,
    puntos: claves.map((k): PuntoSerie => {
      const ls = cuenta.get(k) ?? [];
      const dia = k.slice(0, 10);
      const semana = DIAS_SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()];
      const fecha = `${Number(dia.slice(8, 10))} ${MESES[Number(dia.slice(5, 7)) - 1]}`;
      return {
        corto: porHoras ? `${k.slice(11, 13)}:00` : `${dia.slice(8, 10)}/${dia.slice(5, 7)}`,
        largo: porHoras ? `${semana} ${fecha} · ${k.slice(11, 13)}:00–${k.slice(11, 13)}:59` : `${semana} ${fecha} ${dia.slice(0, 4)}`,
        total: ls.length,
        fuentes: repartir(ls, fuenteDe).map(({ t, n }) => ({ t, n })),
      };
    }),
  };
}

// L4: las preguntas de los formularios de estos leads (con su nombre único), de la más respondida a la menos
export function preguntasDe(leads: LeadVista[], canonica: (p: string) => string) {
  const m = new Map<string, number>();
  for (const l of leads) for (const p of new Set(l.respuestas.filter((r) => r.respuesta).map((r) => canonica(r.pregunta)))) m.set(p, (m.get(p) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([pregunta, n]) => ({ pregunta, n }));
}

// L4: qué respondieron a una pregunta (solo quien la respondió); como mucho `max` respuestas y el resto en «Otras»
export function respuestasA(leads: LeadVista[], pregunta: string, canonica: (p: string) => string, max = 12) {
  const con = leads.flatMap((l) => {
    const r = l.respuestas.find((x) => x.respuesta && canonica(x.pregunta) === pregunta);
    return r ? [r.respuesta.trim()] : [];
  });
  const filas = repartir(con, (t) => t);
  if (filas.length <= max) return { total: con.length, filas };
  const resto = filas.slice(max - 1).reduce((s, f) => s + f.n, 0);
  return { total: con.length, filas: [...filas.slice(0, max - 1), { t: "Otras", n: resto, pct: Math.round((resto / con.length) * 1000) / 10 }] };
}

// Reparto por una clave (país, estado, caller…): de más a menos, con su %; «vacio» al final
export function repartir<T>(lista: T[], clave: (x: T) => string | null, vacio = "—") {
  const m = new Map<string, number>();
  for (const x of lista) {
    const k = clave(x) ?? vacio;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m]
    .sort((a, b) => (a[0] === vacio ? 1 : b[0] === vacio ? -1 : b[1] - a[1] || a[0].localeCompare(b[0])))
    .map(([t, n]) => ({ t, n, pct: pct(n, lista.length) ?? 0 }));
}
