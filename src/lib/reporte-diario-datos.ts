import "server-only";
import { cargarBase } from "@/lib/metricas";
import { mercadosDelProyecto } from "@/lib/mercado-datos";
import { avisosCeo } from "@/lib/avisos-ceo";
import { calcularAvances, cargarObjetivos } from "@/lib/objetivos";
import { armarReporte, fechaReporte, type DatosReporte } from "@/lib/reporte-diario";
import { ZONA_REPORTE } from "@/lib/reporte-config";
import type { MercadoReporte, Proyecto } from "@/lib/tipos";

// Fase C: carga lo que necesita el reporte diario de un mercado y lo arma (reporte-diario.ts). No envía nada.
export async function datosReporte(proyecto: Proyecto, mercado: MercadoReporte, ahora: Date): Promise<DatosReporte> {
  const zona = ZONA_REPORTE[mercado];
  const fecha = fechaReporte(ahora, zona);
  const [base, mercados, avisos, objetivos] = await Promise.all([
    cargarBase(proyecto),
    // Estricto: si no se puede leer el mercado del equipo, mejor un error que un reporte vacío
    mercadosDelProyecto(proyecto.id, true),
    avisosCeo(proyecto.id),
    cargarObjetivos(proyecto.id, fecha),
  ]);
  const personas = base.gente.filter((g) => (g.rol === "caller" || g.rol === "closer") && mercados[g.id] === mercado);
  const avances = calcularAvances(base, objetivos, personas, zona, fecha);
  return armarReporte(base, { mercado, moneda: proyecto.moneda, mercados, zona, ahora, avisos, avances });
}
