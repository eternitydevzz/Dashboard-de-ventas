"use server";

import { exigirSeccion } from "@/lib/permisos";
import { ErrorUsuario, seguro } from "@/lib/resultado";
import { revalidatePath } from "next/cache";
import { olvidarTodo } from "@/lib/memoria";
import { exigir, puedeRecursos } from "@/lib/auth";
import { db, escribir } from "@/lib/datos";
import { borrarSubida, leerSubida, prepararSubida } from "@/lib/subidas";
import { esHttps, linksValidos, type LinkPago } from "@/lib/links-pago";
import { contenidoMercado, mercadoValido, type Mercado } from "@/lib/mercado";
import { miMercado } from "@/lib/mercado-datos";
import { recursosVisibles } from "@/lib/recursos";
import { dinero } from "@/lib/formato";
import type { Producto, Recurso } from "@/lib/tipos";

// Popup «Recursos» del guion (Cristian, 10 nov): lo mismo que la página /recursos, solo para leer y copiar
export type RecursosLlamada = {
  productos: { id: string; nombre: string; precio: string; dossier: string | null; links: LinkPago[] }[];
  reserva: string | null;
  recursos: { id: string; titulo: string; tipo: Recurso["tipo"]; href: string | null; contenido: string | null }[];
};
export async function recursosLlamada() {
  return seguro(async (): Promise<RecursosLlamada> => {
    const { perfil, proyecto } = await exigirSeccion("recursos");
    const editor = puedeRecursos(perfil);
    const [{ data: productos }, { data: recursosData }, mercado] = await Promise.all([
      db().from("productos").select("*").eq("proyecto_id", proyecto.id).eq("activo", true).order("orden"),
      db().from("recursos").select("*").eq("proyecto_id", proyecto.id).order("creado_en", { ascending: false }),
      miMercado(proyecto.id, perfil.id),
    ]);
    const c = contenidoMercado(mercado); // 13 nov: lo de su mercado (en la llamada, también los jefes)
    const recursos = recursosVisibles(c.filas((recursosData ?? []) as Recurso[]), perfil);
    // Enlaces firmados (1 hora) para los PDF privados, como en la página
    const firmados = new Map<string, string>();
    const pdfs = recursos.filter((r) => r.archivo_path).map((r) => r.archivo_path!);
    if (pdfs.length) {
      const { data } = await db().storage.from("recursos").createSignedUrls(pdfs, 3600);
      data?.forEach((d) => d.signedUrl && d.path && firmados.set(d.path, d.signedUrl));
    }
    return {
      productos: ((productos ?? []) as Producto[])
        .filter((p) => editor || perfil.rol !== "caller" || p.vende_caller)
        .map((p) => ({ id: p.id, nombre: p.nombre, precio: p.precio ? dinero(Number(p.precio), { moneda: c.moneda(proyecto) }) : "Precio personalizado", dossier: p.link_dossier ?? null, links: c.linksPago(p) })),
      reserva: c.linkReserva(proyecto),
      recursos: recursos.map((r) => ({ id: r.id, titulo: r.titulo, tipo: r.tipo, href: r.archivo_path ? (firmados.get(r.archivo_path) ?? null) : (r.url ?? null), contenido: r.tipo === "guion" ? (r.contenido ?? "") : null })),
    };
  });
}

const TIPOS = ["pdf", "enlace", "guion", "video"] as const;
const ROLES = ["todos", "caller", "closer"] as const;

function urlValida(u: string) {
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:";
  } catch {
    return false;
  }
}

// Enlace firmado para que el navegador suba el PDF directo a Supabase (sin pasar por Vercel)
export async function prepararSubidaPdf() {
  return seguro(async () => {
    await exigirSeccion("recursos"); // H5
    const { proyecto } = await exigir(puedeRecursos);
    return prepararSubida("recursos", proyecto.id);
  });
}

export async function crearRecurso(_prev: unknown, formData: FormData) {
  // Arreglo 30: mismo envoltorio que el resto (lo inesperado no enseña detalles internos)
  return seguro(async () => {
    await exigirSeccion("recursos"); // H5
    const { perfil, proyecto } = await exigir(puedeRecursos);
    const titulo = String(formData.get("titulo") ?? "").trim();
    const tipo = String(formData.get("tipo")) as (typeof TIPOS)[number];
    const paraRol = String(formData.get("para_rol") ?? "todos") as (typeof ROLES)[number];
    if (!titulo) return { error: "Pon un título." };
    if (!TIPOS.includes(tipo) || !ROLES.includes(paraRol)) return { error: "Tipo no válido." };

    const fila: Record<string, unknown> = { proyecto_id: proyecto.id, titulo, tipo, para_rol: paraRol, creado_por: perfil.id };
    if (formData.get("mercado") === "es") fila.mercado = "es"; // 13 nov: subido mirando España
    if (tipo === "guion") {
      const contenido = String(formData.get("contenido") ?? "").trim();
      if (!contenido) return { error: "Escribe el guion." };
      fila.contenido = contenido;
    } else if (tipo === "pdf") {
      // El navegador ya lo subió directo a Supabase (prepararSubidaPdf); aquí llega solo la ruta
      const ruta = String(formData.get("archivo_ruta") ?? "");
      if (!ruta) return { error: "Elige un PDF." };
      const { count } = await db().from("recursos").select("id", { count: "exact", head: true }).eq("archivo_path", ruta);
      if (count) return { error: "Ese archivo ya está guardado. Vuelve a elegirlo." };
      const archivo = await leerSubida("recursos", ruta, proyecto.id);
      // El tipo lo dice el navegador y se puede falsear: se comprueba que el archivo empieza como un PDF de verdad
      const cabecera = new TextDecoder().decode(new Uint8Array(await archivo.slice(0, 5).arrayBuffer()));
      if (cabecera !== "%PDF-") {
        await borrarSubida("recursos", ruta);
        return { error: "El archivo no es un PDF válido." };
      }
      fila.archivo_path = ruta;
    } else {
      const url = String(formData.get("url") ?? "").trim();
      if (!urlValida(url)) return { error: "Pon un enlace válido (https://…)." };
      fila.url = url;
    }
    const { error } = await db().from("recursos").insert(fila);
    if (error) {
      if (fila.archivo_path) await borrarSubida("recursos", fila.archivo_path as string);
      return { error: error.message };
    }
    revalidatePath("/recursos");
    return { ok: "Recurso añadido." };
  });
}

export async function borrarRecurso(id: string) {
  return seguro(async () => {
    await exigirSeccion("recursos"); // H5
    const { proyecto } = await exigir(puedeRecursos);
    const { data } = await db().from("recursos").select("archivo_path").eq("id", id).eq("proyecto_id", proyecto.id).maybeSingle();
    if (!data) throw new ErrorUsuario("Recurso no encontrado.");
    if (data.archivo_path) await db().storage.from("recursos").remove([data.archivo_path]);
    await escribir(db().from("recursos").delete().eq("id", id), "recursos");
    revalidatePath("/recursos");
  });
}

// Bloque 7 de 1.0: también el link de dossier de cada producto (va encima del de pago)
export async function guardarLinkPago(productoId: string, url: string, campo: "link_pago" | "link_dossier" = "link_pago") {
  return seguro(async () => {
    await exigirSeccion("recursos"); // H5
    const { proyecto } = await exigir(puedeRecursos);
    const limpio = url.trim();
    if (campo !== "link_pago" && campo !== "link_dossier") throw new ErrorUsuario("Link no válido.");
    // Como en Programas (arreglo 35): los links de los productos, solo https
    if (limpio && !(urlValida(limpio) && limpio.toLowerCase().startsWith("https://"))) throw new ErrorUsuario("Pon un enlace válido que empiece por https://");
    await escribir(db().from("productos").update({ [campo]: limpio || null }).eq("id", productoId).eq("proyecto_id", proyecto.id), "productos");
    olvidarTodo(); // Callers guarda los productos 1 minuto (lib/memoria.ts)
    revalidatePath("/recursos");
  });
}

// Fase 7 (Cristian, 12 oct): varios links de pago por programa y el de Reserva aparte. Los cambia quien edita recursos.
// 13 nov: con mercado «es», la versión de España (vacía = el equipo de España ve la de Latam)
export async function guardarLinksPago(productoId: string, links: unknown, mercado: Mercado = "latam") {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeRecursos);
    const lista = linksValidos(links);
    const entraron = Array.isArray(links) ? links.filter((x) => x && typeof x === "object" && String((x as { url?: string }).url ?? "").trim()).length : 0;
    if (entraron > lista.length) throw new ErrorUsuario("Algún link no es válido o está repetido: tienen que empezar por https://");
    const campo = mercadoValido(mercado) === "es" ? "links_pago_es" : "links_pago";
    const { error } = await db().from("productos").update({ [campo]: lista }).eq("id", productoId).eq("proyecto_id", proyecto.id);
    if (error) throw new ErrorUsuario(/links_pago/.test(error.message) ? "Falta aplicar la migración de la base (links de pago)." : error.message);
    olvidarTodo(); // 25 oct 2026: borrar la memoria compartida (lib/memoria.ts)
    revalidatePath("/", "layout");
  });
}

export async function guardarLinkReserva(url: string, mercado: Mercado = "latam") {
  return seguro(async () => {
    const { proyecto } = await exigir(puedeRecursos);
    const limpio = url.trim();
    if (limpio && !esHttps(limpio)) throw new ErrorUsuario("Pon un enlace válido que empiece por https://");
    const campo = mercadoValido(mercado) === "es" ? "link_reserva_es" : "link_reserva";
    const { error } = await db().from("proyectos").update({ [campo]: limpio || null }).eq("id", proyecto.id);
    if (error) throw new ErrorUsuario(/link_reserva/.test(error.message) ? "Falta aplicar la migración de la base (links de pago)." : error.message);
    olvidarTodo(); // 25 oct 2026: borrar la memoria compartida (lib/memoria.ts)
    revalidatePath("/", "layout");
  });
}
