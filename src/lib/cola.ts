import { puntosLead } from "@/lib/prioridad";
import type { Pesos } from "@/lib/cualificacion";
import type { Lead } from "@/lib/tipos";
import { nombrePais } from "@/lib/formato";

export type PestanaCola = "llamar" | "luego" | "agendados" | "todos";

const esLuego = (estado: string) => estado === "llamar_luego" || estado === "link_enviado";

// Cola del caller: qué leads salen en cada pestaña y en qué orden.
// «Por llamar»: nuevos, no contesta y «llamar luego» cuya hora ya llegó. «Link enviado» (11 oct) se trata como un
// «llamar luego» a 2 días: si no ha llegado la cita de GHL, vuelve a la cola.
// Bloque 7 de 1.0 (Cristian, 11 oct 2026): la prioridad A/B/C se sigue calculando (puntos) pero ya no ordena; se quedan
// los grupos (primero los «llamar luego» que ya tocan, luego los nuevos, luego «no contesta») y dentro, del más nuevo al más viejo.
export function colaCaller<T extends Pick<Lead, "estado_caller" | "llamar_en" | "respuestas" | "creado_en">>(leads: T[], pestana: string, ahora: number, pesos: Pesos | null = null) {
  return leads
    .map((l) => ({ ...l, puntos: puntosLead(l.respuestas, pesos) }))
    .filter((l) => {
      if (pestana === "llamar")
        return l.estado_caller === "nuevo" || l.estado_caller === "no_contesta" || (esLuego(l.estado_caller) && !!l.llamar_en && new Date(l.llamar_en).getTime() <= ahora);
      if (pestana === "luego") return esLuego(l.estado_caller);
      if (pestana === "agendados") return l.estado_caller === "agendado" || l.estado_caller === "vendido";
      return true;
    })
    .sort((a, b) => {
      if (pestana === "luego") return (a.llamar_en ?? "").localeCompare(b.llamar_en ?? "");
      const venceA = esLuego(a.estado_caller) ? 1 : 0;
      const venceB = esLuego(b.estado_caller) ? 1 : 0;
      if (venceA !== venceB) return venceB - venceA;
      const nuevoA = a.estado_caller === "nuevo" ? 1 : 0;
      const nuevoB = b.estado_caller === "nuevo" ? 1 : 0;
      if (nuevoA !== nuevoB) return nuevoB - nuevoA;
      return b.creado_en.localeCompare(a.creado_en);
    });
}

// C2 (plan Callers, 7 nov; 7c.1): las cabeceras Nombre · País · Prioridad · Entró ordenan en el servidor, sobre
// todos los leads del caller y antes del corte de 300 (así «Prioridad» pone arriba todas las A). Sin orden elegido,
// se queda el de siempre (colaCaller). Un clic = dir 1: A→Z, las A primero, y en «Entró» los más recientes arriba.
export type CampoOrden = "nombre" | "pais" | "prio" | "entro";
export type OrdenCola = { campo: CampoOrden; dir: 1 | -1 };
const CAMPOS: CampoOrden[] = ["nombre", "pais", "prio", "entro"];

export function leerOrden(campo: unknown, dir: unknown): OrdenCola | null {
  if (typeof campo !== "string" || !CAMPOS.includes(campo as CampoOrden)) return null;
  return { campo: campo as CampoOrden, dir: dir === "desc" ? -1 : 1 };
}

const texto = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" });

export function ordenarCola<T extends Pick<Lead, "nombre" | "apellido" | "pais" | "creado_en"> & { puntos: number }>(leads: T[], orden: OrdenCola | null): T[] {
  if (!orden) return leads;
  const { campo, dir } = orden;
  const comparar = (a: T, b: T) => {
    if (campo === "nombre") return texto(`${a.nombre} ${a.apellido}`.trim(), `${b.nombre} ${b.apellido}`.trim());
    if (campo === "pais") return texto(nombrePais(a.pais), nombrePais(b.pais));
    if (campo === "prio") return b.puntos - a.puntos; // más puntos = A = arriba
    return b.creado_en.localeCompare(a.creado_en); // más recientes arriba
  };
  return [...leads].sort((a, b) => dir * comparar(a, b));
}
