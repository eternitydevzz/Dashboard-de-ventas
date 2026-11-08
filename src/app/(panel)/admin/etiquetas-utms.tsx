import Link from "next/link";
import { Seccion } from "@/components/ui";
import type { TablaCanales } from "@/lib/canal";
import { EditorCanales } from "./canales";

// Plan GHL B2b: pestaña «Etiquetas y UTMs» de Administración, con subvistas (?sub=). B3a añade «Etiquetas».
const SUBVISTAS = [{ v: "canales", t: "Canales" }];

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
    </div>
  );
}
