import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, LayoutGrid, List } from "lucide-react";
import { getSesion } from "@/lib/auth";
import { db, todas } from "@/lib/datos";
import { puedeSeccion, soloLoSuyo } from "@/lib/permisos";
import { cargarEquipo } from "@/lib/equipo";
import { dinero } from "@/lib/formato";
import { coincide } from "@/lib/llamadas";
import { Cabecera, Contenido, Insignia } from "@/components/ui";
import { BuscadorUrl } from "@/app/(panel)/closer/llamadas/cliente";
import { EditorPrograma, InterruptorActivo } from "./cliente";
import { LinksPago } from "@/components/links-pago";
import { contenidoMercado } from "@/lib/mercado";
import { mercadoVista } from "@/lib/mercado-datos";
import { SelectorMercado } from "@/components/selector-mercado";
import type { Producto } from "@/lib/tipos";
import { clientesSuyos } from "@/app/(panel)/clientes/cargar";

export default async function ProgramasPage({ searchParams }: PageProps<"/programas">) {
  const { perfil, proyecto } = await getSesion();
  if (!(await puedeSeccion(perfil, proyecto.id, "programas"))) redirect("/");
  // Comisiones que puede cambiar quien mira: mismas reglas que el servidor (lib/auth.ts, arreglo 2)
  const jefe = perfil.rol === "ceo" || perfil.rol === "director";
  const mirar = soloLoSuyo(perfil, "programas"); // H5: a un caller o closer, solo mirar
  const editables = jefe ? ["closer", "caller", "director", "ceo", "caller_agenda"].filter((k) => perfil.rol === "ceo" || k !== perfil.rol) : [];
  const sp = await searchParams;
  const estado = typeof sp.estado === "string" ? sp.estado : "";
  const lista = sp.vista === "lista";
  const q = typeof sp.q === "string" ? sp.q : "";
  // 13 nov: los jefes eligen Latam / España; el resto ve sus links y el precio en su moneda ($ o €, mismo número)
  const c = contenidoMercado(await mercadoVista(jefe, sp.mercado, proyecto.id, perfil.id), { crudo: jefe });
  const $m = { moneda: c.moneda(proyecto) };
  const [{ data }, ventas, eq] = await Promise.all([
    db().from("productos").select("*").eq("proyecto_id", proyecto.id).order("orden"),
    todas<{ producto_id: string | null; lead_id: string }>((a, b) => db().from("ventas").select("producto_id, lead_id").eq("proyecto_id", proyecto.id).order("id").range(a, b)),
    cargarEquipo(proyecto.id),
  ]);
  const todos = (data ?? []) as Producto[];
  const programas = todos.filter((p) => (!estado || (estado === "activos" ? p.activo : !p.activo)) && coincide(q, p.nombre, p.categoria));
  // 1.1 (11 oct 2026): a un caller o closer, solo sus clientes (los mismos que ve en Clientes)
  const suyos = mirar ? await clientesSuyos(proyecto.id, perfil.id) : null;
  const clientes = (id: string) => new Set(ventas.filter((v) => v.producto_id === id && (!suyos || suyos.has(v.lead_id))).map((v) => v.lead_id)).size;
  const conPrecio = todos.filter((p) => p.precio !== null);
  const precioMedio = conPrecio.length ? conPrecio.reduce((s, p) => s + Number(p.precio), 0) / conPrecio.length : 0;
  const url = (c: Record<string, string | null>) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    for (const [k, v] of Object.entries(c)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `/programas?${p}`;
  };
  const pago = (p: Producto) => (p.modo_pago === "cuotas" ? `${p.num_cuotas ?? "—"} cuotas` : p.modo_pago === "mensual" ? "Cada mes" : "Pago único");
  const categorias = [...new Set(programas.map((p) => p.categoria || ""))].sort();

  return (
    <>
      <Cabecera titulo="Programas" subtitulo={`${proyecto.nombre} · lo que vendéis, su precio y su comisión`} acciones={mirar ? undefined : <EditorPrograma programa={null} moneda={proyecto.moneda} comisionesRol={eq.comisionesRol} editables={editables} />} />
      <Contenido>
        {jefe && <SelectorMercado actual={c.mercado} href={(m) => url({ mercado: m === "es" ? "es" : null })} />}
        <div className="tarjeta grid grid-cols-1 divide-y divide-borde sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-5"><div className="text-4xl font-semibold tabular-nums">{todos.length}</div><div className="titulo-seccion mt-1">Programas</div></div>
          <div className="p-5"><div className="text-4xl font-semibold tabular-nums text-ok">{todos.filter((p) => p.activo).length}</div><div className="titulo-seccion mt-1">Activos · {todos.filter((p) => !p.activo).length} inactivos</div></div>
          <div className="p-5"><div className="text-4xl font-semibold tabular-nums text-oro">{dinero(precioMedio, $m)}</div><div className="titulo-seccion mt-1">Precio medio</div></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BuscadorUrl placeholder="Buscar programa…" />
          <div className="flex rounded-lg border border-borde bg-panel p-0.5">
            {[["", "Todos"], ["activos", "Activos"], ["inactivos", "Inactivos"]].map(([v, t]) => <Link prefetch={true} key={v} href={url({ estado: v || null })} className={`rounded-md px-3 py-1.5 text-sm ${estado === v ? "bg-primario text-white" : "text-texto-2"}`}>{t}</Link>)}
          </div>
          <div className="ml-auto flex rounded-lg border border-borde bg-panel p-0.5">
            <Link prefetch={true} href={url({ vista: null })} className={`rounded-md p-1.5 ${!lista ? "bg-primario text-white" : "text-texto-2"}`} aria-label="Tarjetas"><LayoutGrid className="h-4 w-4" /></Link>
            <Link prefetch={true} href={url({ vista: "lista" })} className={`rounded-md p-1.5 ${lista ? "bg-primario text-white" : "text-texto-2"}`} aria-label="Lista"><List className="h-4 w-4" /></Link>
          </div>
        </div>

        {programas.length === 0 && <p className="tarjeta p-6 text-center text-sm text-texto-3">No hay programas{q || estado ? " con ese filtro" : ""}.</p>}
        {lista ? (
          programas.length > 0 && (
            <div className="tarjeta -mx-0 overflow-x-auto">
              <table className="tabla">
                <thead><tr><th>Programa</th><th>Categoría</th><th>Pago</th><th className="text-right">Precio</th><th className="text-right">{mirar ? "Tus clientes" : "Clientes"}</th><th>Activo</th><th>Links</th><th></th></tr></thead>
                <tbody>
                  {programas.map((p) => (
                    <tr key={p.id}>
                      <td><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />{p.nombre}{p.backend_offer && <Insignia tono="morado">Back-end</Insignia>}</td>
                      <td className="text-texto-2">{p.categoria ?? "—"}</td>
                      <td>{pago(p)}</td>
                      <td className="text-right tabular-nums">{p.precio !== null ? dinero(Number(p.precio), $m) : "Personalizado"}</td>
                      <td className="text-right tabular-nums">{clientes(p.id)}</td>
                      <td>{mirar ? (p.activo ? "Sí" : "No") : <InterruptorActivo id={p.id} activo={p.activo} />}</td>
                      <td className="whitespace-nowrap"><LinksPago productoId={p.id} programa={p.nombre} links={c.linksPago(p)} reserva={c.linkReserva(proyecto)} mercado={c.mercado} editor={jefe} conReserva={p.modo_pago !== "mensual"} boton="pequeno" /></td>
                      <td className="w-44">{!mirar && <EditorPrograma programa={p} moneda={proyecto.moneda} comisionesRol={eq.comisionesRol} editables={editables} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          categorias.map((cat) => (
            <section key={cat || "sin"} className="space-y-3">
              {categorias.length > 1 && <h2 className="titulo-seccion">{cat || "Sin categoría"}</h2>}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {programas.filter((p) => (p.categoria || "") === cat).map((p) => (
                  <article key={p.id} className={`tarjeta space-y-4 p-5 ${p.activo ? "" : "opacity-60"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />{p.nombre}</div>
                      {!mirar && <InterruptorActivo id={p.id} activo={p.activo} />}
                    </div>
                    <div className="text-4xl font-semibold tabular-nums">{p.precio !== null ? dinero(Number(p.precio), $m) : <span className="text-2xl text-texto-2">Precio personalizado</span>}</div>
                    <LinksPago productoId={p.id} programa={p.nombre} links={c.linksPago(p)} reserva={c.linkReserva(proyecto)} mercado={c.mercado} editor={jefe} conReserva={p.modo_pago !== "mensual"} />
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Insignia>{pago(p)}</Insignia>
                      {p.backend_offer && <Insignia tono="morado">Back-end</Insignia>}
                      {p.vende_caller && <Insignia tono="primario">Lo vende el caller</Insignia>}
                      <span className="inline-flex items-center gap-1 text-texto-3"><Users className="h-4 w-4" />{clientes(p.id)} {clientes(p.id) === 1 ? "cliente" : "clientes"}{mirar ? " tuyos" : ""}</span>
                    </div>
                    {!mirar && <div className="border-t border-borde pt-4"><EditorPrograma programa={p} moneda={proyecto.moneda} comisionesRol={eq.comisionesRol} editables={editables} /></div>}
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </Contenido>
    </>
  );
}
