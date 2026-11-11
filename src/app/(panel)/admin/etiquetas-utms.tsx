import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Seccion } from "@/components/ui";
import { AnilloPartes } from "@/components/anillo-partes";
import { Barras } from "@/components/barras";
import { etiquetaCanal, opcionesCanal, type Canal, type TablaCanales } from "@/lib/canal";
import { EditorCanales } from "./canales";
import { getSesion } from "@/lib/auth";
import { db } from "@/lib/datos";
import { EditorEtiquetas, type EtiquetaFila } from "./etiquetas";

// Plan GHL B2b: pestaña «Etiquetas y UTMs» de Administración, con subvistas (?sub=). B3a añade «Etiquetas».
const SUBVISTAS = [{ v: "canales", t: "Canales" }, { v: "etiquetas", t: "Etiquetas" }];

// B3a: la lista sale de las etiquetas de los leads más la tabla `etiquetas` (orden y «usada por GHL»), en el servidor.
// shortcut: la función devuelve como mucho max_rows (1000) etiquetas; si un proyecto pasa de ahí, paginar.
async function etiquetasDe(proyectoId: string) {
  const { data, error } = await db().rpc("etiquetas_del_proyecto", { p_proyecto: proyectoId });
  if (error) throw new Error(`No se pudieron leer las etiquetas: ${error.message}`);
  return ((data ?? []) as { nombre: string; leads: number; usada_ghl: boolean }[]).map((f) => ({ nombre: f.nombre, leads: Number(f.leads), usada_ghl: f.usada_ghl }) satisfies EtiquetaFila);
}

// Rediseño (maqueta v1, Cristian 11 nov 2026): leads con la etiqueta «Canal: …» de cada canal, y el total del proyecto.
// Una cuenta por canal (son pocos): sin traer los leads.
async function leadsPorCanal(proyectoId: string, canales: TablaCanales) {
  const contar = (etiqueta?: string) => {
    let q = db().from("leads").select("id", { count: "exact", head: true }).eq("proyecto_id", proyectoId);
    if (etiqueta) q = q.contains("etiquetas", [etiqueta]);
    return q.then(({ count, error }) => {
      if (error) throw new Error(`No se pudieron contar los leads: ${error.message}`);
      return count ?? 0;
    });
  };
  const opciones = opcionesCanal(canales);
  const [total, ...cuentas] = await Promise.all([contar(), ...opciones.map((c) => contar(etiquetaCanal(c.clave as Canal, canales)))]);
  return { total, canales: opciones.map((c, i) => ({ clave: c.clave, t: c.nombre, n: cuentas[i] })) };
}

async function Etiquetas({ filas }: { filas: EtiquetaFila[] }) {
  const { proyecto } = await getSesion();
  // 1.7 (9 nov): los workflows que arrancan con cada etiqueta, para avisar antes de unir dos que tienen workflow
  const { data: wfs, error: errW } = await db().from("workflows").select("nombre, disparador").eq("proyecto_id", proyecto.id).eq("disparador->>tipo", "etiqueta");
  if (errW) throw new Error(`No se pudieron leer los workflows: ${errW.message}`);
  const workflows: Record<string, string[]> = {};
  for (const w of (wfs ?? []) as { nombre: string; disparador: { etiqueta?: string } }[]) {
    const t = (w.disparador.etiqueta ?? "").trim().toLowerCase();
    if (t) workflows[t] = [...(workflows[t] ?? []), w.nombre];
  }
  return <EditorEtiquetas key={JSON.stringify(filas)} inicial={filas} workflows={workflows} />;
}

export async function EtiquetasUtms({ sub, canales }: { sub: string; canales: TablaCanales }) {
  const actual = SUBVISTAS.some((s) => s.v === sub) ? sub : "canales";
  const { proyecto } = await getSesion();
  const [filas, porCanal] = await Promise.all([etiquetasDe(proyecto.id), leadsPorCanal(proyecto.id, canales)]);
  const conCanal = porCanal.canales.reduce((s, c) => s + c.n, 0);
  const sinCanal = Math.max(0, porCanal.total - conCanal); // shortcut: un lead con 2 etiquetas de canal contaría 2 veces; hoy cada lead lleva una
  const ranking = [...porCanal.canales].filter((c) => c.n > 0).sort((a, b) => b.n - a.n).map((c) => ({ t: c.t, n: c.n, pct: conCanal ? (c.n / conCanal) * 100 : 0 }));
  return (
    <div className="space-y-4">
      {/* Rediseño (maqueta v1): «sin canal» aparte para que los círculos se lean (decisión de Cristian, 11 nov 2026) */}
      {porCanal.total > 0 && sinCanal > 0 && (
        <div className="tarjeta flex items-center gap-3 border-aviso/35 px-4 py-3 text-sm">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-aviso-suave text-aviso"><AlertTriangle className="h-4 w-4" /></span>
          <div>
            <b>{sinCanal.toLocaleString("es-ES")} de {porCanal.total.toLocaleString("es-ES")} leads ({(Math.round((sinCanal / porCanal.total) * 1000) / 10).toLocaleString("es-ES")} %) no tienen canal.</b>
            <div className="text-xs text-texto-3">El canal sale de la cita (de su página o su utm_source), así que solo lo tienen los que agendaron. Se cuentan aparte para que los círculos se lean.</div>
          </div>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Seccion><AnilloPartes titulo="Leads por canal" partes={porCanal.canales} /></Seccion>
        <Seccion><AnilloPartes titulo="Etiquetas (un lead puede tener varias)" partes={filas.map((f) => ({ t: f.nombre, n: f.leads }))} centro={String(filas.filter((f) => f.leads > 0).length)} /></Seccion>
        <Seccion>{ranking.length ? <Barras titulo="Ranking de canales" filas={ranking} numero /> : <p className="text-sm text-texto-3">Todavía no hay leads con canal.</p>}</Seccion>
      </div>
      <div className="flex flex-wrap gap-1">
        {SUBVISTAS.map((s) => (
          <Link key={s.v} href={`/admin?tab=etiquetas-utms&sub=${s.v}`} className={`rounded-lg px-3 py-1.5 text-sm ${actual === s.v ? "bg-panel-2 font-semibold" : "text-texto-2 hover:bg-panel-2"}`}>{s.t}</Link>
        ))}
      </div>
      {actual === "canales" && (
        <Seccion titulo="Canales">
          <p className="mb-3 text-sm text-texto-2">
            El canal de cada cita sale de su página o de su <code>utm_source</code>. Una página «dominio/ruta» gana al UTM; «dominio» o «ruta» valen solo sin UTM. Sin UTM es «Directo» y un UTM que no está aquí es «Otro». Al cambiar un nombre se cambia también la etiqueta «Canal: …» de los leads, de las reglas de las Entradas y de los workflows.
          </p>
          <EditorCanales key={JSON.stringify(canales)} inicial={canales} leads={Object.fromEntries(porCanal.canales.map((c) => [c.clave, c.n]))} />
        </Seccion>
      )}
      {actual === "etiquetas" && (
        <Seccion titulo="Etiquetas">
          <p className="mb-3 text-sm text-texto-2">
            Las etiquetas de los leads de este proyecto, en minúsculas. Renombrar, unir o borrar una la cambia también en las Entradas (etiqueta base, fijas y reglas) y en los workflows (pasos y disparadores), todo a la vez. Las que usa el código de la app (por ejemplo las <code>-completo</code>/<code>-incompleto</code> o «Canal: …», que se cambian en Canales) no se pueden cambiar. Renombrar, unir y borrar la cambian también en GHL (si el proyecto tiene GHL conectado); crear solo la crea aquí.
          </p>
          <Etiquetas filas={filas} />
        </Seccion>
      )}
    </div>
  );
}
