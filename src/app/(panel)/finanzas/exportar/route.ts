import { NextResponse, type NextRequest } from "next/server";
import { getSesion } from "@/lib/auth";
import { puedeSeccion } from "@/lib/permisos";
import { leerPeriodo, rangoNav, enRango } from "@/lib/periodos";
import { filtrarPorMoneda, monedaDeLaVista, pendienteDe } from "@/lib/finanzas";
import { mercadosDelProyecto } from "@/lib/mercado-datos";
import { contenidoMercado } from "@/lib/mercado";
import { coincide } from "@/lib/llamadas";
import { csvExcel, nombreArchivo } from "@/lib/csv-excel";
import { cargarPantallaFinanzas } from "../cargar";

const TIPO: Record<string, string> = { completo: "Completo", reserva: "Reserva", cuotas: "Cuotas" };

// Finanzas › Ventas › Transacciones a CSV (se abre con Excel), con los mismos filtros que la pantalla
export async function GET(request: NextRequest) {
  const { perfil, proyecto } = await getSesion();
  if (!(await puedeSeccion(perfil, proyecto.id, "finanzas"))) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const p = leerPeriodo(sp);
  const rango = rangoNav(p.periodo, p.n, proyecto.zona_horaria, p.desde, p.hasta);
  // A2-03: el mismo filtro € / $ que la pantalla (solo las ventas de esa moneda)
  const [todo, mercados] = await Promise.all([cargarPantallaFinanzas(proyecto), mercadosDelProyecto(proyecto.id)]);
  const moneda = monedaDeLaVista(sp.moneda, proyecto.moneda);
  const d = filtrarPorMoneda(todo, moneda, (v) => contenidoMercado(v ? mercados[v] ?? null : null).moneda(proyecto), proyecto.moneda);
  const q = sp.q ?? "";
  const fmt = new Intl.DateTimeFormat("es-ES", { timeZone: proyecto.zona_horaria, year: "numeric", month: "2-digit", day: "2-digit" });
  const num = (n: number) => n.toFixed(2).replace(".", ",");
  const filas = d.ventas
    .filter((v) => enRango(v.fecha, rango) && (!sp.tipo || v.tipo_pago === sp.tipo) && coincide(q, d.leads.get(v.lead_id)?.nombre, d.leads.get(v.lead_id)?.email, d.producto.get(v.producto_id ?? "")))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((v) => {
      const cobrado = v.cash_collected + d.pagos.filter((x) => x.venta_id === v.id).reduce((s, x) => s + x.importe, 0);
      return [fmt.format(new Date(v.fecha)), d.leads.get(v.lead_id)?.nombre, d.leads.get(v.lead_id)?.email, d.producto.get(v.producto_id ?? ""), d.persona.get(v.vendedor_id ?? "")?.nombre, TIPO[v.tipo_pago] ?? v.tipo_pago, v.metodo, num(v.facturacion), num(cobrado), num(pendienteDe(v, d.pagos)), v.devuelto ? num(v.devuelto) : ""];
    });
  const csv = csvExcel(["Fecha", "Cliente", "Email", "Programa", "Vendedor", "Pago", "Método", `Facturación (${moneda})`, "Cobrado", "Falta", "Devuelto"], filas);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ventas-${nombreArchivo(proyecto.nombre)}.csv"`, "Cache-Control": "no-store" } });
}
