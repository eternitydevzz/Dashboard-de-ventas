import Link from "next/link";
import { Video, ExternalLink } from "lucide-react";
import { db, todas } from "@/lib/datos";
import { fechaHora } from "@/lib/formato";
import { leerPeriodo, rangoNav, enRango } from "@/lib/periodos";
import { celdasMes, diaEnZona } from "@/lib/llamadas";
import { Insignia, Vacio } from "@/components/ui";
import { BarraPeriodo } from "@/components/barra-periodo";
import type { Proyecto } from "@/lib/tipos";
import { AccionesGrabacion, CuentasFathom, SincronizarFathom } from "./grabaciones-cliente";

type SP = Record<string, string | string[] | undefined>;
type Grab = { id: string; closer_id: string | null; titulo: string | null; url: string | null; share_url: string | null; inicio: string | null; cita_id: string | null; conciliacion: "pendiente" | "auto" | "manual" | "descartada"; motivo: string | null; resumen: string | null };
type CitaG = { id: string; fecha: string; closer_id: string | null; leads: { id: string; nombre: string; apellido: string } | null };
const H = 3600_000;

// 04 · Grabaciones (Fathom por API): Lista / Calendario · Todas / Pendientes / Conciliadas · periodo · Cuentas
export async function Grabaciones({ proyecto, sp, closerIds, closers, jefe, yo, baseQs }: { proyecto: Proyecto; sp: SP; closerIds: string[]; closers: { id: string; nombre: string }[]; jefe: boolean; yo: string; baseQs: (c: Record<string, string | null>) => string }) {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const ids = closerIds.length ? closerIds : ["00000000-0000-0000-0000-000000000000"];
  const p = leerPeriodo(sp);
  const rango = rangoNav(p.periodo, p.n, proyecto.zona_horaria, p.desde, p.hasta);
  const [grabs, citas, { data: cuentas }] = await Promise.all([
    todas<Grab>((a, b) => db().from("grabaciones").select("id, closer_id, titulo, url, share_url, inicio, cita_id, conciliacion, motivo, resumen").eq("proyecto_id", proyecto.id).in("closer_id", ids).order("inicio", { ascending: false }).order("id").range(a, b)),
    todas<CitaG>((a, b) => db().from("citas").select("*, leads(id, nombre, apellido)").eq("proyecto_id", proyecto.id).in("closer_id", ids).order("id").range(a, b)),
    db().from("cuentas_fathom").select("id, nombre, perfil_id, formato_titulo, sincronizado_en, ultimo_resultado").eq("proyecto_id", proyecto.id).in("perfil_id", jefe ? closers.map((c) => c.id).concat(ids) : [yo]),
  ]);
  const filtro = s("conc");
  const enPeriodo = grabs.filter((g) => enRango(g.inicio, rango));
  const lista = enPeriodo.filter((g) => (filtro === "pendientes" ? g.conciliacion === "pendiente" : filtro === "conciliadas" ? !!g.cita_id : true));
  const cita = new Map(citas.map((c) => [c.id, c]));
  const usadas = new Set(grabs.map((g) => g.cita_id).filter(Boolean));
  const nombre = (c: CitaG | undefined) => (c?.leads ? `${c.leads.nombre} ${c.leads.apellido ?? ""}`.trim() || "Sin nombre" : "Lead");
  const opciones = (g: Grab) =>
    citas
      .filter((c) => c.closer_id === g.closer_id && !usadas.has(c.id) && g.inicio && Math.abs(new Date(c.fecha).getTime() - new Date(g.inicio).getTime()) <= 3 * 24 * H)
      .sort((a, b) => Math.abs(new Date(a.fecha).getTime() - new Date(g.inicio!).getTime()) - Math.abs(new Date(b.fecha).getTime() - new Date(g.inicio!).getTime()))
      .slice(0, 15)
      .map((c) => ({ id: c.id, texto: `${nombre(c)} · ${fechaHora(c.fecha, proyecto)}` }));
  const nCloser = (id: string | null) => closers.find((c) => c.id === id)?.nombre ?? "—";
  const calendario = s("vista") === "calendario";
  const ETQ = { pendiente: ["Pendiente", "aviso"], auto: ["Conciliada sola", "ok"], manual: ["Conciliada a mano", "ok"], descartada: ["Descartada", "neutro"] } as const;
  const cuentasVista = (cuentas ?? []).map((c) => ({ id: c.id, nombre: c.nombre, perfil_id: c.perfil_id, formato_titulo: c.formato_titulo, sincronizado: c.sincronizado_en ? fechaHora(c.sincronizado_en, proyecto) : null, resultado: c.ultimo_resultado }));

  return (
    <section className="space-y-3">
      <div className="tarjeta flex flex-wrap items-center gap-2 p-2.5">
        <div className="flex rounded-lg border border-borde bg-panel-2 p-0.5">
          <Link prefetch={false} href={baseQs({ vista: null })} className={`rounded-md px-3 py-1.5 text-sm ${!calendario ? "bg-primario text-white" : "text-texto-2"}`}>Lista</Link>
          <Link prefetch={false} href={baseQs({ vista: "calendario" })} className={`rounded-md px-3 py-1.5 text-sm ${calendario ? "bg-primario text-white" : "text-texto-2"}`}>Calendario</Link>
        </div>
        <div className="flex rounded-lg border border-borde bg-panel-2 p-0.5">
          {[["", "Todas", enPeriodo.length], ["pendientes", "Pendientes", enPeriodo.filter((g) => g.conciliacion === "pendiente").length], ["conciliadas", "Conciliadas", enPeriodo.filter((g) => g.cita_id).length]].map(([v, t, n]) => (
            <Link prefetch={false} key={v as string} href={baseQs({ conc: (v as string) || null })} className={`rounded-md px-3 py-1.5 text-sm ${filtro === v ? "bg-primario text-white" : "text-texto-2"}`}>{t} <span className="text-xs opacity-70">{n}</span></Link>
          ))}
        </div>
        <BarraPeriodo etiqueta={rango.etiqueta} conActualizar={false} />
        <div className="ml-auto flex gap-2">
          <CuentasFathom cuentas={cuentasVista} closers={closers} jefe={jefe} yo={yo} />
          <SincronizarFathom hayCuentas={cuentasVista.length > 0} />
        </div>
      </div>

      {cuentasVista.length === 0 && <p className="tarjeta p-4 text-sm text-texto-2">Para ver aquí las grabaciones, cada closer añade su cuenta de Fathom en <b>Cuentas</b> (nombre, API key y formato de título) y pulsa <b>Sincronizar Fathom</b>.</p>}

      {calendario ? (
        <Calendario grabs={lista} proyecto={proyecto} desde={rango.desde!} />
      ) : lista.length === 0 ? (
        <div className="tarjeta"><Vacio icono={Video} texto="No hay grabaciones en este periodo." /></div>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="tabla">
            <thead><tr><th>Fecha</th><th>Grabación</th>{jefe && <th>Closer</th>}<th>Cita</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {lista.map((g) => {
                const c = g.cita_id ? cita.get(g.cita_id) : undefined;
                return (
                  <tr key={g.id}>
                    <td className="whitespace-nowrap text-texto-2">{g.inicio ? fechaHora(g.inicio, proyecto) : "—"}</td>
                    <td>
                      <div className="font-medium">{g.titulo ?? "Sin título"}</div>
                      {(g.share_url || g.url) && <a href={g.share_url ?? g.url!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primario hover:underline">Ver en Fathom <ExternalLink className="h-3 w-3" /></a>}
                    </td>
                    {jefe && <td className="text-texto-2">{nCloser(g.closer_id)}</td>}
                    <td>{c ? <Link prefetch={false} href={`/leads/${c.leads?.id}`} className="hover:text-primario">{nombre(c)}<div className="text-xs text-texto-3">{fechaHora(c.fecha, proyecto)}</div></Link> : <span className="text-xs text-texto-3">{g.motivo ?? "—"}</span>}</td>
                    <td><Insignia tono={ETQ[g.conciliacion][1]}>{ETQ[g.conciliacion][0]}</Insignia>{c && g.motivo && <div className="text-[11px] text-texto-3">{g.motivo}</div>}</td>
                    <td className="text-right"><AccionesGrabacion id={g.id} unida={!!g.cita_id} descartada={g.conciliacion === "descartada"} opciones={g.cita_id ? [] : opciones(g)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-texto-3">Conciliar = unir cada grabación con su cita. Se hace sola si hay una única cita del mismo closer que encaja (por el email del invitado, por el nombre del título o por la hora, ±30 min); si hay dudas, queda «Pendiente» para elegirla a mano.</p>
    </section>
  );
}

function Calendario({ grabs, proyecto, desde }: { grabs: Grab[]; proyecto: Proyecto; desde: Date }) {
  const ym = diaEnZona(desde.toISOString(), proyecto.zona_horaria).slice(0, 7);
  const porDia = new Map<string, Grab[]>();
  for (const g of grabs) if (g.inicio) {
    const d = diaEnZona(g.inicio, proyecto.zona_horaria);
    porDia.set(d, [...(porDia.get(d) ?? []), g]);
  }
  return (
    <div className="tarjeta p-3">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-texto-3">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <div key={d}>{d}</div>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {celdasMes(`${ym}-01`).map((d, i) =>
          d ? (
            <div key={d} className="min-h-16 rounded-lg bg-panel-2 p-1 text-[11px]">
              <div className="text-texto-3">{Number(d.slice(8))}</div>
              {(porDia.get(d) ?? []).slice(0, 3).map((g) => <div key={g.id} className={`truncate rounded px-1 ${g.cita_id ? "bg-ok-suave text-ok" : g.conciliacion === "descartada" ? "text-texto-3" : "bg-aviso-suave text-aviso"}`} title={g.titulo ?? ""}>{g.titulo ?? "Grabación"}</div>)}
              {(porDia.get(d)?.length ?? 0) > 3 && <div className="text-texto-3">+{porDia.get(d)!.length - 3}</div>}
            </div>
          ) : (
            <div key={`v${i}`} />
          )
        )}
      </div>
      <p className="mt-2 text-xs text-texto-3">Verde = unida a su cita · ámbar = pendiente. El calendario enseña el mes del periodo elegido.</p>
    </div>
  );
}
