"use server";

import { exigirSeccion } from "@/lib/permisos";
import { seguro } from "@/lib/resultado";
import { revalidatePath } from "next/cache";
import { getSesion } from "@/lib/auth";
import { db } from "@/lib/datos";
import { preguntasDe, rolDeReporte, tasasCloser } from "@/lib/reportes";
import { enviarAviso } from "@/lib/avisos";
import { ETIQUETA_ROL, fecha as fmtFecha, hoyEnZona } from "@/lib/formato";
import { urlApp } from "@/lib/email";
import { plantillaEmail } from "@/lib/plantilla-email";

export async function enviarReporte(_prev: unknown, formData: FormData) {
  // Arreglo 30: mismo envoltorio que el resto (lo inesperado no enseña detalles internos)
  return seguro(async () => {
    await exigirSeccion("reportes"); // H5
    const { perfil, proyecto } = await getSesion();
    const rol = rolDeReporte(perfil.rol);
    if (!rol) return { error: "Los reportes de fin de día son para callers y closers." };
    const fecha = String(formData.get("fecha") ?? "") || hoyEnZona(proyecto.zona_horaria);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoyEnZona(proyecto.zona_horaria)) return { error: "Fecha no válida." };

    // Bloque 7: las preguntas de ahora del proyecto (se guardan con el reporte, tal cual)
    const preguntas = preguntasDe(proyecto.preguntas_reporte, rol);
    const respuestas: Record<string, string | number> = {};
    for (const p of preguntas) {
      const v = String(formData.get(p.clave) ?? "").trim();
      if (!v) return { error: `Responde «${p.texto}».` };
      if (p.tipo === "numero") {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0) return { error: `«${p.texto}» tiene que ser un número entero (0 o más).` };
        respuestas[p.clave] = n;
      } else respuestas[p.clave] = v.slice(0, 4000);
    }
    // Arreglo 27 (decisión de Cristian): un reporte por persona y día; si ya lo mandó, el nuevo lo sustituye
    // y el aviso a GHL no se repite.
    const { data: ya } = await db().from("reportes").select("id").eq("proyecto_id", proyecto.id).eq("perfil_id", perfil.id).eq("fecha", fecha).maybeSingle();
    const { error } = await db().from("reportes").upsert({ proyecto_id: proyecto.id, perfil_id: perfil.id, rol, fecha, respuestas, preguntas }, { onConflict: "proyecto_id,perfil_id,fecha" });
    if (error) throw new Error(error.message); // seguro(): lo registra y el usuario ve el mensaje genérico
    if (ya) {
      revalidatePath("/reportes");
      return { ok: "Reporte actualizado: ya habías mandado el de este día, así que se ha sustituido (el aviso no se repite)." };
    }

    // Texto listo para pegar en el email o WhatsApp del workflow de GHL
    const texto = [
      `Reporte de fin de día · ${perfil.nombre} (${rol}) · ${fecha}`,
      ...preguntas.map((p) => `${p.texto.replace(/[¿?]/g, "")}: ${respuestas[p.clave]}`),
      ...(rol === "closer" ? [`Tasa de agendamiento: ${tasasCloser(respuestas).agendamiento} · Tasa de cierre: ${tasasCloser(respuestas).cierre}`] : []),
    ].join("\n");
    // El mismo reporte con el diseño glass de la app (Cristian, 11 oct 2026)
    const html = plantillaEmail({
      urlBase: urlApp(),
      titulo: `Reporte de ${perfil.nombre}`,
      intro: `${ETIQUETA_ROL[rol]} · ${fmtFecha(`${fecha}T12:00:00Z`, proyecto)} · ${proyecto.nombre}`,
      filas: [
        ...preguntas.map((p): [string, string] => [p.texto.replace(/[¿?]/g, ""), String(respuestas[p.clave])]),
        ...(rol === "closer"
          ? ([["Tasa de agendamiento", String(tasasCloser(respuestas).agendamiento)], ["Tasa de cierre", String(tasasCloser(respuestas).cierre)]] as [string, string][])
          : []),
      ],
      boton: { texto: "Ver reportes", url: `${urlApp()}/reportes` },
      pie: "Aviso automático de la app de ventas de Eternity.",
    });
    const aviso = await enviarAviso(proyecto, "reporte_fin_de_dia", {
      texto,
      persona: perfil.nombre,
      rol,
      fecha,
      respuestas: preguntas.map((p) => ({ pregunta: p.texto, respuesta: respuestas[p.clave] })),
      ...(rol === "closer" ? { tasa_agendamiento: tasasCloser(respuestas).agendamiento, tasa_cierre: tasasCloser(respuestas).cierre } : {}),
    }, html);
    revalidatePath("/reportes");
    return {
      ok: aviso.enviado
        ? "Reporte enviado. Tu equipo ya tiene el aviso."
        : `Reporte guardado. (Aviso no enviado: ${aviso.motivo}.)`,
    };
  });
}
