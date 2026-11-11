import "server-only";
import { getSesion, esJefe } from "@/lib/auth";
import { exigirSeccion, soloLoSuyo } from "@/lib/permisos";
import { cargarObjetivos, calcularAvances, avancesDelEquipo, type Avance } from "@/lib/objetivos";
import { agruparDuplicados } from "@/lib/duplicados";
import { cargarBase, calcularFunnel } from "@/lib/metricas";
import { calcularKpis } from "@/lib/kpis";
import { rangoNav, type PeriodoNav } from "@/lib/periodos";
import { rangoDe, fechaHora, hoyEnZona, inicioDia, nombrePais, ETIQUETA_ESTADO_CITA, SIN_PAIS, type Periodo } from "@/lib/formato";
import { cargarFinanzas } from "@/lib/finanzas-datos";
import { resumenFinanzas, cambio } from "@/lib/finanzas";
import { db, todas, equipo } from "@/lib/datos";
import { calcularNivel, filasPermisoPipeline } from "@/lib/pipelines";
import { closersVisibles } from "@/lib/agendas-datos";
import { cargarCitasVentas } from "@/lib/tablero-closers";
import { ABIERTAS } from "@/lib/llamadas";
import { ErrorUsuario, esError } from "@/lib/resultado";
import { resumenLead } from "@/app/(panel)/leads/resumen";
import type { Pipeline } from "@/lib/tipos";

// MCP, Fase 3 (11 nov 2026; plan en VENTAS/API-DASHBOARD/fase-3.md): herramientas para leer. Cada una usa la misma función
// que su pantalla y copia su periodo por defecto, sus filtros y sus permisos. Ojo: Funnel y Ranking cuentan el periodo
// con rangoDe (hoy/semana/mes/todo); Finanzas, Agendas y KPIs, con rangoNav (dia/semana/mes/anio + n).

type ConId = { id: string; nombre: string };

// Elige uno de la lista por id o por nombre (sin distinguir mayúsculas). Con dos del mismo nombre, no elige.
export function elegir<T extends ConId>(lista: T[], quien: string, que: string): T {
  const q = quien.trim().toLowerCase();
  const hay = lista.filter((x) => x.id === quien.trim() || x.nombre.trim().toLowerCase() === q);
  if (hay.length === 1) return hay[0];
  if (hay.length > 1) throw new ErrorUsuario(`Hay ${hay.length} con ese nombre (${que}): ${hay.map((x) => `${x.nombre} (${x.id})`).join(", ")}. Di cuál.`);
  throw new ErrorUsuario(`No encuentro ${que} «${quien}». Los que hay: ${lista.map((x) => x.nombre).join(", ") || "ninguno"}.`);
}

// ---------- funnel (KPIs → Funnel; src/app/(panel)/kpis/page.tsx) ----------
export type ArgsFunnel = { periodo?: Periodo; desde?: string; hasta?: string; vendedor?: string; producto?: string };

export async function herramientaFunnel(a: ArgsFunnel) {
  const { perfil, proyecto } = await exigirSeccion("funnel");
  if (!esJefe(perfil)) throw new ErrorUsuario("El Funnel es solo para el CEO y los directores.");
  const zona = proyecto.zona_horaria;
  const rango = rangoDe(a.periodo ?? "mes", zona, a.desde, a.hasta);
  const base = await cargarBase(proyecto);
  const vendedor = a.vendedor ? elegir(base.gente.filter((g) => g.rol === "caller" || g.rol === "closer"), a.vendedor, "vendedor") : null;
  let producto: ConId | null = null;
  if (a.producto) {
    const { data } = await db().from("productos").select("id, nombre").eq("proyecto_id", proyecto.id).order("orden");
    producto = elegir((data ?? []) as ConId[], a.producto, "producto");
  }
  return { pantalla: "KPIs → Funnel", proyecto: proyecto.nombre, periodo: rango.etiqueta, vendedor: vendedor?.nombre ?? "Todo el equipo", producto: producto?.nombre ?? "Todos los productos", ...calcularFunnel(base, rango, vendedor, zona, producto?.id ?? null) };
}

// ---------- ranking (src/app/(panel)/ranking/page.tsx) ----------
export type ArgsRanking = { periodo?: Periodo; desde?: string; hasta?: string };

export async function herramientaRanking(a: ArgsRanking) {
  const { proyecto } = await exigirSeccion("ranking");
  const rango = rangoDe(a.periodo ?? "semana", proyecto.zona_horaria, a.desde, a.hasta);
  const { callers, closers } = calcularKpis(await cargarBase(proyecto), rango, proyecto.zona_horaria);
  const rCallers = [...callers].sort((x, y) => y.agendados - x.agendados || y.cerrados - x.cerrados || y.llamadas - x.llamadas);
  const rClosers = [...closers].sort((x, y) => y.facturacion - x.facturacion || (y.cierreSobreAsistencia ?? 0) - (x.cierreSobreAsistencia ?? 0));
  return {
    pantalla: "Ranking",
    proyecto: proyecto.nombre,
    periodo: rango.etiqueta,
    callers: rCallers.map((c, i) => ({ puesto: i + 1, nombre: c.perfil.nombre, agendados: c.agendados, llamadas: c.llamadas, contactados: c.contactados, cerrados: c.cerrados, lowTicketVentas: c.lowTicketVentas })),
    closers: rClosers.map((c, i) => ({ puesto: i + 1, nombre: c.perfil.nombre, facturacion: c.facturacion, cerradas: c.cerradas, cierreSobreAsistencia: c.cierreSobreAsistencia, asistidas: c.asistidas, noShow: c.noShow })),
  };
}

// ---------- finanzas (Finanzas → Resumen; src/app/(panel)/finanzas/tab-resumen.tsx) ----------
// Como la pantalla, cargarFinanzas prepara antes los plazos de las membresías (asegurarPlazosMensuales): no es solo leer.
export type ArgsNav = { periodo?: PeriodoNav; n?: number; desde?: string; hasta?: string };

export async function herramientaFinanzas(a: ArgsNav) {
  const { proyecto } = await exigirSeccion("finanzas");
  const zona = proyecto.zona_horaria;
  const rango = rangoNav(a.periodo ?? "mes", Math.trunc(a.n ?? 0), zona, a.desde, a.hasta);
  const d = await cargarFinanzas(proyecto.id);
  const r = resumenFinanzas(d, rango, zona);
  const prev = rango.previo ? resumenFinanzas(d, rango.previo, zona) : null;
  const vs = (x: number, y: number | undefined) => (prev && y ? cambio(x, y) : null); // sin periodo anterior, nada (como la pantalla)
  const { porDia, ...cifras } = r;
  return {
    pantalla: "Finanzas → Resumen",
    proyecto: proyecto.nombre,
    moneda: proyecto.moneda,
    periodo: rango.etiqueta,
    ...cifras,
    cobrosPorDia: [...porDia.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([dia, importe]) => ({ dia, importe })),
    cambioVsAnterior: { facturacion: vs(r.facturacion, prev?.facturacion), cash: vs(r.cash, prev?.cash), profit: vs(r.profit, prev?.profit) },
  };
}

// ---------- buscar_leads (CRM) ----------
export type ArgsBuscar = { texto?: string; pais?: string; pipeline?: string; columna?: string; caller?: string | null; closer?: string | null; etiqueta?: string; sinActividadDias?: number; limite?: number };
type LeadFila = { id: string; nombre: string; apellido: string | null; email: string | null; telefono: string | null; pais: string | null; etiquetas: string[] | null; pipeline_id: string | null; etapa_id: string | null; etapa_callers_id: string | null; caller_id: string | null; closer_id: string | null; estado_caller: string; creado_en: string };

// Código del país a partir del código («ES») o del nombre en español («España»); «Sin país» tal cual
function codigoPais(pais: string) {
  const p = pais.trim();
  if (p.toLowerCase() === SIN_PAIS.toLowerCase()) return SIN_PAIS;
  if (/^[a-z]{2}$/i.test(p)) return p.toUpperCase();
  const q = p.toLowerCase();
  for (let i = 0; i < 26 * 26; i++) {
    const c = String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26));
    if (nombrePais(c).toLowerCase() === q) return c;
  }
  throw new ErrorUsuario(`No conozco el país «${pais}». Usa su nombre en español o su código (p. ej. ES).`);
}

export async function herramientaBuscarLeads(a: ArgsBuscar) {
  const { perfil, proyecto } = await exigirSeccion("crm");
  const limite = Math.max(1, Math.min(200, Math.trunc(a.limite ?? 50)));
  const [{ data: pipes }, gente] = await Promise.all([db().from("pipelines").select("*").eq("proyecto_id", proyecto.id).order("orden"), equipo(proyecto.id)]);
  const pipelines = (pipes ?? []) as Pipeline[];
  const filas = await filasPermisoPipeline(pipelines.map((p) => p.id));
  const sinAcceso = new Set(pipelines.filter((p) => calcularNivel(perfil, p, filas) === "sin_acceso").map((p) => p.id));
  const persona = (rol: "caller" | "closer", quien: string) => elegir(gente.filter((g) => g.rol === rol || (rol === "closer" && g.tambien_closer)), quien, rol).id;

  // Pipeline y columna (las tarjetas 🔗 de otro pipeline también cuentan, como en el CRM)
  let pipe: Pipeline | null = null;
  let etapaId: string | null = null;
  let conTarjeta = new Set<string>();
  if (a.pipeline) {
    pipe = elegir(pipelines, a.pipeline, "pipeline");
    if (sinAcceso.has(pipe.id)) throw new ErrorUsuario(`No tienes acceso al pipeline «${pipe.nombre}».`);
    if (pipe.tipo === "closers") throw new ErrorUsuario("En «Closers» hay citas, no leads: usa agenda_citas.");
  }
  if (a.columna) {
    if (!pipe) throw new ErrorUsuario("Para buscar por columna, di también el pipeline.");
    const { data } = await db().from("etapas").select("id, nombre").eq("pipeline_id", pipe.id).order("orden");
    etapaId = elegir((data ?? []) as ConId[], a.columna, "columna").id;
  }
  if (pipe && pipe.tipo === "normal") {
    let q = db().from("tarjetas_extra").select("lead_id").eq("pipeline_id", pipe.id);
    if (etapaId) q = q.eq("etapa_id", etapaId);
    conTarjeta = new Set(((await q).data ?? []).map((t) => t.lead_id as string));
  }

  const pais = a.pais ? codigoPais(a.pais) : null;
  const callerId = a.caller === undefined || a.caller === null ? a.caller : persona("caller", a.caller);
  const closerId = a.closer === undefined || a.closer === null ? a.closer : persona("closer", a.closer);
  const texto = a.texto?.trim().toLowerCase();
  // Para no traer todos los leads: el texto ya filtra en la base (sin los signos que rompen el filtro); después se afina aquí
  const textoBase = texto?.replace(/[,()*%\\]/g, " ").trim();
  const leads = await todas<LeadFila>((x, y) => {
    let q = db().from("leads").select("id, nombre, apellido, email, telefono, pais, etiquetas, pipeline_id, etapa_id, etapa_callers_id, caller_id, closer_id, estado_caller, creado_en").eq("proyecto_id", proyecto.id);
    if (!esJefe(perfil)) q = q.or(`caller_id.eq.${perfil.id},closer_id.eq.${perfil.id}`); // como el CRM: cada uno, los suyos
    if (textoBase && !textoBase.includes(" ")) q = q.or(["nombre", "apellido", "email", "telefono"].map((c) => `${c}.ilike.*${textoBase}*`).join(","));
    if (pais) q = q.eq("pais", pais);
    if (callerId !== undefined) q = callerId === null ? q.is("caller_id", null) : q.eq("caller_id", callerId);
    if (closerId !== undefined) q = closerId === null ? q.is("closer_id", null) : q.eq("closer_id", closerId);
    if (a.etiqueta) q = q.contains("etiquetas", [a.etiqueta.trim()]);
    if (pipe?.tipo === "callers") q = etapaId ? q.eq("etapa_callers_id", etapaId) : q.not("caller_id", "is", null);
    return q.order("creado_en", { ascending: false }).order("id").range(x, y);
  });

  let actividadReciente = new Set<string>();
  if (a.sinActividadDias !== undefined) {
    const desde = new Date(Date.now() - Math.max(0, a.sinActividadDias) * 86_400_000).toISOString();
    const recientes = await todas<{ lead_id: string }>((x, y) => db().from("actividades").select("lead_id").eq("proyecto_id", proyecto.id).gte("creado_en", desde).order("id").range(x, y));
    actividadReciente = new Set(recientes.map((r) => r.lead_id));
  }
  const pasan = leads.filter(
    (l) =>
      !(l.pipeline_id && sinAcceso.has(l.pipeline_id)) &&
      (!pipe || pipe.tipo !== "normal" || (etapaId ? l.etapa_id === etapaId && l.pipeline_id === pipe.id : l.pipeline_id === pipe.id) || conTarjeta.has(l.id)) &&
      (!texto || [`${l.nombre} ${l.apellido ?? ""}`, l.email, l.telefono].some((v) => v?.toLowerCase().includes(texto))) &&
      !actividadReciente.has(l.id)
  );
  const mostrados = pasan.slice(0, limite);

  // Última actividad de los que se enseñan
  const ultima = new Map<string, string>();
  for (let i = 0; i < mostrados.length; i += 100) {
    const { data } = await db().from("actividades").select("lead_id, creado_en").in("lead_id", mostrados.slice(i, i + 100).map((l) => l.id)).order("creado_en", { ascending: false });
    for (const f of data ?? []) if (!ultima.has(f.lead_id)) ultima.set(f.lead_id, f.creado_en);
  }
  const { data: etapas } = await db().from("etapas").select("id, nombre").in("pipeline_id", pipelines.map((p) => p.id));
  const nombre = (lista: ConId[] | null, id: string | null) => (id ? lista?.find((x) => x.id === id)?.nombre ?? null : null);
  return {
    pantalla: "CRM",
    proyecto: proyecto.nombre,
    total: pasan.length,
    mostrados: mostrados.length,
    leads: mostrados.map((l) => ({
      id: l.id,
      nombre: `${l.nombre} ${l.apellido ?? ""}`.trim(),
      email: l.email,
      telefono: l.telefono,
      pais: nombrePais(l.pais),
      pipeline: nombre(pipelines, l.pipeline_id),
      columna: nombre(etapas as ConId[] | null, l.etapa_id),
      caller: nombre(gente, l.caller_id),
      closer: nombre(gente, l.closer_id),
      estado: l.estado_caller,
      etiquetas: l.etiquetas ?? [],
      creado: fechaHora(l.creado_en, proyecto),
      ultimaActividad: ultima.has(l.id) ? fechaHora(ultima.get(l.id)!, proyecto) : null,
    })),
  };
}

// ---------- ficha_lead (ficha del lead) ----------
export async function herramientaFichaLead(a: { leadId: string }) {
  const { proyecto } = await getSesion();
  const r = await resumenLead(a.leadId); // mismo permiso que la ficha: jefe, o su caller o su closer
  if (esError(r)) throw new ErrorUsuario(r.error);
  const id = r.id;
  const [acts, citas, ventas, ghl, analisis, grabaciones, gente] = await Promise.all([
    db().from("actividades").select("tipo, resultado, nota, creado_en, perfil_id").eq("lead_id", id).order("creado_en", { ascending: false }).limit(30),
    db().from("citas").select("fecha, estado, closer_id, canal").eq("lead_id", id).order("fecha", { ascending: false }),
    db().from("ventas").select("fecha, facturacion, cash_collected, devuelto, productos(nombre)").eq("lead_id", id).order("fecha", { ascending: false }),
    db().from("llamadas_ghl").select("fecha, duracion, estado, puntuacion, analisis").eq("lead_id", id).order("fecha", { ascending: false }),
    db().from("analisis_llamadas").select("creado_en, estado, puntuacion, resultado, resumen, closer_id").eq("lead_id", id).order("creado_en", { ascending: false }),
    db().from("grabaciones_caller").select("creado_en, duracion_seg, transcrita_en, perfil_id").eq("lead_id", id).order("creado_en", { ascending: false }),
    equipo(proyecto.id),
  ]);
  // Como la ficha (leads/[id]/page.tsx): quien ya no está sale «—»; una actividad sin persona, «Sistema»
  const quien = (pid: string | null) => (pid ? gente.find((g) => g.id === pid)?.nombre ?? "—" : null);
  const cuando = (iso: string | null) => (iso ? fechaHora(iso, proyecto) : null);
  type Analisis = { resumen?: string; objeciones?: unknown; siguiente_paso?: string } | null;
  return {
    pantalla: "Ficha del lead",
    proyecto: proyecto.nombre,
    ...r,
    pais: nombrePais(r.pais), // la ficha enseña el nombre («Argentina»), no el código
    historial: (acts.data ?? []).map((x) => ({ cuando: cuando(x.creado_en), quien: x.perfil_id ? quien(x.perfil_id) : "Sistema", tipo: x.tipo, resultado: x.resultado, nota: x.nota })),
    citas: (citas.data ?? []).map((x) => ({ fecha: cuando(x.fecha), estado: ETIQUETA_ESTADO_CITA[x.estado] ?? x.estado, closer: quien(x.closer_id), canal: x.canal })),
    ventas: (ventas.data ?? []).map((x) => ({ fecha: cuando(x.fecha), producto: (x.productos as unknown as { nombre: string } | null)?.nombre ?? null, facturacion: Number(x.facturacion), cobradoAlVender: Number(x.cash_collected), devuelto: x.devuelto === null ? null : Number(x.devuelto) })),
    llamadasGhl: (ghl.data ?? []).map((x) => {
      const an = x.analisis as Analisis;
      return { fecha: cuando(x.fecha), minutos: x.duracion ? Math.round(x.duracion / 60) : 0, estado: x.estado, puntuacion: x.puntuacion, resumen: an?.resumen ?? null, objeciones: an?.objeciones ?? null, siguientePaso: an?.siguiente_paso ?? null };
    }),
    analisisCloser: (analisis.data ?? []).map((x) => ({ fecha: cuando(x.creado_en), closer: quien(x.closer_id), estado: x.estado, puntuacion: x.puntuacion, resultado: x.resultado, resumen: x.resumen })),
    grabacionesCaller: (grabaciones.data ?? []).map((x) => ({ fecha: cuando(x.creado_en), caller: quien(x.perfil_id), minutos: Math.round((x.duracion_seg ?? 0) / 60), transcrita: !!x.transcrita_en })),
  };
}

// ---------- agenda_citas (Agendas → Llamadas; src/app/(panel)/closer/llamadas/page.tsx) ----------
export type ArgsAgenda = ArgsNav & { closer?: string; estado?: string; sinResultado?: boolean };

export async function herramientaAgenda(a: ArgsAgenda) {
  const { perfil, proyecto } = await exigirSeccion("agendas");
  const jefe = esJefe(perfil);
  const mirar = perfil.rol === "caller"; // un caller con «Agendas» ve solo las citas que agendó él
  const zona = proyecto.zona_horaria;
  const gente = await equipo(proyecto.id, !!perfil.es_prueba);
  const elegido = a.closer && jefe ? elegir(closersVisibles(perfil, gente, null).todos, a.closer, "closer").id : null;
  const vis = closersVisibles(perfil, gente, elegido);
  const { citas: todasCitas } = await cargarCitasVentas(proyecto.id, vis.ids, mirar ? perfil.id : null, jefe && !elegido);
  const rango = rangoNav(a.periodo ?? "mes", Math.trunc(a.n ?? 0), zona, a.desde, a.hasta);
  const ahora = Date.now();
  const abierta = (e: string) => (ABIERTAS as readonly string[]).includes(e);
  const t = (iso: string) => new Date(iso).getTime();
  // Contadores de la cabecera de la pantalla (pendientes: todas; cerradas y perdidas: desde el día 1 de este mes)
  const mesIni = inicioDia(`${hoyEnZona(zona).slice(0, 8)}01`, zona).getTime();
  const delMes = todasCitas.filter((c) => t(c.fecha) >= mesIni);
  const contadores = { pendientes: todasCitas.filter((c) => abierta(c.estado)).length, cerradasMes: delMes.filter((c) => c.estado === "cerrada").length, perdidasMes: delMes.filter((c) => c.estado === "perdida").length };
  const citas = todasCitas.filter(
    (c) =>
      (!rango.desde || t(c.fecha) >= rango.desde.getTime()) &&
      (!rango.hasta || t(c.fecha) < rango.hasta.getTime()) &&
      (!a.estado || (a.estado === "abiertas" ? abierta(c.estado) : c.estado === a.estado)) &&
      (!a.sinResultado || (abierta(c.estado) && t(c.fecha) < ahora))
  );
  return {
    pantalla: "Agendas → Llamadas",
    proyecto: proyecto.nombre,
    periodo: rango.etiqueta,
    closer: elegido ? gente.find((g) => g.id === elegido)?.nombre : jefe ? "Todos los closers" : perfil.nombre,
    contadores,
    total: citas.length,
    citas: citas.slice(0, 300).map((c) => ({
      id: c.id,
      fecha: fechaHora(c.fecha, proyecto),
      lead: c.leads ? `${c.leads.nombre} ${c.leads.apellido ?? ""}`.trim() : "(sin lead)",
      leadId: c.lead_id,
      closer: c.closer_id ? gente.find((g) => g.id === c.closer_id)?.nombre ?? "—" : "Sin closer", // como Agendas: quien ya no está, «—»
      estado: ETIQUETA_ESTADO_CITA[c.estado] ?? c.estado,
      canal: c.canal ?? null,
    })),
  };
}

// ---------- objetivos (KPIs → Objetivos; src/app/(panel)/kpis/page.tsx, vista «objetivos») ----------
// Fase 7 (Cristian, 11 nov): para el reporte del lunes (alerta: objetivos sin cumplir). `ver` = el avance en esa fecha.
export async function herramientaObjetivos(a: { ver?: string }) {
  const { perfil, proyecto } = await exigirSeccion("kpis");
  if (soloLoSuyo(perfil, "kpis")) throw new ErrorUsuario("Los objetivos del equipo son para el CEO y los directores.");
  const zona = proyecto.zona_horaria;
  const hoy = hoyEnZona(zona);
  const ver = a.ver && /^\d{4}-\d{2}-\d{2}$/.test(a.ver) && a.ver <= hoy ? a.ver : hoy;
  const [base, datos] = await Promise.all([cargarBase(proyecto), cargarObjetivos(proyecto.id)]);
  const personas = base.gente.filter((g) => !("baja" in g && g.baja) && (g.rol === "caller" || g.rol === "closer" || g.rol === "director"));
  const avances = calcularAvances(base, datos, personas, zona, ver);
  const fila = (x: Avance) => ({ cifra: x.cifra, periodo: x.periodo, etiqueta: x.etiqueta, meta: x.meta, hecho: x.hecho, pct: x.pct, dePersona: x.dePersona });
  return {
    pantalla: "KPIs → Objetivos",
    proyecto: proyecto.nombre,
    fecha: ver,
    equipo: avancesDelEquipo(base, datos, zona).map(fila),
    personas: personas.map((p) => ({ nombre: p.nombre, rol: p.rol, avances: (avances.get(p.id) ?? []).map(fila) })).filter((p) => p.avances.length),
  };
}

// ---------- duplicados (CRM → Duplicados; src/app/(panel)/crm/duplicados/page.tsx) ----------
// Para unirlos, la app tiene el botón «Unir» (función unir_leads); el MCP solo los enseña.
export async function herramientaDuplicados() {
  const { perfil, proyecto } = await exigirSeccion("crm");
  if (!esJefe(perfil)) throw new ErrorUsuario("Los duplicados son para el CEO y los directores.");
  const leads = await todas<{ id: string; nombre: string; apellido: string; email: string | null; telefono: string | null; ghl_contact_id: string | null; creado_en: string }>((x, y) =>
    db().from("leads").select("id, nombre, apellido, email, telefono, ghl_contact_id, creado_en").eq("proyecto_id", proyecto.id).not("telefono", "is", null).order("id").range(x, y)
  );
  const grupos = agruparDuplicados(leads);
  return {
    pantalla: "CRM → Duplicados",
    proyecto: proyecto.nombre,
    criterio: "mismo teléfono (últimas 9 cifras)",
    grupos: grupos.length,
    detalle: grupos.map((g) => g.leads.map((l) => ({ id: l.id, nombre: `${l.nombre} ${l.apellido ?? ""}`.trim(), email: l.email, telefono: l.telefono, enGhl: !!l.ghl_contact_id, creado: fechaHora(l.creado_en, proyecto) }))),
  };
}
