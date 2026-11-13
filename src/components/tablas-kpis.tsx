import { Phone, TrendingUp, Users } from "lucide-react";
import type { calcularKpis } from "@/lib/kpis";
import { pct } from "@/lib/formato";
import { Avatar, Vacio } from "@/components/ui";
import { EtiquetaMercado } from "@/components/mercado-equipo";
import { mercadoDe, type Mercado } from "@/lib/mercado";

type Kpis = ReturnType<typeof calcularKpis>;

// Columnas con su explicación (sale al pasar el ratón por la cabecera)
const COL_CALLER = [
  { t: "Llamadas", d: "Llamadas apuntadas en el periodo" },
  { t: "Contactados", d: "Personas a las que llamó o escribió por WhatsApp (agendar cuenta como llamada)" },
  { t: "Contestan", d: "De los contactados, los que respondieron la llamada (agendar cuenta como contestada)" },
  { t: "Agendados", d: "Personas con una cita agendada por el caller en el periodo" },
  { t: "% ag./contact.", d: "Agendados ÷ contactados" },
  { t: "% ag./contestan", d: "Agendados ÷ los que contestan" },
  { t: "Cerrados", d: "De sus agendados, los que compraron al closer desde el día de la agenda" },
  { t: "% cierre/contact.", d: "Cerrados ÷ contactados" },
  { t: "% cierre/agend.", d: "Cerrados ÷ agendados" },
  { t: "% asistencia", d: "De sus agendados con la cita ya pasada (sin canceladas), los que se presentaron" },
  { t: "% cierre/asist.", d: "De los que se presentaron, los que compraron" },
  { t: "Low ticket", d: "Ventas que hizo el propio caller (aparte del cierre)" },
];

const COL_CLOSER = [
  { t: "Citas", d: "Citas del periodo por su fecha, sin reagendadas ni canceladas" },
  { t: "Asistidas", d: "Citas a las que vino el lead (cerrada, seguimiento o perdida)" },
  { t: "Cerradas", d: "Citas cerradas con venta" },
  { t: "% cierre/agenda", d: "Cerradas ÷ citas" },
  { t: "% cierre/asist.", d: "Cerradas ÷ asistidas" },
  { t: "Facturación", d: "Valor de sus ventas del periodo" },
  { t: "% fact. del total", d: "Su facturación ÷ la de todos los closers" },
  { t: "Cash", d: "Dinero que entró en el periodo de sus ventas (como Finanzas: al vender + cuotas − devoluciones)" },
  { t: "% cash del total", d: "Su cash ÷ el de todos los closers" },
  { t: "% cobrado", d: "De lo que vendió en el periodo, cuánto se ha cobrado ya (menos devoluciones)" },
];

function Cabeceras({ primera, cols }: { primera: string; cols: { t: string; d: string }[] }) {
  return (
    <thead>
      <tr>
        <th>{primera}</th>
        {cols.map((c) => (
          <th key={c.t} title={c.d} className="whitespace-nowrap">{c.t}</th>
        ))}
      </tr>
    </thead>
  );
}

function Persona({ nombre, mercado }: { nombre: string; mercado?: Mercado }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <Avatar nombre={nombre} tamano="h-7 w-7 text-[10px]" />
      {nombre}
      {mercado && <EtiquetaMercado m={mercado} />}
    </div>
  );
}

type FilaCaller = Kpis["totalCallers"];
function CeldasCaller({ c, dinero }: { c: FilaCaller; dinero: (n: number) => string }) {
  return (
    <>
      <td className="tabular-nums">{c.llamadas}</td>
      <td className="tabular-nums">{c.contactados}</td>
      <td className="tabular-nums">{c.contestan}</td>
      <td className="tabular-nums">{c.agendados}</td>
      <td className="tabular-nums">{pct(c.agendaSobreContactado)}</td>
      <td className="tabular-nums">{pct(c.agendaSobreContesta)}</td>
      <td className="tabular-nums">{c.cerrados}</td>
      <td className="tabular-nums">{pct(c.cierreSobreContactado)}</td>
      <td className="tabular-nums">{pct(c.cierreSobreAgendado)}</td>
      <td className="tabular-nums">{pct(c.asistencia)}</td>
      <td className="tabular-nums">{pct(c.cierreSobreAsistencia)}</td>
      <td className="whitespace-nowrap tabular-nums">{c.lowTicketVentas ? `${c.lowTicketVentas} · ${dinero(c.lowTicketFacturacion)}` : "—"}</td>
    </>
  );
}

type FilaCloser = Kpis["totalClosers"];
function CeldasCloser({ c, dinero }: { c: FilaCloser; dinero: (n: number) => string }) {
  return (
    <>
      <td className="tabular-nums">{c.citas}</td>
      <td className="tabular-nums">{c.asistidas}</td>
      <td className="tabular-nums">{c.cerradas}</td>
      <td className="tabular-nums">{pct(c.cierreSobreAgenda)}</td>
      <td className="tabular-nums">{pct(c.cierreSobreAsistencia)}</td>
      <td className="whitespace-nowrap tabular-nums">{dinero(c.facturacion)}</td>
      <td className="tabular-nums">{pct(c.parteFacturacion)}</td>
      <td className="whitespace-nowrap tabular-nums">{dinero(c.cash)}</td>
      <td className="tabular-nums">{pct(c.parteCash)}</td>
      <td className="tabular-nums">{pct(c.pctCobrado)}</td>
    </>
  );
}

const FILA_TOTAL = "bg-panel-2 font-semibold";

// `mercados` (13 nov): con él, «ES» / «LATAM» junto a cada nombre
export function TablasKpis({ kpis, dinero, sinTotales, mercados }: { kpis: Kpis; dinero: (n: number) => string; sinTotales?: boolean; mercados?: Record<string, Mercado> }) {
  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto rounded-lg border border-borde">
        <div className="flex items-center gap-2 border-b border-borde bg-panel-2 px-3 py-2 text-sm font-semibold">
          <Phone className="h-4 w-4 text-primario" /> Callers
        </div>
        {kpis.callers.length === 0 ? (
          <Vacio icono={Users} texto={sinTotales ? "Aquí solo ves lo tuyo." : "No hay callers en este proyecto."} />
        ) : (
          <table className="tabla">
            <Cabeceras primera="Caller" cols={COL_CALLER} />
            <tbody>
              {kpis.callers.map((c) => (
                <tr key={c.perfil.id}>
                  <td><Persona nombre={c.perfil.nombre} mercado={mercados && mercadoDe(mercados[c.perfil.id])} /></td>
                  <CeldasCaller c={c} dinero={dinero} />
                </tr>
              ))}
              {!sinTotales && <tr className={FILA_TOTAL}>
                <td>Total callers</td>
                <CeldasCaller c={kpis.totalCallers} dinero={dinero} />
              </tr>}
            </tbody>
          </table>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-borde">
        <div className="flex items-center gap-2 border-b border-borde bg-panel-2 px-3 py-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4 text-primario" /> Closers
        </div>
        {kpis.closers.length === 0 ? (
          <Vacio icono={Users} texto={sinTotales ? "Aquí solo ves lo tuyo." : "No hay closers en este proyecto."} />
        ) : (
          <table className="tabla">
            <Cabeceras primera="Closer" cols={COL_CLOSER} />
            <tbody>
              {kpis.closers.map((c) => (
                <tr key={c.perfil.id}>
                  <td><Persona nombre={c.perfil.nombre} mercado={mercados && mercadoDe(mercados[c.perfil.id])} /></td>
                  <CeldasCloser c={c} dinero={dinero} />
                </tr>
              ))}
              {!sinTotales && <tr className={FILA_TOTAL}>
                <td>Total closers</td>
                <CeldasCloser c={kpis.totalClosers} dinero={dinero} />
              </tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// «¿Cómo se calcula?» para la página de KPIs
export function ExplicacionKpis() {
  return (
    <div className="grid gap-4 text-sm md:grid-cols-2">
      {[
        { t: "Callers", cols: COL_CALLER },
        { t: "Closers", cols: COL_CLOSER },
      ].map((g) => (
        <div key={g.t}>
          <div className="titulo-seccion mb-2">{g.t}</div>
          <ul className="space-y-1 text-texto-2">
            {g.cols.map((c) => (
              <li key={c.t}><b className="text-texto">{c.t}:</b> {c.d}.</li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-xs text-texto-3 md:col-span-2">Se cuentan personas, no llamadas. La fila «Total» aplica las mismas reglas a todo el grupo (si dos callers llaman a la misma persona, cuenta una vez).</p>
    </div>
  );
}
