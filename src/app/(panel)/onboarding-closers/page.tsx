import Link from "next/link";
import { ListChecks } from "lucide-react";
import { exigirPagina } from "@/lib/permisos";
import { esJefe } from "@/lib/auth";
import { esCloser } from "@/lib/tipos";
import { equipo } from "@/lib/datos";
import { clientesDeCloser, pasosCloser } from "@/lib/onboarding-closer";
import { fecha } from "@/lib/formato";
import { Anillo, Cabecera, Contenido, Seccion, Vacio } from "@/components/ui";
import { ChecklistCliente, EditorPasosCloser, FiltroCloser } from "./cliente";

// Onboarding de los closers (bloque 7 de 1.0, Cristian 10 y 11 oct 2026). Aparte del onboarding de clientes.
export default async function OnboardingClosersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { perfil, proyecto } = await exigirPagina("agendas");
  const jefe = esJefe(perfil);
  if (!jefe && !esCloser(perfil)) return <Contenido><Vacio icono={ListChecks} texto="El onboarding es de los closers." /></Contenido>;
  const sp = await searchParams;
  const filtro = jefe && typeof sp.closer === "string" ? sp.closer : "";
  const [pasos, clientes, gente] = await Promise.all([pasosCloser(proyecto.id), clientesDeCloser(proyecto.id, perfil, filtro), equipo(proyecto.id)]);
  const closers = gente.filter(esCloser);
  const nombre = (id: string) => gente.find((g) => g.id === id)?.nombre ?? "—";
  const completos = pasos.length ? clientes.filter((c) => pasos.every((p) => c.hechos[p.id])).length : 0;
  return (
    <>
      <Cabecera titulo={jefe ? "Onboarding de los closers" : "Mi onboarding"} subtitulo={`${proyecto.nombre} · ${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"} · ${completos} con todo hecho`} acciones={jefe ? <FiltroCloser closers={closers.map((c) => ({ id: c.id, nombre: c.nombre }))} valor={filtro} /> : undefined} />
      <Contenido>
        {clientes.length === 0 ? (
          <div className="tarjeta"><Vacio icono={ListChecks} texto={jefe ? "Ningún closer tiene clientes todavía." : "Aquí saldrán tus clientes cuando registres una venta."} /></div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {clientes.map((c) => (
              <Seccion key={`${c.lead_id}-${c.closer_id}`}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/leads/${c.lead_id}`} className="font-semibold hover:text-primario">{c.nombre}</Link>
                    <div className="text-xs text-texto-3">{c.productos.join(" · ")} · desde {fecha(c.desde, proyecto)}{jefe ? ` · ${nombre(c.closer_id)}` : ""}</div>
                  </div>
                  <Anillo valor={pasos.length ? Math.round((pasos.filter((p) => c.hechos[p.id]).length / pasos.length) * 100) : 0} tamano={56} color="var(--ok)" />
                </div>
                <ChecklistCliente leadId={c.lead_id} pasos={pasos.map((p) => ({ id: p.id, nombre: p.nombre }))} hechos={c.hechos} editable={jefe} />
              </Seccion>
            ))}
          </div>
        )}
        {jefe && clientes.length === 0 && (
          <Seccion titulo="Puntos del onboarding (los ven todos los closers)">
            <EditorPasosCloser pasos={pasos.map((p) => ({ id: p.id, nombre: p.nombre }))} />
          </Seccion>
        )}
      </Contenido>
    </>
  );
}
