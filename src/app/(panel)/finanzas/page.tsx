import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, ShoppingCart, HandCoins, TrendingUp, TrendingDown, Landmark, ListChecks, Coins } from "lucide-react";
import { getSesion, esJefe } from "@/lib/auth";
import { puedeSeccion } from "@/lib/permisos";
import { leerPeriodo, rangoNav } from "@/lib/periodos";
import { Cabecera, Contenido } from "@/components/ui";
import { BarraPeriodo } from "@/components/barra-periodo";
import { cargarPantallaFinanzas } from "./cargar";
import { GuiaFinanciera, TipoCambio } from "./cliente";
import { TabResumen } from "./tab-resumen";
import { TabVentas } from "./tab-ventas";
import { TabLiquidaciones } from "./tab-liquidaciones";
import { TabIngresos, TabEgresos } from "./tab-gastos";
import { TabCuentas, TabMovimientos } from "./tab-cuentas";

const PESTANAS = [
  { v: "resumen", t: "Resumen", icono: LayoutDashboard },
  { v: "ventas", t: "Ventas", icono: ShoppingCart },
  { v: "liquidaciones", t: "Liquidaciones", icono: HandCoins },
  { v: "ingresos", t: "Ingresos extra", icono: TrendingUp },
  { v: "egresos", t: "Egresos", icono: TrendingDown },
  { v: "cuentas", t: "Cuentas", icono: Landmark },
  { v: "movimientos", t: "Movimientos", icono: ListChecks },
  { v: "divisas", t: "Divisas", icono: Coins },
] as const;
type Tab = (typeof PESTANAS)[number]["v"];

export default async function FinanzasPage({ searchParams }: PageProps<"/finanzas">) {
  const { perfil, proyecto } = await getSesion();
  if (!(await puedeSeccion(perfil, proyecto.id, "finanzas"))) redirect("/");
  const sp = await searchParams;
  const tab = (PESTANAS.some((p) => p.v === sp.tab) ? sp.tab : "resumen") as Tab;
  const p = leerPeriodo(sp);
  const rango = rangoNav(p.periodo, p.n, proyecto.zona_horaria, p.desde, p.hasta);
  const d = await cargarPantallaFinanzas(proyecto);
  const conPeriodo = tab !== "liquidaciones" && tab !== "divisas" && !(tab === "ventas" && sp.ver === "pendientes") && !(tab === "egresos" && sp.ver === "programados");
  const qs = (t: string) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => typeof v === "string" && ["p", "n", "desde", "hasta"].includes(k)) as [string, string][]);
    q.set("tab", t);
    return `/finanzas?${q}`;
  };

  return (
    <>
      <Cabecera titulo="Finanzas" subtitulo={`${proyecto.nombre} · ${conPeriodo ? rango.etiqueta : "todo el dinero del negocio"}`} acciones={<GuiaFinanciera />} />
      <Contenido>
        <nav className="flex flex-wrap gap-1 rounded-xl border border-borde bg-panel p-1" aria-label="Secciones de Finanzas">
          {PESTANAS.map((x) => {
            const Icono = x.icono;
            return (
              <Link prefetch={true} key={x.v} href={qs(x.v)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${tab === x.v ? "bg-primario font-medium text-white" : "text-texto-2 hover:bg-panel-2"}`}>
                <Icono className="h-4 w-4" /> {x.t}
              </Link>
            );
          })}
        </nav>
        {conPeriodo && <div className="tarjeta flex justify-end p-2.5"><BarraPeriodo etiqueta={rango.etiqueta} /></div>}

        {tab === "resumen" && <TabResumen d={d} rango={rango} proyecto={proyecto} />}
        {tab === "ventas" && <TabVentas d={d} rango={rango} proyecto={proyecto} sp={sp} jefe={esJefe(perfil)} />}
        {tab === "liquidaciones" && <TabLiquidaciones d={d} proyecto={proyecto} sp={sp} yo={perfil} />}
        {tab === "ingresos" && <TabIngresos d={d} rango={rango} proyecto={proyecto} />}
        {tab === "egresos" && <TabEgresos d={d} rango={rango} proyecto={proyecto} sp={sp} />}
        {tab === "cuentas" && <TabCuentas d={d} rango={rango} proyecto={proyecto} />}
        {tab === "movimientos" && <TabMovimientos d={d} rango={rango} proyecto={proyecto} sp={sp} />}
        {tab === "divisas" && (
          <section className="tarjeta max-w-xl space-y-4 p-5">
            <h2 className="titulo-seccion">Tipo de cambio (a mano)</h2>
            <p className="text-sm text-texto-2">Este proyecto trabaja en <b>{proyecto.moneda}</b>. Con el cambio puesto, el Resumen enseña también el total en {proyecto.moneda === "EUR" ? "dólares" : "euros"}. No se actualiza solo: cámbialo cuando quieras.</p>
            <TipoCambio porUsd={d.porUsd} />
          </section>
        )}
      </Contenido>
    </>
  );
}
