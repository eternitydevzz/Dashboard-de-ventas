import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, TrendingUp, CalendarClock, DollarSign, Star, ClipboardList, ArrowLeft } from "lucide-react";
import { getSesion, esJefe } from "@/lib/auth";
import { db, equipo } from "@/lib/datos";
import { puedeSeccion, soloLoSuyo } from "@/lib/permisos";
import { coincide } from "@/lib/llamadas";
import { dinero, fecha, hoyEnZona, pct } from "@/lib/formato";
import { grupoSeguimiento, progresoOnboarding, ESTADOS_CLIENTE } from "@/lib/clientes";
import { Cabecera, Contenido, Insignia, Anillo } from "@/components/ui";
import { BuscadorUrl } from "@/app/(panel)/closer/llamadas/cliente";
import type { Producto } from "@/lib/tipos";
import { cargarClientes, clientesSuyos, type ClienteVista, type DatosClientes } from "./cargar";
import { EditorPasos, GestionarCliente, NuevoCliente } from "./cliente";

const VISTAS = [
  { v: "seguimiento", t: "Seguimiento", icono: CalendarClock },
  { v: "finanzas", t: "Finanzas", icono: DollarSign },
  { v: "casos", t: "Casos de éxito", icono: Star },
  { v: "onboardings", t: "Onboardings", icono: ClipboardList },
] as const;
const TONO_ESTADO = { activo: "ok", pausado: "aviso", abandonado: "mal" } as const;

export default async function ClientesPage({ searchParams }: PageProps<"/clientes">) {
  const { perfil, proyecto } = await getSesion();
  if (!(await puedeSeccion(perfil, proyecto.id, "clientes"))) redirect("/");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const ver = s("ver");
  const [d, prods, gente] = await Promise.all([cargarClientes(proyecto), db().from("productos").select("*").eq("proyecto_id", proyecto.id).eq("activo", true).order("orden"), esJefe(perfil) ? equipo(proyecto.id) : Promise.resolve([])]);
  const $ = (n: number) => dinero(n, proyecto);
  const url = (c: Record<string, string | null>) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    for (const [k, v] of Object.entries(c)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `/clientes?${p}`;
  };
  const estado = s("estado") || "activo";
  const q = s("q");
  // H5: a un caller o closer con «Clientes», solo los suyos (los que vendió o agendó)
  const suyos = soloLoSuyo(perfil, "clientes") ? await clientesSuyos(proyecto.id, perfil.id) : null;
  if (suyos) d.filas = d.filas.filter((f) => suyos.has(f.lead_id));
  const lista = d.filas.filter((f) => (estado === "todos" || f.ficha.estado === estado) && coincide(q, f.lead.nombre, f.lead.email, f.lead.telefono)).sort((a, b) => b.desde.localeCompare(a.desde));
  const titulo = VISTAS.find((x) => x.v === ver)?.t;

  return (
    <>
      <Cabecera
        titulo={titulo ? `Clientes · ${titulo}` : "Clientes"}
        subtitulo={`${proyecto.nombre} · solo quien ha comprado`}
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            {VISTAS.map((x) => {
              const I = x.icono;
              return <Link prefetch={true} key={x.v} href={url({ ver: ver === x.v ? null : x.v })} className={ver === x.v ? "btn-primario" : "btn-secundario"}><I className="h-4 w-4" /> {x.t}</Link>;
            })}
            {!suyos && <NuevoCliente productos={(prods.data ?? []) as Producto[]} vendedores={gente.filter((g) => g.rol !== "ceo").map((g) => ({ id: g.id, nombre: g.nombre }))} moneda={proyecto.moneda} />}
          </div>
        }
      />
      <Contenido>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="tarjeta flex items-center gap-4 p-5"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-oro-suave text-oro"><Users className="h-5 w-5" /></span><div><div className="text-3xl font-semibold tabular-nums">{d.filas.length}</div><div className="titulo-seccion">Total clientes</div></div></div>
          <div className="tarjeta flex items-center gap-4 p-5"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ok-suave text-ok"><TrendingUp className="h-5 w-5" /></span><div><div className="text-3xl font-semibold tabular-nums">{$(d.filas.reduce((x, f) => x + f.comprado, 0))}</div><div className="titulo-seccion">Volumen total (lo vendido a clientes)</div></div></div>
        </div>

        {ver && <Link href={url({ ver: null })} className="inline-flex items-center gap-1 text-sm text-primario hover:underline"><ArrowLeft className="h-4 w-4" /> Volver a la lista</Link>}
        {ver === "seguimiento" ? (
          <Seguimiento d={d} hoy={hoyEnZona(proyecto.zona_horaria)} />
        ) : ver === "finanzas" ? (
          <FinanzasClientes d={d} moneda={$} />
        ) : ver === "casos" ? (
          <Casos d={d} />
        ) : ver === "onboardings" ? (
          <Onboardings d={d} editarPasos={!suyos} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-borde bg-panel p-0.5">
                {[...ESTADOS_CLIENTE.map((x) => [x.v, `${x.t}s`]), ["todos", "Todos"]].map(([v, t]) => <Link prefetch={true} key={v} href={url({ estado: v === "activo" ? null : v })} className={`rounded-md px-3 py-1.5 text-sm ${estado === v ? "bg-primario text-white" : "text-texto-2"}`}>{t} <span className="text-xs opacity-70">{v === "todos" ? d.filas.length : d.filas.filter((f) => f.ficha.estado === v).length}</span></Link>)}
              </div>
              <BuscadorUrl placeholder="Buscar por nombre, email o teléfono…" />
              <div className="ml-auto flex rounded-lg border border-borde bg-panel p-0.5">
                <Link prefetch={true} href={url({ vista: null })} className={`rounded-md px-3 py-1.5 text-sm ${s("vista") !== "cards" ? "bg-primario text-white" : "text-texto-2"}`}>Tabla</Link>
                <Link prefetch={true} href={url({ vista: "cards" })} className={`rounded-md px-3 py-1.5 text-sm ${s("vista") === "cards" ? "bg-primario text-white" : "text-texto-2"}`}>Tarjetas</Link>
              </div>
            </div>
            {lista.length === 0 ? (
              <p className="tarjeta p-8 text-center text-sm text-texto-3">{d.filas.length ? "No hay clientes con ese filtro." : "No hay clientes todavía. Aparecen solos al registrar una venta, o con «Nuevo cliente»."}</p>
            ) : s("vista") === "cards" ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{lista.map((f) => <Tarjeta key={f.lead_id} f={f} d={d} moneda={$} />)}</div>
            ) : (
              <div className="tarjeta overflow-x-auto">
                <table className="tabla">
                  <thead><tr><th>Cliente</th><th>Programa</th><th>Cliente desde</th><th className="text-right">Comprado</th><th className="text-right">Falta</th><th>Onboarding</th><th>Próximo contacto</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {lista.map((f) => (
                      <tr key={f.lead_id}>
                        <td><Link href={`/leads/${f.lead_id}`} className="font-medium hover:text-primario">{f.lead.nombre}</Link>{f.ficha.caso_exito && <Star className="ml-1 inline h-3.5 w-3.5 fill-oro text-oro" aria-label="Caso de éxito" />}<div className="text-xs text-texto-3">{f.lead.email ?? f.lead.telefono}</div></td>
                        <td className="text-texto-2">{f.productos.map((p) => d.productos.get(p)?.nombre).filter(Boolean).join(", ") || "—"}</td>
                        <td className="whitespace-nowrap text-texto-2">{fecha(f.desde, proyecto)}</td>
                        <td className="text-right tabular-nums">{$(f.comprado)}</td>
                        <td className="text-right tabular-nums">{f.falta > 0 ? <span className="text-aviso">{$(f.falta)}</span> : "—"}</td>
                        <td className="tabular-nums">{pct(progresoOnboarding(f.ficha.onboarding, d.pasos))}</td>
                        <td className="whitespace-nowrap">{f.ficha.proximo_contacto ? f.ficha.proximo_contacto.split("-").reverse().join("/") : "—"}</td>
                        <td><Insignia tono={TONO_ESTADO[f.ficha.estado]}>{ESTADOS_CLIENTE.find((x) => x.v === f.ficha.estado)?.t}</Insignia></td>
                        <td className="text-right"><GestionarCliente leadId={f.lead_id} nombre={f.lead.nombre} ficha={f.ficha} pasos={d.pasos} notas={f.notas} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Contenido>
    </>
  );
}

function Tarjeta({ f, d, moneda }: { f: ClienteVista; d: DatosClientes; moneda: (n: number) => string }) {
  return (
    <article className="tarjeta space-y-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <div><Link href={`/leads/${f.lead_id}`} className="font-semibold hover:text-primario">{f.lead.nombre}</Link>{f.ficha.caso_exito && <Star className="ml-1 inline h-3.5 w-3.5 fill-oro text-oro" aria-label="Caso de éxito" />}<div className="text-xs text-texto-3">{f.lead.email ?? f.lead.telefono}</div></div>
        <Insignia tono={TONO_ESTADO[f.ficha.estado]}>{ESTADOS_CLIENTE.find((x) => x.v === f.ficha.estado)?.t}</Insignia>
      </div>
      <div className="text-sm text-texto-2">{f.productos.map((p) => d.productos.get(p)?.nombre).filter(Boolean).join(", ") || "—"}</div>
      <div className="flex items-center justify-between">
        <div><div className="text-2xl font-semibold tabular-nums">{moneda(f.comprado)}</div>{f.falta > 0 && <div className="text-xs text-aviso">Faltan {moneda(f.falta)}</div>}</div>
        <div className="flex items-center gap-2 text-xs text-texto-3"><Anillo valor={progresoOnboarding(f.ficha.onboarding, d.pasos)} tamano={48} /> onboarding</div>
      </div>
      <div className="flex items-center justify-between border-t border-borde pt-3 text-xs text-texto-3">
        <span>Próximo contacto: {f.ficha.proximo_contacto ? f.ficha.proximo_contacto.split("-").reverse().join("/") : "—"}</span>
        <GestionarCliente leadId={f.lead_id} nombre={f.lead.nombre} ficha={f.ficha} pasos={d.pasos} notas={f.notas} />
      </div>
    </article>
  );
}

function Seguimiento({ d, hoy }: { d: DatosClientes; hoy: string }) {
  const activos = d.filas.filter((f) => f.ficha.estado !== "abandonado");
  const grupos = [
    { v: "vencido", t: "Vencidos", tono: "text-mal" },
    { v: "hoy", t: "Hoy", tono: "text-oro" },
    { v: "proximo", t: "Próximos", tono: "text-texto" },
    { v: "sin_fecha", t: "Sin fecha", tono: "text-texto-3" },
  ] as const;
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {grupos.map((g) => {
        const fs = activos.filter((f) => grupoSeguimiento(f.ficha.proximo_contacto, hoy) === g.v).sort((a, b) => (a.ficha.proximo_contacto ?? "").localeCompare(b.ficha.proximo_contacto ?? ""));
        return (
          <section key={g.v} className="tarjeta space-y-2 p-4">
            <h2 className={`titulo-seccion ${g.tono}`}>{g.t} · {fs.length}</h2>
            {fs.length === 0 && <p className="py-4 text-center text-xs text-texto-3">Nadie</p>}
            {fs.map((f) => (
              <div key={f.lead_id} className="rounded-lg bg-panel-2 p-3 text-sm">
                <div className="flex items-center justify-between gap-2"><Link href={`/leads/${f.lead_id}`} className="font-medium hover:text-primario">{f.lead.nombre}</Link><GestionarCliente leadId={f.lead_id} nombre={f.lead.nombre} ficha={f.ficha} pasos={d.pasos} notas={f.notas} texto="Apuntar" /></div>
                {f.ficha.proximo_contacto && <div className="text-xs text-texto-3">{f.ficha.proximo_contacto.split("-").reverse().join("/")}</div>}
                {f.notas[0] && <p className="mt-1 line-clamp-2 text-xs text-texto-2">{f.notas[0].nota}</p>}
              </div>
            ))}
          </section>
        );
      })}
      <p className="text-xs text-texto-3 lg:col-span-4">Los abandonados no salen aquí. Pulsa «Apuntar» para dejar una nota y la fecha del siguiente contacto.</p>
    </div>
  );
}

function FinanzasClientes({ d, moneda }: { d: DatosClientes; moneda: (n: number) => string }) {
  const fs = [...d.filas].sort((a, b) => b.falta - a.falta);
  return (
    <div className="tarjeta overflow-x-auto">
      <table className="tabla">
        <thead><tr><th>Cliente</th><th className="text-right">Comprado</th><th className="text-right">Pagado</th><th className="text-right">Devuelto</th><th className="text-right">Falta</th><th>Próximo plazo</th></tr></thead>
        <tbody>
          {fs.map((f) => (
            <tr key={f.lead_id}>
              <td><Link href={`/leads/${f.lead_id}`} className="hover:text-primario">{f.lead.nombre}</Link></td>
              <td className="text-right tabular-nums">{moneda(f.comprado)}</td>
              <td className="text-right tabular-nums">{moneda(f.pagado)}</td>
              <td className="text-right tabular-nums">{f.devuelto ? <span className="text-mal">{moneda(f.devuelto)}</span> : "—"}</td>
              <td className="text-right tabular-nums">{f.falta > 0 ? <span className="text-aviso">{moneda(f.falta)}</span> : "—"}</td>
              <td className="whitespace-nowrap">{f.proximoPlazo ? <span className={f.proximoPlazo.vencido ? "text-mal" : ""}>{f.proximoPlazo.fecha.split("-").reverse().join("/")} · {moneda(f.proximoPlazo.importe)}{f.proximoPlazo.vencido ? " (vencido)" : ""}</span> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {fs.length === 0 && <p className="p-6 text-center text-sm text-texto-3">No hay clientes todavía.</p>}
      <p className="p-3 text-xs text-texto-3">Sale de Ventas y Finanzas: para registrar un cobro o cambiar un plazo, ve a <Link href="/finanzas?tab=ventas&ver=pendientes" className="text-primario hover:underline">Finanzas › Pagos pendientes</Link>.</p>
    </div>
  );
}

function Casos({ d }: { d: DatosClientes }) {
  const casos = d.filas.filter((f) => f.ficha.caso_exito);
  return (
    <>
      {casos.length === 0 ? (
        <p className="tarjeta p-8 text-center text-sm text-texto-3">Aún no hay casos de éxito. Abre un cliente con «Gestionar» → «Caso de éxito».</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {casos.map((f) => (
            <article key={f.lead_id} className="tarjeta space-y-2 p-5">
              <div className="flex items-center justify-between"><Link href={`/leads/${f.lead_id}`} className="font-semibold hover:text-primario">{f.lead.nombre}</Link><Star className="h-4 w-4 fill-oro text-oro" aria-hidden /></div>
              <p className="text-sm">{f.ficha.caso_resultado}</p>
              <div className="flex items-center justify-between text-xs text-texto-3">
                <span>{f.ficha.caso_fecha ? f.ficha.caso_fecha.split("-").reverse().join("/") : ""}</span>
                {f.ficha.caso_enlace && <a href={f.ficha.caso_enlace} target="_blank" rel="noopener noreferrer" className="text-primario hover:underline">Ver testimonio</a>}
              </div>
              <GestionarCliente leadId={f.lead_id} nombre={f.lead.nombre} ficha={f.ficha} pasos={d.pasos} notas={f.notas} pestana="caso" texto="Editar" />
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function Onboardings({ d, editarPasos }: { d: DatosClientes; editarPasos: boolean }) {
  const fs = d.filas.filter((f) => f.ficha.estado !== "abandonado").sort((a, b) => progresoOnboarding(a.ficha.onboarding, d.pasos) - progresoOnboarding(b.ficha.onboarding, d.pasos));
  return (
    <div className="tarjeta overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3"><span className="text-sm text-texto-2">Primero los que van más atrasados.</span>{editarPasos && <EditorPasos pasos={d.pasos} />}</div>
      <table className="tabla">
        <thead><tr><th>Cliente</th>{d.pasos.map((p) => <th key={p.id} className="text-center">{p.nombre}</th>)}<th className="text-right">Hecho</th><th></th></tr></thead>
        <tbody>
          {fs.map((f) => (
            <tr key={f.lead_id}>
              <td><Link href={`/leads/${f.lead_id}`} className="hover:text-primario">{f.lead.nombre}</Link></td>
              {d.pasos.map((p) => <td key={p.id} className="text-center">{f.ficha.onboarding[p.id] ? <span className="text-ok" aria-label="Hecho">✓</span> : <span className="text-texto-3" aria-label="Pendiente">·</span>}</td>)}
              <td className="text-right tabular-nums">{pct(progresoOnboarding(f.ficha.onboarding, d.pasos))}</td>
              <td className="text-right"><GestionarCliente leadId={f.lead_id} nombre={f.lead.nombre} ficha={f.ficha} pasos={d.pasos} notas={f.notas} pestana="onboarding" texto="Marcar" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {fs.length === 0 && <p className="p-6 text-center text-sm text-texto-3">No hay clientes todavía.</p>}
    </div>
  );
}
