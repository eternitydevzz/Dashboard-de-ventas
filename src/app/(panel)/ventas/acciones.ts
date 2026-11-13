"use server";

import { exigirSeccion } from "@/lib/permisos";
import { ErrorUsuario, notaValida, seguro } from "@/lib/resultado";
import { revalidatePath } from "next/cache";
import { getSesion, esJefe } from "@/lib/auth";
import { db, registrarActividad, escribir } from "@/lib/datos";
import { hoyEnZona, localAIso } from "@/lib/formato";
import { diaEnZona } from "@/lib/llamadas";
import { leerNumero } from "@/lib/numero";

async function ventaPermitida(ventaId: string) {
  const { perfil, proyecto } = await getSesion();
  const { data: venta, error } = await db().from("ventas").select("*").eq("id", ventaId).eq("proyecto_id", proyecto.id).maybeSingle();
  if (error) throw new Error(`No se pudo leer la venta: ${error.message}`); // D43: un fallo no es «no encontrada»
  if (!venta) throw new ErrorUsuario("Venta no encontrada.");
  if (!esJefe(perfil) && venta.vendedor_id !== perfil.id) throw new ErrorUsuario("Esta venta no es tuya.");
  return { venta, perfil, proyecto };
}

const METODOS = ["stripe", "transferencia", "otro"];

// Cobro posterior: una cuota o el resto de una reserva.
// Arreglo 13: se puede poner la fecha real del cobro (por defecto, hoy); ni futura ni anterior a la venta.
export async function registrarCobro(ventaId: string, importeTxt: string, metodo: string, fechaTxt = "") {
  return seguro(async () => {
    await exigirSeccion("ventas", "agendas"); // H5
    const { venta, perfil, proyecto } = await ventaPermitida(ventaId);
    const importe = leerNumero(importeTxt);
    if (!(importe > 0)) throw new ErrorUsuario("El importe tiene que ser mayor que 0.");
    if (!METODOS.includes(metodo)) throw new ErrorUsuario("Elige el método de pago.");
    let fecha = new Date().toISOString();
    if (fechaTxt) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTxt)) throw new ErrorUsuario("Fecha del cobro no válida.");
      if (fechaTxt > hoyEnZona(proyecto.zona_horaria)) throw new ErrorUsuario("La fecha del cobro no puede ser futura.");
      if (fechaTxt < diaEnZona(venta.fecha, proyecto.zona_horaria)) throw new ErrorUsuario("La fecha del cobro no puede ser anterior a la venta.");
      if (fechaTxt !== hoyEnZona(proyecto.zona_horaria)) fecha = localAIso(`${fechaTxt}T12:00`, proyecto.zona_horaria);
    }
    // Ola 6 (C6): la base bloquea la venta, suma lo cobrado y solo entonces guarda: dos cobros a la vez no pasan de lo facturado
    const { error } = await db().rpc("registrar_cobro", { p_proyecto: proyecto.id, p_venta: ventaId, p_importe: importe, p_metodo: metodo, p_registrado_por: perfil.id, p_fecha: fecha });
    if (error?.message.includes("excede_facturacion")) throw new ErrorUsuario("Con ese importe se cobraría más que la facturación.");
    if (error) throw new Error(`No se pudo guardar en «pagos»: ${error.message}`);
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: venta.lead_id, perfil_id: perfil.id, tipo: "venta", resultado: "cobro", nota: `Cobro registrado: ${importe}` });
    revalidatePath("/", "layout");
  });
}

// Devolución (decisión de Cristian, 9 oct 2026): importe y fecha; la comisión ya pagada
// no se descuenta, la asume la empresa. Solo una devolución por venta.
export async function registrarDevolucion(ventaId: string, importeTxt: string, fechaTxt: string, nota: string) {
  return seguro(async () => {
    await exigirSeccion("ventas", "agendas"); // H5
    nota = notaValida(nota);
    const { venta, perfil, proyecto } = await ventaPermitida(ventaId);
    if (!esJefe(perfil)) throw new ErrorUsuario("Solo el director o el CEO registran devoluciones.");
    if (venta.devuelto) throw new ErrorUsuario("Esta venta ya tiene una devolución registrada.");
    const importe = leerNumero(importeTxt);
    if (!(importe > 0)) throw new ErrorUsuario("El importe tiene que ser mayor que 0.");
    const { data: pagos } = await db().from("pagos").select("importe").eq("venta_id", ventaId);
    const cobrado = Number(venta.cash_collected) + (pagos ?? []).reduce((s, p) => s + Number(p.importe), 0);
    if (importe > cobrado + 0.001) throw new ErrorUsuario(`No se puede devolver más de lo cobrado (${cobrado}).`);
    if (fechaTxt && !/^\d{4}-\d{2}-\d{2}$/.test(fechaTxt)) throw new ErrorUsuario("Fecha no válida."); // C9
    const fecha = fechaTxt ? localAIso(`${fechaTxt}T12:00`, proyecto.zona_horaria) : new Date().toISOString();
    // Ola 6 (C6): solo si sigue sin devolución (dos a la vez: la 2.ª no pisa la 1.ª)
    const { data: hecha } = await escribir(db().from("ventas").update({ devuelto: importe, devuelto_en: fecha, devolucion_nota: nota.trim() || null }).eq("id", ventaId).is("devuelto", null).select("id"), "ventas");
    if (!hecha?.length) throw new ErrorUsuario("Esta venta ya tiene una devolución registrada.");
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: venta.lead_id, perfil_id: perfil.id, tipo: "venta", resultado: "devolucion", nota: `Devolución: ${importe}${nota.trim() ? ` · ${nota.trim()}` : ""}` });
    revalidatePath("/", "layout");
  });
}

export async function borrarVenta(ventaId: string) {
  return seguro(async () => {
    await exigirSeccion("ventas", "agendas"); // H5
    const { venta, perfil, proyecto } = await ventaPermitida(ventaId);
    // Paso H6 (Cristian, 10 oct 2026): el closer también puede borrar sus propias ventas (ventaPermitida ya
    // comprueba que es suya); el caller no.
    if (!esJefe(perfil) && perfil.rol !== "closer") throw new ErrorUsuario("Solo el director, el CEO o el closer de la venta pueden borrarla.");
    await escribir(db().from("ventas").delete().eq("id", ventaId), "ventas"); // sus cobros y plazos se borran con ella
    // Arreglo 26 (decisión de Cristian): si al lead no le queda otra venta, la cita que se cerró vuelve a
    // «seguimiento» y el lead deja de estar «vendido» (vuelve a «agendado» si tiene cita; si no, a «nuevo»).
    const { count: otras } = await db().from("ventas").select("id", { count: "exact", head: true }).eq("lead_id", venta.lead_id);
    let citaId: string | null = null;
    if (!otras) {
      const { data: cerrada } = await db().from("citas").select("id").eq("lead_id", venta.lead_id).eq("estado", "cerrada").order("fecha", { ascending: false }).limit(1).maybeSingle();
      if (cerrada) await escribir(db().from("citas").update({ estado: "seguimiento" }).eq("id", cerrada.id), "citas");
      citaId = cerrada?.id ?? null;
      const { count: citas } = await db().from("citas").select("id", { count: "exact", head: true }).eq("lead_id", venta.lead_id);
      await escribir(db().from("leads").update({ estado_caller: citas ? "agendado" : "nuevo" }).eq("id", venta.lead_id), "leads");
    }
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: venta.lead_id, perfil_id: perfil.id, tipo: "nota", nota: "Venta borrada" });
    // Si ese mes ya se calcularon comisiones, hay que recalcularlas (las pagadas no se tocan solas)
    const mes = diaEnZona(venta.fecha, proyecto.zona_horaria).slice(0, 7);
    const { count: liqs } = await db().from("liquidaciones").select("id", { count: "exact", head: true }).eq("proyecto_id", proyecto.id).eq("mes", mes);
    revalidatePath("/", "layout");
    return { aviso: liqs ? `Las comisiones de ${mes} ya estaban calculadas: recalcúlalas en Finanzas → Liquidaciones.` : null, citaId };
  });
}

// Reserva ↔ Cuotas (Paso H6, Cristian 10 oct 2026): cambia la forma de pago y rehace los plazos que faltan.
// Lo ya cobrado después de vender queda como un plazo pagado al principio (los cobros tapan los plazos por fecha).
export async function cambiarFormaPago(ventaId: string, tipo: "reserva" | "cuotas", numCuotasTxt = "") {
  return seguro(async () => {
    await exigirSeccion("ventas", "agendas"); // H5
    const { venta, perfil, proyecto } = await ventaPermitida(ventaId);
    if (tipo !== "reserva" && tipo !== "cuotas") throw new ErrorUsuario("Elige reserva o cuotas.");
    const n = tipo === "cuotas" ? Math.round(leerNumero(numCuotasTxt)) : 1;
    if (tipo === "cuotas" && !(n >= 1 && n <= 60)) throw new ErrorUsuario("Pon de 1 a 60 cuotas para lo que falta.");
    const [{ data: pagos, error: e1 }, { data: vencs, error: e2 }] = await Promise.all([
      db().from("pagos").select("importe").eq("venta_id", ventaId),
      db().from("vencimientos").select("id, importe, estado, numero").eq("venta_id", ventaId),
    ]);
    if (e1 || e2) throw new Error(`No se pudieron leer cobros y plazos: ${(e1 ?? e2)!.message}`);
    const cobradoDespues = (pagos ?? []).reduce((s, p) => s + Number(p.importe), 0);
    const fijos = (vencs ?? []).filter((v) => v.estado !== "pendiente"); // pagados a mano o «no paga»: se quedan
    const redondo = (x: number) => Math.round(x * 100) / 100;
    const total = redondo(Number(venta.facturacion) - Number(venta.cash_collected) - fijos.reduce((s, v) => s + Number(v.importe), 0));
    const falta = redondo(total - cobradoDespues);
    if (falta <= 0.009) throw new ErrorUsuario("Esta venta ya no tiene nada por cobrar.");
    const hoy = hoyEnZona(proyecto.zona_horaria);
    const mas = (meses: number, dias = 0) => {
      const d = new Date(`${hoy}T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + meses);
      d.setUTCDate(d.getUTCDate() + dias);
      return d.toISOString().slice(0, 10);
    };
    let numero = Math.max(0, ...fijos.map((v) => v.numero ?? 0));
    const nuevos: { numero: number; importe: number; vence_el: string }[] = [];
    if (cobradoDespues > 0.009) nuevos.push({ numero: ++numero, importe: redondo(cobradoDespues), vence_el: diaEnZona(venta.fecha, proyecto.zona_horaria) });
    if (tipo === "reserva") nuevos.push({ numero: ++numero, importe: falta, vence_el: mas(0, 30) });
    else {
      const cada = Math.floor((falta / n) * 100) / 100;
      for (let i = 0; i < n; i++) nuevos.push({ numero: ++numero, importe: i === n - 1 ? redondo(falta - cada * (n - 1)) : cada, vence_el: mas(i + 1) });
    }
    // Ola 6 (C6): borrar los pendientes, crear los nuevos y cambiar la venta, todo o nada (antes podía quedarse sin plazos)
    // D43: con los plazos que se quedan (p_fijos); si alguien marcó o desmarcó uno mientras tanto, la base no cambia nada
    const { error } = await db().rpc("cambiar_forma_pago", { p_proyecto: proyecto.id, p_venta: ventaId, p_tipo: tipo, p_num_cuotas: tipo === "cuotas" ? n : null, p_plazos: nuevos, p_fijos: fijos.map((v) => v.id) });
    if (error?.message.includes("plazos_cambiados")) throw new ErrorUsuario("Los plazos de esta venta acaban de cambiar. Recarga la página y vuelve a probar.");
    if (error) throw new Error(`No se pudo guardar en «vencimientos»: ${error.message}`);
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: venta.lead_id, perfil_id: perfil.id, tipo: "venta", resultado: tipo, nota: tipo === "cuotas" ? `Pasa a cuotas: ${n} de lo que falta (${falta})` : `Pasa a reserva: falta ${falta} en un plazo` });
    revalidatePath("/", "layout");
  });
}

// Membresía mensual (bloque A): darla de baja. Deja de generar cobros y se quitan los que aún no vencieron.
export async function darDeBajaMembresia(ventaId: string) {
  return seguro(async () => {
    await exigirSeccion("ventas", "agendas", "finanzas"); // H5
    const { venta, perfil, proyecto } = await ventaPermitida(ventaId);
    if (venta.tipo_pago !== "mensual") throw new ErrorUsuario("Solo las membresías (pago cada mes) se dan de baja.");
    if (venta.baja_en) throw new ErrorUsuario("Esta membresía ya está dada de baja.");
    const hoy = hoyEnZona(proyecto.zona_horaria);
    // D43: solo si sigue de alta (dos bajas a la vez no se pisan) y mirando el error de cada paso
    const { data: baja, error } = await db().from("ventas").update({ baja_en: new Date().toISOString() }).eq("id", ventaId).is("baja_en", null).select("id");
    if (error) throw new Error(`No se pudo guardar en «ventas»: ${error.message}`);
    if (!baja?.length) throw new ErrorUsuario("Esta membresía ya está dada de baja.");
    await escribir(db().from("vencimientos").delete().eq("venta_id", ventaId).eq("estado", "pendiente").gt("vence_el", hoy), "vencimientos");
    await registrarActividad({ proyecto_id: proyecto.id, lead_id: venta.lead_id, perfil_id: perfil.id, tipo: "venta", resultado: "baja", nota: "Membresía dada de baja" });
    revalidatePath("/", "layout");
  });
}
