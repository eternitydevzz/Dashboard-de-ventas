import Link from "next/link";
import { Seccion } from "@/components/ui";
import type { TablaCanales } from "@/lib/canal";
import { EditorCanales } from "./canales";
import { getSesion } from "@/lib/auth";
import { db } from "@/lib/datos";
import { EditorEtiquetas, type EtiquetaFila } from "./etiquetas";

// Plan GHL B2b: pestaña «Etiquetas y UTMs» de Administración, con subvistas (?sub=). B3a añade «Etiquetas».
const SUBVISTAS = [{ v: "canales", t: "Canales" }, { v: "etiquetas", t: "Etiquetas" }];

// B3a: la lista sale de las etiquetas de los leads más la tabla `etiquetas` (orden y «usada por GHL»), en el servidor.
// shortcut: la función devuelve como mucho max_rows (1000) etiquetas; si un proyecto pasa de ahí, paginar.
async function Etiquetas() {
  const { proyecto } = await getSesion();
  const { data, error } = await db().rpc("etiquetas_del_proyecto", { p_proyecto: proyecto.id });
  if (error) throw new Error(`No se pudieron leer las etiquetas: ${error.message}`);
  const filas = ((data ?? []) as { nombre: string; leads: number; usada_ghl: boolean }[]).map((f) => ({ nombre: f.nombre, leads: Number(f.leads), usada_ghl: f.usada_ghl }) satisfies EtiquetaFila);
  return <EditorEtiquetas key={JSON.stringify(filas)} inicial={filas} />;
}

export function EtiquetasUtms({ sub, canales }: { sub: string; canales: TablaCanales }) {
  const actual = SUBVISTAS.some((s) => s.v === sub) ? sub : "canales";
  return (
    <div className="space-y-4">
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
          <EditorCanales key={JSON.stringify(canales)} inicial={canales} />
        </Seccion>
      )}
      {actual === "etiquetas" && (
        <Seccion titulo="Etiquetas">
          <p className="mb-3 text-sm text-texto-2">
            Las etiquetas de los leads de este proyecto, en minúsculas. Renombrar, unir o borrar una la cambia también en las Entradas (etiqueta base, fijas y reglas) y en los workflows (pasos y disparadores), todo a la vez. Las que usa el código de la app (por ejemplo las <code>-completo</code>/<code>-incompleto</code> o «Canal: …», que se cambian en Canales) no se pueden cambiar. Aquí no se cambia nada en GHL.
          </p>
          <Etiquetas />
        </Seccion>
      )}
    </div>
  );
}
