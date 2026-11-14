import Link from "next/link";
import { DollarSign, Wallet, Hourglass, ShoppingCart, Receipt } from "lucide-react";
import { esJefe } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { db, todas, equipo, idsDePrueba, deVerdad } from "@/lib/datos";
import { dinero, fechaHora, rangoDe, type Periodo, ETIQUETA_ROL } from "@/lib/formato";
import type { Producto, Proyecto } from "@/lib/tipos";
import { cashDelPeriodo } from "@/lib/metricas";
import { Cabecera, Contenido, Kpi, Seccion, Insignia, Vacio } from "@/components/ui";
import { Filtros } from "@/components/filtros";
import { FilaVentaAcciones } from "./fila-acciones";
import { mercadosDelProyecto, miMoneda } from "@/lib/mercado-datos";
import { NuevaVenta } from "./nueva-venta";
import { contenidoMercado } from "@/lib/mercado";

type VentaFila = {
  id: string;
  lead_id: string;
  vendedor_id: string | null;
  facturacion: number;
  cash_collected: number;
  tipo_pago: string;
  num_cuotas: number | null;
  metodo: string;
  fecha: string;
  nota: string | null;
  devuelto: number | null;
  devuelto_en: string | null;
  baja_en: string | null;
  productos: { nombre: string } | null;
  leads: { nombre: string; apellido: string } | null;
  pagos: { importe: number }[];
};
const TIPO: Record<string, string> = { completo: "Completo", reserva: "Reserva", cuotas: "Cuotas", mensual: "Cada mes" };

export default async function VentasPage({ searchParams }: PageProps<"/ventas">) {
  const { perfil, proyecto } = await exigirPagina("ventas"); // H5 (a un caller, solo las suyas)
  const jefe = esJefe(perfil);
  const sp = await searchParams;
  const periodo = (typeof sp.periodo === "string" ? sp.periodo : "mes") as Periodo;
  const rango = rangoDe(periodo, proyecto.zona_horaria, sp.desde as string, sp.hasta as string);
  const vendedorId = jefe ? (typeof sp.vendedor === "string" ? sp.vendedor : "") : perfil.id;
  // Cristian, 14 nov: «Nueva venta» (solo jefes) necesita los productos y la moneda de quien la registra
  const [gente, prueba, mercados, productos, miMon] = await Promise.all([
    equipo(proyecto.id, !!perfil.es_prueba),
    perfil.es_prueba ? Promise.resolve(new Set<string>()) : idsDePrueba(),
    mercadosDelProyecto(proyecto.id),
    jefe ? db().from("productos").select("*").eq("proyecto_id", proyecto.id).eq("activo", true).order("orden") : null,
    jefe ? miMoneda(proyecto, perfil.id) : proyecto.moneda,
  ]);
  const ok = deVerdad(prueba); // 1.0: las ventas de los perfiles de prueba no cuentan

  const ventas = (
    await todas<VentaFila>((a, b) => {
      let q = db().from("ventas").select("*, productos(nombre), leads(nombre, apellido), pagos(importe)").eq("proyecto_id", proyecto.id);
      if (rango.desde) q = q.gte("fecha", rango.desde.toISOString());
      if (rango.hasta) q = q.lt("fecha", rango.hasta.toISOString());
      if (vendedorId) q = q.eq("vendedor_id", vendedorId);
      return q.order("fecha", { ascending: false }).order("id").range(a, b);
    })
  ).filter((v) => ok(v.vendedor_id)).map((v) => {
    const cobrado = Number(v.cash_collected) + v.pagos.reduce((s, p) => s + Number(p.importe), 0);
    return { ...v, facturacion: Number(v.facturacion), cobrado, pendiente: Math.max(0, Number(v.facturacion) - cobrado) };
  });

  // Cash collected como Finanzas (Cristian, 10 oct 2026): el dinero que entró DENTRO del periodo de las ventas
  // de este vendedor (o de todos): lo cobrado al vender + cuotas cobradas en el periodo (aunque la venta sea de
  // antes) − devoluciones del periodo. La columna «Cobrado» de cada venta sigue siendo todo lo cobrado de ella.
  const [todasLasVentas, pagosPeriodo] = await Promise.all([
    todas<{ id: string; vendedor_id: string | null; fecha: string; cash_collected: number; devuelto: number | null; devuelto_en: string | null }>((a, b) => {
      let q = db().from("ventas").select("id, vendedor_id, fecha, cash_collected, devuelto, devuelto_en").eq("proyecto_id", proyecto.id);
      if (vendedorId) q = q.eq("vendedor_id", vendedorId);
      return q.order("id").range(a, b);
    }),
    todas<{ venta_id: string; fecha: string; importe: number }>((a, b) => {
      let q = db().from("pagos").select("venta_id, fecha, importe, ventas!inner(proyecto_id)").eq("ventas.proyecto_id", proyecto.id);
      if (rango.desde) q = q.gte("fecha", rango.desde.toISOString());
      if (rango.hasta) q = q.lt("fecha", rango.hasta.toISOString());
      return q.order("id").range(a, b);
    }),
  ]);
  const $ = (n: number) => dinero(n, proyecto);
  // Moneda (Cristian, 14 nov): cada venta en la de su vendedor (€ si es de España, $ si de Latam o EE. UU.), mire quien mire
  const monedaDe = (vendedor: string | null) => contenidoMercado(vendedor ? mercados[vendedor] ?? null : null).moneda(proyecto);
  const $v = (vendedor: string | null) => (n: number) => dinero(n, { moneda: monedaDe(vendedor) });
  // Totales (Cristian, 14 nov: «Separar € y $»): cada venta suma en su moneda, sin convertir; con las 2, «€ X · $ Y»
  const total = (partes: [Proyecto["moneda"], number][]) => {
    const suma = new Map<Proyecto["moneda"], number>();
    for (const [m, n] of partes) suma.set(m, (suma.get(m) ?? 0) + n);
    const texto = (["EUR", "USD"] as const).filter((m) => suma.has(m)).map((m) => dinero(suma.get(m)!, { moneda: m }));
    return texto.length ? texto.join(" · ") : $(0);
  };
  const deVentas = (lista: typeof ventas, campo: "facturacion" | "pendiente") => total(lista.filter((v) => v[campo] > 0).map((v) => [monedaDe(v.vendedor_id), v[campo]]));

  const facturacion = ventas.reduce((s, v) => s + v.facturacion, 0); // solo para el ancho de las barras
  const ventasOk = todasLasVentas.filter((v) => ok(v.vendedor_id));
  const cobrado = total((["EUR", "USD"] as const).map((m) => [m, cashDelPeriodo(ventasOk.filter((v) => monedaDe(v.vendedor_id) === m), pagosPeriodo, rango)] as [Proyecto["moneda"], number]).filter(([, n]) => n !== 0));
  const pendiente = deVentas(ventas, "pendiente");
  const ticket = total((["EUR", "USD"] as const).flatMap((m) => {
    const suyas = ventas.filter((v) => monedaDe(v.vendedor_id) === m);
    return suyas.length ? [[m, suyas.reduce((s, v) => s + v.facturacion, 0) / suyas.length] as [Proyecto["moneda"], number]] : [];
  }));
  const porProducto = Object.entries(
    ventas.reduce<Record<string, { n: number; f: number; ventas: typeof ventas }>>((acc, v) => {
      const k = v.productos?.nombre ?? "Sin producto";
      acc[k] = { n: (acc[k]?.n ?? 0) + 1, f: (acc[k]?.f ?? 0) + v.facturacion, ventas: [...(acc[k]?.ventas ?? []), v] };
      return acc;
    }, {})
  ).sort((a, b) => b[1].f - a[1].f);
  const nombre = (id: string | null) => gente.find((g) => g.id === id)?.nombre ?? "—";

  return (
    <>
      <Cabecera titulo="Ventas" subtitulo={`${proyecto.nombre} · ${rango.etiqueta}${vendedorId && jefe ? ` · ${nombre(vendedorId)}` : ""}`}
        acciones={jefe ? <NuevaVenta productos={(productos?.data ?? []) as Producto[]} vendedores={gente.filter((g) => g.rol === "closer" || g.rol === "caller").map((g) => ({ id: g.id, nombre: g.nombre, moneda: monedaDe(g.id) }))} miId={perfil.id} moneda={miMon} /> : undefined}
      />
      <Contenido>
        <Filtros vendedores={jefe ? gente.filter((g) => g.rol !== "ceo" && g.rol !== "director").map((g) => ({ id: g.id, nombre: g.nombre, rol: ETIQUETA_ROL[g.rol] })) : undefined} />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Kpi titulo="Facturación" valor={deVentas(ventas, "facturacion")} icono={DollarSign} tono="oro" destacado detalle="Valor de los contratos cerrados" />
          <Kpi titulo="Cash collected" valor={cobrado} icono={Wallet} tono="ok" detalle="Dinero que entró en el periodo, como Finanzas: al vender + cuotas − devoluciones" />
          <Kpi titulo="Pendiente de cobro" valor={pendiente} icono={Hourglass} tono="aviso" detalle="Reservas y cuotas por cobrar" />
          <Kpi titulo="Ventas" valor={ventas.length} icono={ShoppingCart} detalle={ventas.length ? `Ticket medio ${ticket}` : undefined} />
        </div>

        {/* Cristian, 14 nov: grid-cols-1 (= minmax(0,1fr)) para que en móvil la tabla se desplace dentro de su caja y no la página */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Seccion titulo="Ventas registradas">
            {ventas.length === 0 ? (
              <Vacio icono={Receipt} texto="No hay ventas en este periodo." />
            ) : (
              <div className="-mx-4 overflow-x-auto sm:-mx-5">
                <table className="tabla">
                  <thead>
                    <tr><th>Fecha</th><th>Lead</th><th>Producto</th><th>Vendedor</th><th>Pago</th><th className="text-right">Facturación</th><th className="text-right">Cobrado</th><th className="text-right">Pendiente</th><th></th></tr>
                  </thead>
                  <tbody>
                    {ventas.map((v) => (
                      <tr key={v.id}>
                        <td className="whitespace-nowrap text-texto-2">{fechaHora(v.fecha, proyecto)}</td>
                        <td><Link href={`/leads/${v.lead_id}`} className="font-medium hover:text-primario">{`${v.leads?.nombre ?? ""} ${v.leads?.apellido ?? ""}`.trim()}</Link></td>
                        <td>{v.productos?.nombre ?? "—"}</td>
                        <td className="text-texto-2">{nombre(v.vendedor_id)}</td>
                        <td><Insignia tono={v.tipo_pago === "completo" ? "ok" : "aviso"}>{TIPO[v.tipo_pago]}{v.num_cuotas ? ` · ${v.num_cuotas}` : ""}</Insignia> <span className="text-xs text-texto-3">{v.metodo}</span></td>
                        <td className="text-right tabular-nums">{$v(v.vendedor_id)(v.facturacion)}</td>
                        <td className="text-right tabular-nums text-ok">
                          {$v(v.vendedor_id)(v.cobrado)}
                          {v.devuelto && <div className="text-xs text-mal" title={v.devuelto_en ? `Devuelto el ${fechaHora(v.devuelto_en, proyecto)}` : ""}>Devuelto {$v(v.vendedor_id)(Number(v.devuelto))}</div>}
                        </td>
                        <td className="text-right tabular-nums text-aviso">{v.pendiente ? $v(v.vendedor_id)(v.pendiente) : "—"}</td>
                        <td><FilaVentaAcciones ventaId={v.id} pendiente={v.pendiente} cobrado={v.cobrado} devuelta={!!v.devuelto} jefe={jefe} membresiaActiva={v.tipo_pago === "mensual" && !v.baja_en} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Seccion>
          <Seccion titulo="Por producto">
            {porProducto.length === 0 ? (
              <Vacio icono={ShoppingCart} texto="Sin datos." />
            ) : (
              <ul className="space-y-3">
                {porProducto.map(([n, d]) => (
                  <li key={n}>
                    <div className="flex justify-between text-sm"><span className="font-medium">{n}</span><span className="tabular-nums">{deVentas(d.ventas, "facturacion")}</span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-panel-2">
                      <div className="h-full rounded-full bg-primario" style={{ width: `${facturacion ? (d.f / facturacion) * 100 : 0}%` }} />
                    </div>
                    <div className="mt-0.5 text-xs text-texto-3">{d.n} ventas</div>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>
        </div>
      </Contenido>
    </>
  );
}
