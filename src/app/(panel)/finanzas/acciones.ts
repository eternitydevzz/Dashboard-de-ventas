"use server";

import { revalidatePath } from "next/cache";
import { ErrorUsuario, seguro } from "@/lib/resultado";
import { db, todas, equipo, conBajas, escribir } from "@/lib/datos";
import { exigirSeccion } from "@/lib/permisos";
import { exigirNoEsPropia } from "@/lib/auth";
import { inicioDia, localAIso } from "@/lib/formato";
import { cargarFinanzas } from "@/lib/finanzas-datos";
import { liquidacionesMes, type CitaL, type PersonaL } from "@/lib/finanzas";
import { cargarEquipo } from "@/lib/equipo";
import { modoComision, tramosDe, type ComisionProducto } from "@/lib/comisiones";
import { leerNumero } from "@/lib/numero";

const refrescar = () => revalidatePath("/", "layout");
const METODOS = ["stripe", "transferencia", "otro"];

function importe(txt: string) {
  const v = leerNumero(txt);
  if (!(v > 0) || v > 1e9) throw new ErrorUsuario("El importe tiene que ser mayor que 0.");
  return Math.round(v * 100) / 100;
}
async function delProyecto(tabla: "cuentas" | "categorias_finanzas" | "movimientos" | "egresos_programados" | "vencimientos" | "liquidaciones", id: string | null | undefined, proyectoId: string) {
  if (!id) return;
  const { data } = await db().from(tabla).select("id").eq("id", id).eq("proyecto_id", proyectoId).maybeSingle();
  if (!data) throw new ErrorUsuario("Ese dato no es de este proyecto.");
}
const fechaIso = (txt: string, zona: string) => (txt ? localAIso(`${txt}T12:00`, zona) : new Date().toISOString());

// ---------- Ingresos extra y gastos ----------
export async function crearMovimiento(m: { tipo: "ingreso" | "egreso"; importe: string; fecha: string; categoria_id: string | null; cuenta_id: string | null; descripcion: string }) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirSeccion("finanzas");
    if (m.tipo !== "ingreso" && m.tipo !== "egreso") throw new ErrorUsuario("Tipo no válido.");
    await delProyecto("categorias_finanzas", m.categoria_id, proyecto.id);
    await delProyecto("cuentas", m.cuenta_id, proyecto.id);
    await escribir(db().from("movimientos").insert({ proyecto_id: proyecto.id, tipo: m.tipo, importe: importe(m.importe), fecha: fechaIso(m.fecha, proyecto.zona_horaria), categoria_id: m.categoria_id, cuenta_id: m.cuenta_id, descripcion: m.descripcion.trim() || null, creado_por: perfil.id }), "movimientos");
    refrescar();
  });
}

export async function borrarMovimiento(id: string) {
  return seguro(async () => {
    const { proyecto } = await exigirSeccion("finanzas");
    await delProyecto("movimientos", id, proyecto.id);
    const { data: liq } = await db().from("liquidaciones").select("id").eq("movimiento_id", id).maybeSingle();
    if (liq) throw new ErrorUsuario("Este gasto es el pago de una liquidación: desmárcala como pagada en Liquidaciones.");
    await escribir(db().from("movimientos").delete().eq("id", id), "movimientos");
    refrescar();
  });
}

export async function transferir(origen: string, destino: string, importeTxt: string, fecha: string, descripcion: string) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirSeccion("finanzas");
    if (!origen || !destino || origen === destino) throw new ErrorUsuario("Elige dos cuentas distintas.");
    await delProyecto("cuentas", origen, proyecto.id);
    await delProyecto("cuentas", destino, proyecto.id);
    await escribir(db().from("movimientos").insert({ proyecto_id: proyecto.id, tipo: "transferencia", cuenta_id: origen, cuenta_destino_id: destino, importe: importe(importeTxt), fecha: fechaIso(fecha, proyecto.zona_horaria), descripcion: descripcion.trim() || null, creado_por: perfil.id }), "movimientos");
    refrescar();
  });
}

// ---------- Cuentas y categorías ----------
export async function guardarCuenta(id: string | null, nombre: string, metodos: string[]) {
  return seguro(async () => {
    const { proyecto } = await exigirSeccion("finanzas");
    if (!nombre.trim()) throw new ErrorUsuario("Pon un nombre a la cuenta.");
    const ms = metodos.filter((m) => METODOS.includes(m));
    // Un método solo puede ir a una cuenta
    const { data: otras } = await db().from("cuentas").select("id, nombre, metodos").eq("proyecto_id", proyecto.id);
    for (const o of otras ?? []) if (o.id !== id) for (const m of ms) if ((o.metodos ?? []).includes(m)) throw new ErrorUsuario(`El método «${m}» ya va a la cuenta «${o.nombre}».`);
    if (id) {
      await delProyecto("cuentas", id, proyecto.id);
      await escribir(db().from("cuentas").update({ nombre: nombre.trim(), metodos: ms }).eq("id", id), "cuentas");
    } else await db().from("cuentas").insert({ proyecto_id: proyecto.id, nombre: nombre.trim(), metodos: ms });
    refrescar();
  });
}

export async function guardarCategoria(id: string | null, tipo: "ingreso" | "egreso", nombre: string, enProfit: boolean) {
  return seguro(async () => {
    const { proyecto } = await exigirSeccion("finanzas");
    if (!nombre.trim()) throw new ErrorUsuario("Pon un nombre.");
    if (tipo !== "ingreso" && tipo !== "egreso") throw new ErrorUsuario("Tipo no válido.");
    if (id) {
      await delProyecto("categorias_finanzas", id, proyecto.id);
      await escribir(db().from("categorias_finanzas").update({ nombre: nombre.trim(), en_profit: enProfit }).eq("id", id), "categorias_finanzas");
    } else {
      const { error } = await db().from("categorias_finanzas").insert({ proyecto_id: proyecto.id, tipo, nombre: nombre.trim(), en_profit: enProfit });
      if (error) throw new ErrorUsuario(error.code === "23505" ? "Ya existe esa categoría." : error.message);
    }
    refrescar();
  });
}

// C9: un update condicionado al estado leído. Si no cambió ninguna fila (otro lo hizo a la vez) o falló, se borra el
// movimiento que se acababa de crear para él, y se avisa
async function soloSiSigue(peticion: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, movimiento: string | null | undefined, aviso: string) {
  const { data, error } = await peticion;
  if (!error && data?.length) return;
  if (movimiento) await db().from("movimientos").delete().eq("id", movimiento);
  if (error) throw new Error(`No se pudo guardar: ${error.message}`);
  throw new ErrorUsuario(aviso);
}

// ---------- Gastos programados ----------
export async function crearProgramado(p: { descripcion: string; importe: string; categoria_id: string | null; cuenta_id: string | null; cada: "semana" | "mes" | "anio"; proxima: string }) {
  return seguro(async () => {
    const { proyecto } = await exigirSeccion("finanzas");
    if (!p.descripcion.trim()) throw new ErrorUsuario("Describe el gasto.");
    if (!["semana", "mes", "anio"].includes(p.cada)) throw new ErrorUsuario("Frecuencia no válida.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.proxima)) throw new ErrorUsuario("Elige la fecha del próximo pago.");
    await delProyecto("categorias_finanzas", p.categoria_id, proyecto.id);
    await delProyecto("cuentas", p.cuenta_id, proyecto.id);
    await escribir(db().from("egresos_programados").insert({ proyecto_id: proyecto.id, descripcion: p.descripcion.trim(), importe: importe(p.importe), categoria_id: p.categoria_id, cuenta_id: p.cuenta_id, cada: p.cada, proxima: p.proxima }), "egresos_programados");
    refrescar();
  });
}

// Registra el pago de un gasto programado y pasa al siguiente
export async function registrarProgramado(id: string) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirSeccion("finanzas");
    await delProyecto("egresos_programados", id, proyecto.id);
    const { data: p } = await db().from("egresos_programados").select("*").eq("id", id).single();
    const { data: mov } = await escribir(db().from("movimientos").insert({ proyecto_id: proyecto.id, tipo: "egreso", importe: p.importe, fecha: localAIso(`${p.proxima}T12:00`, proyecto.zona_horaria), categoria_id: p.categoria_id, cuenta_id: p.cuenta_id, descripcion: p.descripcion, origen: "programado", creado_por: perfil.id }).select("id").single(), "movimientos");
    const d = new Date(`${p.proxima}T12:00:00Z`);
    if (p.cada === "semana") d.setUTCDate(d.getUTCDate() + 7);
    else if (p.cada === "anio") d.setUTCFullYear(d.getUTCFullYear() + 1);
    else d.setUTCMonth(d.getUTCMonth() + 1);
    // C9: solo si nadie lo registró a la vez (doble clic); si no, se quita el gasto que se acaba de crear
    await soloSiSigue(db().from("egresos_programados").update({ proxima: d.toISOString().slice(0, 10) }).eq("id", id).eq("proxima", p.proxima).select("id"), mov?.id, "Ese pago ya se registró. Recarga la página.");
    refrescar();
  });
}

export async function borrarProgramado(id: string) {
  return seguro(async () => {
    const { proyecto } = await exigirSeccion("finanzas");
    await delProyecto("egresos_programados", id, proyecto.id);
    await escribir(db().from("egresos_programados").delete().eq("id", id), "egresos_programados");
    refrescar();
  });
}

// ---------- Pagos pendientes ----------
export async function nuevoDeudor(nombre: string, importeTxt: string, venceEl: string) {
  return seguro(async () => {
    const { proyecto } = await exigirSeccion("finanzas");
    if (!nombre.trim()) throw new ErrorUsuario("¿Quién debe el dinero?");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(venceEl)) throw new ErrorUsuario("Elige cuándo vence.");
    await escribir(db().from("vencimientos").insert({ proyecto_id: proyecto.id, nombre: nombre.trim(), importe: importe(importeTxt), vence_el: venceEl }), "vencimientos");
    refrescar();
  });
}

export async function marcarVencimiento(id: string, estado: "pendiente" | "pagado" | "no_paga") {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirSeccion("finanzas");
    await delProyecto("vencimientos", id, proyecto.id);
    const { data: v } = await db().from("vencimientos").select("*").eq("id", id).single();
    if (estado === "pagado" && v.venta_id) throw new ErrorUsuario("Los plazos de una venta se pagan registrando el cobro de la venta («Cobro»).");
    if (!["pendiente", "pagado", "no_paga"].includes(estado)) throw new ErrorUsuario("Estado no válido.");
    // Arreglo 33: deshacer un «cobrado» por error → vuelve a pendiente y se borra el ingreso que creó
    if (v.estado === "pagado" && estado !== "pagado") {
      if (v.movimiento_id) await escribir(db().from("movimientos").delete().eq("id", v.movimiento_id), "movimientos");
      await escribir(db().from("vencimientos").update({ estado, pagado_en: null, movimiento_id: null }).eq("id", id), "vencimientos");
      refrescar();
      return;
    }
    // C9: solo si sigue como se leyó (un doble clic en «Cobrado» creaba 2 ingresos)
    await soloSiSigue(db().from("vencimientos").update({ estado, pagado_en: estado === "pagado" ? new Date().toISOString() : null }).eq("id", id).eq("estado", v.estado).select("id"), null, "Este pago acaba de cambiar. Recarga la página.");
    // Un deudor puesto a mano que paga: entra como ingreso (y se guarda cuál, para poder deshacerlo)
    if (estado === "pagado" && v.estado !== "pagado") {
      const { data: cat } = await db().from("categorias_finanzas").select("id").eq("proyecto_id", proyecto.id).eq("tipo", "ingreso").order("nombre").limit(1).maybeSingle();
      const { data: mov } = await escribir(db().from("movimientos").insert({ proyecto_id: proyecto.id, tipo: "ingreso", importe: v.importe, categoria_id: cat?.id ?? null, descripcion: `Cobro de ${v.nombre ?? "deudor"}`, creado_por: perfil.id }).select("id").single(), "movimientos");
      await escribir(db().from("vencimientos").update({ movimiento_id: mov?.id ?? null }).eq("id", id), "vencimientos");
    }
    refrescar();
  });
}

export async function cambiarVencimiento(id: string, venceEl: string) {
  return seguro(async () => {
    const { proyecto } = await exigirSeccion("finanzas");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(venceEl)) throw new ErrorUsuario("Fecha no válida.");
    await delProyecto("vencimientos", id, proyecto.id);
    await escribir(db().from("vencimientos").update({ vence_el: venceEl }).eq("id", id), "vencimientos");
    refrescar();
  });
}

// ---------- Movimientos del banco (CSV) y conciliación ----------
// Columnas: fecha (AAAA-MM-DD o DD/MM/AAAA), descripcion, importe (negativo = gasto)
export async function importarMovimientos(texto: string, cuentaId: string | null) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirSeccion("finanzas");
    await delProyecto("cuentas", cuentaId, proyecto.id);
    const { default: Papa } = await import("papaparse");
    const res = Papa.parse<Record<string, string>>(texto.replace(/^﻿/, ""), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") });
    if (!res.data.length) throw new ErrorUsuario("El CSV está vacío.");
    if (res.data.length > 5000) throw new ErrorUsuario("Como mucho 5.000 movimientos por archivo.");
    const filas: Record<string, unknown>[] = [];
    const fallos: string[] = [];
    res.data.forEach((f, i) => {
      const t = (f.fecha ?? "").trim();
      const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/) ?? t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      const ymd = m ? (m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2]}-${m[1]}`) : null;
      const v = leerNumero(f.importe);
      if (!ymd || !Number.isFinite(v) || v === 0) {
        fallos.push(`Fila ${i + 2}: fecha o importe no válidos`);
        return;
      }
      filas.push({ proyecto_id: proyecto.id, tipo: v > 0 ? "ingreso" : "egreso", importe: Math.abs(Math.round(v * 100) / 100), fecha: localAIso(`${ymd}T12:00`, proyecto.zona_horaria), descripcion: (f.descripcion ?? f.concepto ?? "").trim() || null, cuenta_id: cuentaId, origen: "importado", conciliado: false, creado_por: perfil.id });
    });
    if (filas.length) await escribir(db().from("movimientos").insert(filas), "movimientos");
    refrescar();
    return { importados: filas.length, fallos };
  });
}

export async function conciliarMovimiento(id: string, categoriaId: string | null) {
  return seguro(async () => {
    const { proyecto } = await exigirSeccion("finanzas");
    await delProyecto("movimientos", id, proyecto.id);
    await delProyecto("categorias_finanzas", categoriaId, proyecto.id);
    await escribir(db().from("movimientos").update({ conciliado: true, categoria_id: categoriaId }).eq("id", id), "movimientos");
    refrescar();
  });
}

// ---------- Liquidaciones ----------
// «Calcular comisiones a todos» del mes: rehace las pendientes; las pagadas no se tocan.
export async function calcularLiquidaciones(mes: string) {
  return seguro(async () => {
    const { proyecto } = await exigirSeccion("finanzas");
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new ErrorUsuario("Mes no válido.");
    const sig = new Date(`${mes}-01T12:00:00Z`);
    sig.setUTCMonth(sig.getUTCMonth() + 1);
    const rango = { desde: inicioDia(`${mes}-01`, proyecto.zona_horaria), hasta: inicioDia(sig.toISOString().slice(0, 10), proyecto.zona_horaria) };
    const [f, eq, gente, citas] = await Promise.all([
      cargarFinanzas(proyecto.id),
      cargarEquipo(proyecto.id),
      equipo(proyecto.id),
      todas<CitaL>((a, b) => db().from("citas").select("lead_id, closer_id, agendada_por, estado, fecha").eq("proyecto_id", proyecto.id).eq("estado", "cerrada").order("id").range(a, b)),
    ]);
    // Arreglo 10: también quien ya no está pero vendió o agendó (cobra lo que ganó ese mes)
    const todos = await conBajas(gente, [...f.ventas.map((v) => v.vendedor_id), ...citas.flatMap((c) => [c.closer_id, c.agendada_por])]);
    // Bloque 4: tramos del proyecto, quién va por tramos y qué productos no cuentan para comisión
    const personas: PersonaL[] = todos.map((g) => {
      const m = eq.miembros.find((x) => x.perfil_id === g.id);
      return { perfil_id: g.id, nombre: g.nombre, rol: g.rol, comision: m?.comision ?? null, modo: modoComision(g.rol, m?.comision_modo) };
    });
    const productos = new Map(f.productos.map((p) => [p.id, (p.comisiones ?? null) as ComisionProducto]));
    const sinComision = new Set(f.productos.filter((p) => p.cuenta_comision === false).map((p) => p.id));
    const res = liquidacionesMes({ ventas: f.ventas, pagos: f.pagos, citas, personas, comisionesRol: eq.comisionesRol, productos, mes: rango, tramos: tramosDe(proyecto.tramos_comision), sinComision, zona: proyecto.zona_horaria });
    const { data: yaPagadas } = await db().from("liquidaciones").select("perfil_id").eq("proyecto_id", proyecto.id).eq("mes", mes).eq("estado", "pagada");
    const pagadas = new Set((yaPagadas ?? []).map((x) => x.perfil_id));
    const filas = res.filter((r) => !pagadas.has(r.perfil_id)).map((r) => ({ proyecto_id: proyecto.id, mes, ...r, estado: "pendiente", calculada_en: new Date().toISOString() }));
    // C9: primero se guardan las nuevas (encima de las pendientes, misma persona y mes) y después se borran las
    // pendientes de quien ya no sale; antes se borraban primero y, si fallaba guardar, el mes se quedaba sin ninguna
    if (filas.length) await escribir(db().from("liquidaciones").upsert(filas, { onConflict: "proyecto_id,perfil_id,mes" }), "liquidaciones");
    let sobran = db().from("liquidaciones").delete().eq("proyecto_id", proyecto.id).eq("mes", mes).eq("estado", "pendiente");
    if (filas.length) sobran = sobran.not("perfil_id", "in", `(${filas.map((f) => f.perfil_id).join(",")})`);
    await escribir(sobran, "liquidaciones");
    refrescar();
    return { personas: filas.length, total: filas.reduce((s, r) => s + r.comision_cobrado, 0), yaPagadas: pagadas.size };
  });
}

export async function pagarLiquidacion(id: string, cuentaId: string | null) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirSeccion("finanzas");
    await delProyecto("liquidaciones", id, proyecto.id);
    await delProyecto("cuentas", cuentaId, proyecto.id);
    const { data: l } = await db().from("liquidaciones").select("*, perfiles(nombre)").eq("id", id).single();
    if (l.estado === "pagada") throw new ErrorUsuario("Ya está pagada.");
    exigirNoEsPropia(perfil, l.perfil_id, "marcar como pagada");
    let movimiento: string | null = null;
    if (Number(l.comision_cobrado) > 0) {
      const { data: cat } = await db().from("categorias_finanzas").select("id").eq("proyecto_id", proyecto.id).eq("tipo", "egreso").eq("nombre", "Comisiones").maybeSingle();
      const { data: m } = await escribir(db().from("movimientos").insert({ proyecto_id: proyecto.id, tipo: "egreso", importe: l.comision_cobrado, categoria_id: cat?.id ?? null, cuenta_id: cuentaId, descripcion: `Comisiones ${l.mes} · ${(l.perfiles as { nombre: string } | null)?.nombre ?? ""}`, origen: "liquidacion", creado_por: perfil.id }).select("id").single(), "movimientos");
      movimiento = m?.id ?? null;
    }
    // C9: solo si sigue pendiente (otra persona pudo pagarla a la vez)
    await soloSiSigue(db().from("liquidaciones").update({ estado: "pagada", pagada_en: new Date().toISOString(), movimiento_id: movimiento }).eq("id", id).eq("estado", "pendiente").select("id"), movimiento, "Ya está pagada.");
    refrescar();
  });
}

export async function desmarcarLiquidacion(id: string) {
  return seguro(async () => {
    const { perfil, proyecto } = await exigirSeccion("finanzas");
    await delProyecto("liquidaciones", id, proyecto.id);
    const { data: l } = await db().from("liquidaciones").select("movimiento_id, perfil_id").eq("id", id).single();
    exigirNoEsPropia(perfil, l?.perfil_id ?? null, "desmarcar");
    await escribir(db().from("liquidaciones").update({ estado: "pendiente", pagada_en: null, movimiento_id: null }).eq("id", id), "liquidaciones");
    if (l?.movimiento_id) await db().from("movimientos").delete().eq("id", l.movimiento_id);
    refrescar();
  });
}

// ---------- Divisas ----------
export async function guardarTipoCambio(porUsdTxt: string) {
  return seguro(async () => {
    const { proyecto } = await exigirSeccion("finanzas");
    const v = leerNumero(porUsdTxt);
    if (!(v > 0) || v > 1000) throw new ErrorUsuario("Pon cuántos euros son 1 dólar (por ejemplo 0,92).");
    await escribir(db().from("tipos_cambio").upsert({ proyecto_id: proyecto.id, moneda: "EUR", por_usd: v, actualizado_en: new Date().toISOString() }), "tipos_cambio");
    refrescar();
  });
}
