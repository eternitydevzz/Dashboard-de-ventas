import { Trophy, Medal, Phone, TrendingUp } from "lucide-react";
import { exigirPagina } from "@/lib/permisos";
import { cargarBase } from "@/lib/metricas";
import { calcularKpis } from "@/lib/kpis";
import { dinero, rangoDe, type Periodo, pct } from "@/lib/formato";
import { Cabecera, Contenido, Seccion, Avatar, Vacio } from "@/components/ui";
import { Filtros } from "@/components/filtros";
import { EtiquetaMercado, FiltroMercado } from "@/components/mercado-equipo";
import { esJefe } from "@/lib/auth";
import { entraEnMercado, mercadoValido } from "@/lib/mercado";
import { mercadosDelProyecto } from "@/lib/mercado-datos";

const MEDALLA = ["text-oro", "text-texto-2", "text-aviso"];

export default async function RankingPage({ searchParams }: PageProps<"/ranking">) {
  const { perfil, proyecto } = await exigirPagina("ranking"); // H5
  const sp = await searchParams;
  const periodo = (typeof sp.periodo === "string" ? sp.periodo : "semana") as Periodo;
  const rango = rangoDe(periodo, proyecto.zona_horaria, sp.desde as string, sp.hasta as string);
  const [base, mercados] = await Promise.all([cargarBase(proyecto), mercadosDelProyecto(proyecto.id)]);
  // 13 nov: los jefes filtran por mercado (Todos / España / Latam)
  const jefe = esJefe(perfil);
  const filtroM = jefe ? mercadoValido(sp.mercado) : null;
  const gente = base.gente.filter((g) => entraEnMercado(mercados, g.id, filtroM));
  // Mismas reglas que KPIs → «Por persona» (Cristian, 11 oct): un solo número por persona
  const { callers, closers } = calcularKpis({ ...base, gente }, rango, proyecto.zona_horaria);
  const rCallers = [...callers].sort((a, b) => b.agendados - a.agendados || b.cerrados - a.cerrados || b.llamadas - a.llamadas);
  const rClosers = [...closers].sort((a, b) => b.facturacion - a.facturacion || (b.cierreSobreAsistencia ?? 0) - (a.cierreSobreAsistencia ?? 0));
  const maxAg = Math.max(1, ...rCallers.map((c) => c.agendados));
  const maxFac = Math.max(1, ...rClosers.map((c) => c.facturacion));

  const Puesto = ({ i }: { i: number }) =>
    i < 3 ? <Medal className={`h-5 w-5 ${MEDALLA[i]}`} /> : <span className="w-5 text-center text-sm text-texto-3">{i + 1}</span>;

  return (
    <>
      <Cabecera titulo="Ranking del equipo" subtitulo={`${proyecto.nombre} · ${rango.etiqueta}`} acciones={jefe ? <FiltroMercado /> : undefined} />
      <Contenido>
        <Filtros periodoPorDefecto="semana" />
        <div className="grid gap-5 xl:grid-cols-2">
          <Seccion titulo="Callers · por agendados">
            {rCallers.length === 0 ? <Vacio icono={Phone} texto="Sin callers." /> : (
              <ol className="space-y-2">
                {rCallers.map((c, i) => (
                  <li key={c.perfil.id} className={`flex items-center gap-3 rounded-lg border p-3 ${c.perfil.id === perfil.id ? "border-primario bg-primario-suave/40" : "border-borde bg-panel-2"}`}>
                    <Puesto i={i} />
                    <Avatar nombre={c.perfil.nombre} foto={c.perfil.foto} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 font-medium">{c.perfil.nombre}{c.perfil.id === perfil.id && <span className="text-primario"> (tú)</span>}<EtiquetaMercado m={mercados[c.perfil.id]} /></span>
                        <span className="font-semibold tabular-nums">{c.agendados} agendados</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fondo-2"><div className="h-full rounded-full bg-primario" style={{ width: `${pct((c.agendados / maxAg) * 100)}` }} /></div>
                      <div className="mt-1 text-xs text-texto-3">{c.llamadas} llamadas · {c.contactados} contactados · {c.cerrados} cerrados · {c.lowTicketVentas} low ticket</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Seccion>
          <Seccion titulo="Closers · por facturación">
            {rClosers.length === 0 ? <Vacio icono={TrendingUp} texto="Sin closers." /> : (
              <ol className="space-y-2">
                {rClosers.map((c, i) => (
                  <li key={c.perfil.id} className={`flex items-center gap-3 rounded-lg border p-3 ${c.perfil.id === perfil.id ? "border-primario bg-primario-suave/40" : "border-borde bg-panel-2"}`}>
                    <Puesto i={i} />
                    <Avatar nombre={c.perfil.nombre} foto={c.perfil.foto} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 font-medium">{c.perfil.nombre}{c.perfil.id === perfil.id && <span className="text-primario"> (tú)</span>}<EtiquetaMercado m={mercados[c.perfil.id]} /></span>
                        <span className="font-semibold tabular-nums text-oro-texto">{dinero(c.facturacion, proyecto)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fondo-2"><div className="h-full rounded-full bg-oro" style={{ width: `${pct((c.facturacion / maxFac) * 100)}` }} /></div>
                      <div className="mt-1 text-xs text-texto-3">{c.cerradas} cerradas · {pct(c.cierreSobreAsistencia)} cierre/asist. · {c.asistidas} asistidas · {c.noShow} no show</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Seccion>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-texto-3"><Trophy className="h-3.5 w-3.5 text-oro" /> Callers ordenados por agendados; closers por facturación. Mismas cifras que «KPIs por persona».</p>
      </Contenido>
    </>
  );
}
