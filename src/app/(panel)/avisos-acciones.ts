"use server";

import { cookies } from "next/headers";
import { exigir, getSesion } from "@/lib/auth";
import { reporteDia } from "@/lib/avisos-ceo";
import { db, escribir, todas } from "@/lib/datos";
import { hoyEnZona, rangoDe } from "@/lib/formato";
import { mercadoDe } from "@/lib/mercado";
import { leerMercado } from "@/lib/mercado-datos";
import { mensajesCaller, mensajesCloser, textoEntrada, tocaVentana } from "@/lib/mensajes-entrada";
import { numerosCaller, numerosCloser } from "@/lib/mensajes-entrada-datos";
import { enlaceSeguro, toca, vaPara, type Popup, type TarjetaPopup } from "@/lib/popups";
import { seguro } from "@/lib/resultado";

// Bienvenida con mensajes (Cristian, 11 nov 2026): ventana al entrar para callers y closers, con su motivación,
// el recordatorio de grabar y sus felicitaciones, más sus números. Una vez al día; vuelve a salir el mismo día solo si
// llega una felicitación nueva (cookie «día|vistas», como el reporte del CEO: en otro navegador sale otra vez).
export async function mensajesAlEntrar() {
  return seguro(async () => {
    const { perfil, proyecto } = await exigir(["caller", "closer"]);
    const zona = proyecto.zona_horaria;
    const caller = perfil.rol === "caller";
    const numeros = caller ? await numerosCaller(perfil.id, proyecto.id, zona) : await numerosCloser(perfil.id, proyecto.id, zona);
    const mensajes = "llamadasHoy" in numeros ? mensajesCaller(numeros) : mensajesCloser(numeros);
    const jar = await cookies();
    const nombre = `eternity_mensajes_${perfil.id}_${proyecto.id}`;
    const { toca, nuevaCookie } = tocaVentana(jar.get(nombre)?.value, hoyEnZona(zona), mensajes);
    if (!toca) return null;
    jar.set(nombre, nuevaCookie, { path: "/", maxAge: 60 * 60 * 24 * 2, sameSite: "lax" });
    // Fase 3: los textos cambiados en Administración → Popups (o los de siempre)
    const datos = { nombre: perfil.nombre.split(" ")[0] };
    return { rol: perfil.rol, mensajes, numeros, textos: mensajes.map((k) => textoEntrada(k, proyecto.textos_entrada, datos)) };
  });
}

// Plan GHL F1b (Cristian, 8 nov 2026): el reporte del día anterior sale solo al CEO y una vez al día por persona y proyecto (1.7, 9 nov).
// Sin tabla nueva: el día ya enseñado se apunta en una cookie del navegador (una por persona). Límite conocido:
// en otro navegador u ordenador vuelve a salir una vez.
export async function reporteAlEntrar() {
  return seguro(async () => {
    const { perfil, proyecto } = await exigir((p) => p.rol === "ceo"); // solo CEO, también aquí en el servidor
    const reporte = await reporteDia(proyecto.id, new Date());
    const jar = await cookies();
    const nombre = `eternity_reporte_${perfil.id}_${proyecto.id}`; // por proyecto: cada uno tiene su reporte
    if (jar.get(nombre)?.value === reporte.dia) return null;
    jar.set(nombre, reporte.dia, { path: "/", maxAge: 60 * 60 * 24 * 2, sameSite: "lax" });
    const [a, m, d] = reporte.dia.split("-");
    return { ...reporte, ...textoEntrada("reporte", proyecto.textos_entrada, { dia: `${d}/${m}/${a}`, leads: reporte.leads, agendas: reporte.agendas }) };
  });
}

// Fase 3 (Cristian, 13 nov 2026): los popups de Administración que le tocan a esta persona según su regla, más sus
// avisos_persona sin ver. Al entrar, todos (`soloNuevos` = false); cada 60 s con la app a la vista, solo lo que no espera
// (avisos y popups «lanzar ahora»): el tiempo real está apagado porque saturó la base. 3 consultas pequeñas por vez.
const CAMPOS_POPUP = "id, titulo, texto, imagen, boton_texto, boton_enlace, roles, personas, mercados, frecuencia, cada_horas, lanzado_en, activo, creado_en, popups_vistos(visto_en)";
export async function popupsParaMi(soloNuevos: boolean) {
  return seguro(async (): Promise<TarjetaPopup[]> => {
    const { perfil, proyecto } = await getSesion(); // todos los roles, también el director
    const [popups, avisos, mercado] = await Promise.all([
      todas<Popup & { popups_vistos: { visto_en: string }[] }>((desde, hasta) => {
        // solo la fila de «visto» de esta persona (filtro sobre la tabla unida)
        const q = db().from("popups").select(CAMPOS_POPUP).eq("proyecto_id", proyecto.id).eq("activo", true).eq("popups_vistos.perfil_id", perfil.id);
        return (soloNuevos ? q.eq("frecuencia", "ahora") : q).order("id").range(desde, hasta);
      }),
      todas<{ id: string; titulo: string; texto: string; enlace: string | null }>((desde, hasta) =>
        db().from("avisos_persona").select("id, titulo, texto, enlace").eq("proyecto_id", proyecto.id).eq("perfil_id", perfil.id).is("visto_en", null).order("creado_en").order("id").range(desde, hasta)
      ),
      leerMercado(proyecto.id, perfil.id),
    ]);
    const ahora = new Date();
    const lunes = rangoDe("semana", proyecto.zona_horaria).desde ?? ahora;
    const quien = { id: perfil.id, rol: perfil.rol, mercado: mercadoDe(mercado) };
    return [
      ...avisos.map((a): TarjetaPopup => {
        const enlace = enlaceSeguro(a.enlace);
        return { id: a.id, origen: "aviso", frecuencia: null, titulo: a.titulo, texto: a.texto, imagen: null, boton: enlace ? { texto: "Abrir", enlace } : null };
      }),
      ...popups
        .filter((p) => vaPara(p, quien) && toca(p, p.popups_vistos[0]?.visto_en ?? null, ahora, lunes))
        .map((p): TarjetaPopup => ({ id: p.id, origen: "popup", frecuencia: p.frecuencia, titulo: p.titulo, texto: p.texto, imagen: p.imagen, boton: p.boton_enlace ? { texto: p.boton_texto ?? "Ver más", enlace: p.boton_enlace } : null })),
    ];
  });
}

// Al cerrar la ventana: popups vistos (cuenta para «cada X horas», «semana» y «ahora») y avisos vistos
const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 100) : []);
export async function marcarVistos(popups: unknown, avisos: unknown) {
  return seguro(async () => {
    const { perfil, proyecto } = await getSesion();
    const [p, a] = [ids(popups), ids(avisos)];
    const visto_en = new Date().toISOString();
    if (p.length) {
      // solo los popups de este proyecto
      const { data, error } = await db().from("popups").select("id").eq("proyecto_id", proyecto.id).in("id", p).order("id");
      if (error) throw new Error(`popups vistos: ${error.message}`);
      if (data.length) await escribir(db().from("popups_vistos").upsert(data.map((x) => ({ popup_id: x.id, perfil_id: perfil.id, visto_en }))), "popups_vistos");
    }
    if (a.length) await escribir(db().from("avisos_persona").update({ visto_en }).eq("perfil_id", perfil.id).in("id", a).is("visto_en", null), "avisos_persona");
  });
}
