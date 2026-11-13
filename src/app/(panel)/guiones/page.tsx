import { ETIQUETA_ESTADO } from "@/lib/estados-caller";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { esJefe, getSesion } from "@/lib/auth";
import { db, equipo } from "@/lib/datos";
import { cargarGuion, ultimasMarcas } from "@/lib/guiones-datos";
import { fechaHora, pct, porcentaje } from "@/lib/formato";
import { Cabecera, Contenido, Seccion, Vacio } from "@/components/ui";
import { FiltroUrl } from "@/components/barra-periodo";
import type { RolGuion } from "@/lib/guiones";
import { EditorGuion } from "./editor";
import { mercadoValido } from "@/lib/mercado";
import { SelectorMercado } from "@/components/selector-mercado";

// Fase 6 · Guiones de llamada (Cristian, 12 oct 2026): el CEO y los directores editan el guion del caller y el del
// closer y revisan lo que marcó cada uno en sus llamadas.
// C11: los resultados nuevos y los del historial de antes del 7 nov
const RESULTADO: Record<string, string> = { ...ETIQUETA_ESTADO, luego: "Llamar luego", link: "Link enviado", agendar: "Agendar", venta: "Venta" };

export default async function GuionesPage({ searchParams }: PageProps<"/guiones">) {
  const { perfil, proyecto } = await getSesion();
  if (!esJefe(perfil)) redirect("/");
  const sp = await searchParams;
  const rol: RolGuion = sp.rol === "closer" ? "closer" : "caller";
  const mercado = mercadoValido(sp.mercado) ?? "latam"; // 13 nov: el guion de Latam o el de España
  const [{ guion, deEjemplo, propio }, marcas, gente] = await Promise.all([cargarGuion(proyecto.id, rol, mercado), ultimasMarcas(proyecto.id), equipo(proyecto.id)]);
  const persona = typeof sp.persona === "string" ? sp.persona : "";
  const filas = marcas.filas.filter((m) => !persona || m.perfil_id === persona);
  const nombre = (id: string | null) => gente.find((g) => g.id === id)?.nombre ?? "—";
  const leadIds = [...new Set(filas.map((f) => f.lead_id))];
  const { data: leads } = leadIds.length ? await db().from("leads").select("id, nombre, apellido").in("id", leadIds) : { data: [] };
  const nombreLead = new Map((leads ?? []).map((l) => [l.id, `${l.nombre} ${l.apellido}`.trim() || "Sin nombre"]));

  return (
    <>
      <Cabecera titulo="Guiones" subtitulo={`${proyecto.nombre} · lo que sale al pulsar «Llamar»`} />
      <Contenido>
        <div className="tarjeta flex gap-1 p-1.5" role="tablist">
          {(["caller", "closer"] as const).map((r) => (
            <Link key={r} href={`/guiones?rol=${r}${mercado === "es" ? "&mercado=es" : ""}`} role="tab" aria-selected={rol === r} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${rol === r ? "bg-primario text-white" : "text-texto-2 hover:bg-panel-2"}`}>
              Guion del {r}
            </Link>
          ))}
        </div>
        <SelectorMercado actual={mercado} href={(m) => `/guiones?rol=${rol}${m === "es" ? "&mercado=es" : ""}`} />
        <Seccion titulo={`Guion del ${rol}${mercado === "es" ? " · España" : ""}`}>
          <EditorGuion key={`${rol}-${mercado}-${deEjemplo}-${propio}`} rol={rol} guion={guion} deEjemplo={deEjemplo} mercado={mercado} propio={propio} />
        </Seccion>
        <Seccion
          titulo="Lo que marcó cada uno"
          acciones={<FiltroUrl nombre="persona" etiqueta="Persona" todos="Todo el equipo" opciones={gente.filter((g) => g.rol === "caller" || g.rol === "closer").map((g) => ({ v: g.id, t: `${g.nombre} · ${g.rol}` }))} />}
        >
          {marcas.sinTabla ? (
            <p className="text-sm text-aviso">Falta aplicar la migración de la base (guiones): de momento no se guarda lo que marca cada uno.</p>
          ) : filas.length === 0 ? (
            <Vacio icono={ScrollText} texto="Aún no hay llamadas hechas con el guion." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-borde">
              <table className="tabla">
                <thead><tr><th>Cuándo</th><th>Quién</th><th>Lead</th><th>Guion</th><th>Checklist</th><th>Resultado</th></tr></thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.id}>
                      <td className="whitespace-nowrap text-xs text-texto-2">{fechaHora(f.creado_en, proyecto)}</td>
                      <td className="whitespace-nowrap">{nombre(f.perfil_id)}</td>
                      <td><Link href={`/leads/${f.lead_id}`} className="hover:text-primario">{nombreLead.get(f.lead_id) ?? "—"}</Link></td>
                      <td className="text-texto-2">{f.rol}</td>
                      <td className="whitespace-nowrap tabular-nums">{f.hechos}/{f.total} <span className="text-xs text-texto-3">({pct(porcentaje(f.hechos, f.total))})</span></td>
                      <td>{f.resultado ? RESULTADO[f.resultado] ?? f.resultado : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Seccion>
      </Contenido>
    </>
  );
}
