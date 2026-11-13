"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, ArrowLeftRight, Upload, Calculator, Check, BookOpen, Undo2, CalendarClock, Settings2, Play } from "lucide-react";
import { Modal } from "@/components/modal";
import { useAccion } from "@/components/acciones-lead";
import { exigirOk } from "@/lib/resultado-cliente";
import {
  borrarMovimiento,
  borrarProgramado,
  calcularLiquidaciones,
  cambiarVencimiento,
  conciliarMovimiento,
  crearMovimiento,
  crearProgramado,
  desmarcarLiquidacion,
  guardarCategoria,
  guardarCuenta,
  guardarTipoCambio,
  importarMovimientos,
  marcarVencimiento,
  nuevoDeudor,
  pagarLiquidacion,
  registrarProgramado,
  transferir,
} from "./acciones";
import { confirmar } from "@/components/dialogos";
import { Desplegable, Pastillas } from "@/components/eleccion";

type Op = { id: string; nombre: string };
type Cat = Op & { tipo: "ingreso" | "egreso"; en_profit: boolean };

export function NuevoMovimiento({ tipo, categorias, cuentas }: { tipo: "ingreso" | "egreso"; categorias: Cat[]; cuentas: Op[] }) {
  const [abierto, setAbierto] = useState(false);
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <>
      <button className="btn-primario" onClick={() => setAbierto(true)}><Plus className="h-4 w-4" /> {tipo === "ingreso" ? "Nuevo ingreso" : "Nuevo gasto"}</button>
      {abierto && (
        <Modal titulo={tipo === "ingreso" ? "Nuevo ingreso extra" : "Nuevo gasto"} onCerrar={() => setAbierto(false)}>
          <form
            className="space-y-3"
            action={(fd) => {
              ejecutar(async () => {
                const r = await crearMovimiento({ tipo, importe: String(fd.get("importe")), fecha: String(fd.get("fecha") ?? ""), categoria_id: String(fd.get("categoria") || "") || null, cuenta_id: String(fd.get("cuenta") || "") || null, descripcion: String(fd.get("descripcion") ?? "") });
                if (!(r && typeof r === "object" && "error" in r)) setAbierto(false);
                return r;
              }, "Guardado");
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="etiqueta-campo">Importe</span><input name="importe" inputMode="decimal" required className="campo" /></label>
              <label className="block"><span className="etiqueta-campo">Fecha</span><input name="fecha" type="date" className="campo" /></label>
              <label className="block"><span className="etiqueta-campo">Categoría</span><Desplegable name="categoria" className="campo"><option value="">Sin categoría</option>{categorias.filter((c) => c.tipo === tipo).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Desplegable></label>
              <label className="block"><span className="etiqueta-campo">Cuenta</span><Desplegable name="cuenta" className="campo"><option value="">La de por defecto</option>{cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Desplegable></label>
            </div>
            <label className="block"><span className="etiqueta-campo">Descripción</span><input name="descripcion" className="campo" placeholder={tipo === "egreso" ? "Ej. Anuncios de Meta, octubre" : "Ej. Afiliado"} /></label>
            {error && <p className="text-sm text-mal">{error}</p>}
            <button className="btn-primario w-full" disabled={pendiente}>Guardar</button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function BorrarMovimiento({ id }: { id: string }) {
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <span className="inline-flex items-center gap-1">
      <button className="rounded-md p-1.5 text-texto-3 hover:bg-mal-suave hover:text-mal" disabled={pendiente} title="Borrar" onClick={() => void confirmar("¿Borrar este movimiento?").then((ok) => ok && ejecutar(() => borrarMovimiento(id), "Borrado"))}><Trash2 className="h-4 w-4" /></button>
      {error && <span className="text-xs text-mal">{error}</span>}
    </span>
  );
}

export function Categorias({ tipo, categorias }: { tipo: "ingreso" | "egreso"; categorias: Cat[] }) {
  const [abierto, setAbierto] = useState(false);
  const { pendiente, error, ejecutar } = useAccion();
  const mias = categorias.filter((c) => c.tipo === tipo);
  return (
    <>
      <button className="btn-secundario" onClick={() => setAbierto(true)}><Settings2 className="h-4 w-4" /> {tipo === "egreso" ? "Categorías y gastos en profit/ROAS" : "Categorías"}</button>
      {abierto && (
        <Modal titulo={tipo === "egreso" ? "Categorías de gastos" : "Categorías de ingresos"} onCerrar={() => setAbierto(false)}>
          <div className="space-y-2 text-sm">
            {tipo === "egreso" && <p className="text-xs text-texto-3">Marca qué gastos cuentan en el <b>profit</b> y en el <b>ROAS</b> (por ejemplo, deja fuera los gastos personales).</p>}
            {mias.map((c) => (
              <form key={c.id} className="flex items-center gap-2" action={(fd) => ejecutar(() => guardarCategoria(c.id, tipo, String(fd.get("nombre")), fd.get("profit") === "on"), "Guardada")}>
                <input name="nombre" defaultValue={c.nombre} className="campo py-1.5" aria-label="Nombre" />
                {tipo === "egreso" && <label className="flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" className="interruptor" name="profit" defaultChecked={c.en_profit} /> En profit/ROAS</label>}
                <button className="rounded-md p-1.5 text-texto-3 hover:bg-panel-2" disabled={pendiente} title="Guardar"><Check className="h-4 w-4" /></button>
              </form>
            ))}
            <form className="flex items-center gap-2 border-t border-borde pt-2" action={(fd) => ejecutar(() => guardarCategoria(null, tipo, String(fd.get("nombre")), true), "Categoría creada")}>
              <input name="nombre" required placeholder="Nueva categoría" className="campo py-1.5" />
              <button className="btn-secundario px-2 py-1.5" disabled={pendiente}><Plus className="h-4 w-4" /></button>
            </form>
            {error && <p className="text-mal">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

const METODOS = [["stripe", "Stripe"], ["transferencia", "Transferencia"], ["otro", "Otro"]];
export function EditarCuenta({ cuenta }: { cuenta: { id: string; nombre: string; metodos: string[] } | null }) {
  const [abierto, setAbierto] = useState(false);
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <>
      {cuenta ? <button className="text-xs text-primario hover:underline" onClick={() => setAbierto(true)}>Editar</button> : <button className="btn-primario" onClick={() => setAbierto(true)}><Plus className="h-4 w-4" /> Nueva cuenta</button>}
      {abierto && (
        <Modal titulo={cuenta ? `Cuenta · ${cuenta.nombre}` : "Nueva cuenta"} onCerrar={() => setAbierto(false)}>
          <form className="space-y-3 text-sm" action={(fd) => ejecutar(async () => { const r = await guardarCuenta(cuenta?.id ?? null, String(fd.get("nombre")), fd.getAll("metodos").map(String)); if (!(r && typeof r === "object" && "error" in r)) setAbierto(false); return r; }, "Cuenta guardada")}>
            <label className="block"><span className="etiqueta-campo">Nombre</span><input name="nombre" required defaultValue={cuenta?.nombre} className="campo" placeholder="Ej. Banco, Stripe" /></label>
            <fieldset><legend className="etiqueta-campo">Recibe los cobros pagados con…</legend>{METODOS.map(([v, t]) => <label key={v} className="mr-4 inline-flex items-center gap-1.5"><input type="checkbox" name="metodos" value={v} defaultChecked={cuenta?.metodos.includes(v)} /> {t}</label>)}</fieldset>
            <p className="text-xs text-texto-3">Lo que no vaya a ninguna cuenta entra en la cuenta por defecto.</p>
            {error && <p className="text-mal">{error}</p>}
            <button className="btn-primario w-full" disabled={pendiente}>Guardar</button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function Transferir({ cuentas, desde }: { cuentas: Op[]; desde: string }) {
  const [abierto, setAbierto] = useState(false);
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <>
      <button className="btn-secundario" onClick={() => setAbierto(true)} disabled={cuentas.length < 2} title={cuentas.length < 2 ? "Crea otra cuenta para poder transferir" : ""}><ArrowLeftRight className="h-4 w-4" /> Transferir</button>
      {abierto && (
        <Modal titulo="Transferir entre cuentas" onCerrar={() => setAbierto(false)}>
          <form className="space-y-3" action={(fd) => ejecutar(async () => { const r = await transferir(String(fd.get("origen")), String(fd.get("destino")), String(fd.get("importe")), String(fd.get("fecha") ?? ""), String(fd.get("descripcion") ?? "")); if (!(r && typeof r === "object" && "error" in r)) setAbierto(false); return r; }, "Transferencia hecha")}>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="etiqueta-campo">Desde</span><Desplegable name="origen" className="campo" defaultValue={desde}>{cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Desplegable></label>
              <label className="block"><span className="etiqueta-campo">Hacia</span><Desplegable name="destino" className="campo" defaultValue={cuentas.find((c) => c.id !== desde)?.id}>{cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Desplegable></label>
              <label className="block"><span className="etiqueta-campo">Importe</span><input name="importe" inputMode="decimal" required className="campo" /></label>
              <label className="block"><span className="etiqueta-campo">Fecha</span><input name="fecha" type="date" className="campo" /></label>
            </div>
            <input name="descripcion" className="campo" placeholder="Descripción (opcional)" />
            {error && <p className="text-sm text-mal">{error}</p>}
            <button className="btn-primario w-full" disabled={pendiente}>Transferir</button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function NuevoProgramado({ categorias, cuentas }: { categorias: Cat[]; cuentas: Op[] }) {
  const [abierto, setAbierto] = useState(false);
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <>
      <button className="btn-primario" onClick={() => setAbierto(true)}><CalendarClock className="h-4 w-4" /> Nuevo gasto programado</button>
      {abierto && (
        <Modal titulo="Gasto que se repite" onCerrar={() => setAbierto(false)}>
          <form className="space-y-3" action={(fd) => ejecutar(async () => { const r = await crearProgramado({ descripcion: String(fd.get("descripcion")), importe: String(fd.get("importe")), categoria_id: String(fd.get("categoria") || "") || null, cuenta_id: String(fd.get("cuenta") || "") || null, cada: String(fd.get("cada")) as "mes", proxima: String(fd.get("proxima")) }); if (!(r && typeof r === "object" && "error" in r)) setAbierto(false); return r; }, "Gasto programado")}>
            <label className="block"><span className="etiqueta-campo">Descripción</span><input name="descripcion" required className="campo" placeholder="Ej. Licencia de GHL" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="etiqueta-campo">Importe</span><input name="importe" inputMode="decimal" required className="campo" /></label>
              <label className="block"><span className="etiqueta-campo">Cada</span><Pastillas name="cada" className="campo" defaultValue="mes"><option value="semana">Semana</option><option value="mes">Mes</option><option value="anio">Año</option></Pastillas></label>
              <label className="block"><span className="etiqueta-campo">Próximo pago</span><input name="proxima" type="date" required className="campo" /></label>
              <label className="block"><span className="etiqueta-campo">Categoría</span><Desplegable name="categoria" className="campo"><option value="">Sin categoría</option>{categorias.filter((c) => c.tipo === "egreso").map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Desplegable></label>
            </div>
            <Desplegable name="cuenta" className="campo" aria-label="Cuenta"><option value="">Cuenta por defecto</option>{cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Desplegable>
            {error && <p className="text-sm text-mal">{error}</p>}
            <button className="btn-primario w-full" disabled={pendiente}>Guardar</button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function AccionesProgramado({ id }: { id: string }) {
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <span className="inline-flex items-center gap-1">
      <button className="btn-secundario px-2 py-1 text-xs" disabled={pendiente} onClick={() => ejecutar(() => registrarProgramado(id), "Pago registrado como gasto")} title="Registra este pago como gasto y pasa al siguiente"><Play className="h-3.5 w-3.5" /> Registrar pago</button>
      <button className="rounded-md p-1.5 text-texto-3 hover:bg-mal-suave hover:text-mal" disabled={pendiente} onClick={() => void confirmar("¿Quitar este gasto programado? Los pagos ya registrados se quedan.").then((ok) => ok && ejecutar(() => borrarProgramado(id), "Quitado"))} title="Quitar"><Trash2 className="h-4 w-4" /></button>
      {error && <span className="text-xs text-mal">{error}</span>}
    </span>
  );
}

export function NuevoDeudor() {
  const [abierto, setAbierto] = useState(false);
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <>
      <button className="btn-primario" onClick={() => setAbierto(true)}><Plus className="h-4 w-4" /> Nuevo deudor</button>
      {abierto && (
        <Modal titulo="Nuevo deudor" onCerrar={() => setAbierto(false)}>
          <form className="space-y-3" action={(fd) => ejecutar(async () => { const r = await nuevoDeudor(String(fd.get("nombre")), String(fd.get("importe")), String(fd.get("vence"))); if (!(r && typeof r === "object" && "error" in r)) setAbierto(false); return r; }, "Deudor añadido")}>
            <label className="block"><span className="etiqueta-campo">Quién debe</span><input name="nombre" required className="campo" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="etiqueta-campo">Importe</span><input name="importe" inputMode="decimal" required className="campo" /></label>
              <label className="block"><span className="etiqueta-campo">Vence el</span><input name="vence" type="date" required className="campo" /></label>
            </div>
            <p className="text-xs text-texto-3">Para lo que falta de una venta (reserva o cuotas) no hace falta: se crea solo al registrar la venta.</p>
            {error && <p className="text-sm text-mal">{error}</p>}
            <button className="btn-primario w-full" disabled={pendiente}>Guardar</button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function AccionesVencimiento({ id, deVenta, estado, venceEl }: { id: string; deVenta: boolean; estado: string; venceEl: string }) {
  const { pendiente, error, ejecutar } = useAccion();
  const [fecha, setFecha] = useState(false);
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      {!deVenta && estado !== "pagado" && <button className="btn-secundario px-2 py-1 text-xs" disabled={pendiente} onClick={() => ejecutar(() => marcarVencimiento(id, "pagado"), "Marcado como cobrado")}><Check className="h-3.5 w-3.5" /> Cobrado</button>}
      {estado !== "no_paga" && estado !== "pagado" && <button className="btn-secundario px-2 py-1 text-xs hover:text-mal" disabled={pendiente} onClick={() => void confirmar("¿Marcar como «no paga»?").then((ok) => ok && ejecutar(() => marcarVencimiento(id, "no_paga"), "Marcado como no paga"))}>No paga</button>}
      {estado === "no_paga" && <button className="btn-secundario px-2 py-1 text-xs" disabled={pendiente} onClick={() => ejecutar(() => marcarVencimiento(id, "pendiente"), "Vuelve a pendiente")}><Undo2 className="h-3.5 w-3.5" /> Pendiente</button>}
      {!deVenta && estado === "pagado" && <button className="btn-secundario px-2 py-1 text-xs" disabled={pendiente} title="Se marcó como cobrado por error: vuelve a pendiente y se borra el ingreso que se creó" onClick={() => void confirmar("¿Deshacer el cobro? Vuelve a pendiente y se borra el ingreso que se creó.").then((ok) => ok && ejecutar(() => marcarVencimiento(id, "pendiente"), "Cobro deshecho"))}><Undo2 className="h-3.5 w-3.5" /> Deshacer</button>}
      {estado !== "pagado" && (fecha ? (
        <input type="date" defaultValue={venceEl} className="campo w-auto py-1 text-xs" autoFocus onBlur={(e) => { setFecha(false); if (e.target.value && e.target.value !== venceEl) ejecutar(() => cambiarVencimiento(id, e.target.value), "Fecha cambiada"); }} aria-label="Nueva fecha" />
      ) : (
        <button className="rounded-md p-1.5 text-texto-3 hover:bg-panel-2" onClick={() => setFecha(true)} title="Cambiar la fecha"><CalendarClock className="h-4 w-4" /></button>
      ))}
      {error && <span className="w-full text-right text-xs text-mal">{error}</span>}
    </span>
  );
}

export function ImportarBanco({ cuentas }: { cuentas: Op[] }) {
  const [abierto, setAbierto] = useState(false);
  const [cuenta, setCuenta] = useState("");
  const [res, setRes] = useState<{ importados: number; fallos: string[] } | null>(null);
  const [error, setError] = useState("");
  const [cargando, iniciar] = useTransition();
  return (
    <>
      <button className="btn-secundario" onClick={() => setAbierto(true)}><Upload className="h-4 w-4" /> Importar CSV</button>
      {abierto && (
        <Modal titulo="Importar movimientos del banco" onCerrar={() => { setAbierto(false); setRes(null); }}>
          <div className="space-y-3 text-sm">
            <p className="text-texto-2">Columnas: <code>fecha</code> (AAAA-MM-DD o DD/MM/AAAA), <code>descripcion</code> e <code>importe</code> (negativo = gasto). Quedan «sin conciliar» hasta que les pongas categoría.</p>
            <Desplegable className="campo" value={cuenta} onChange={(e) => setCuenta(e.target.value)} aria-label="Cuenta"><option value="">Cuenta por defecto</option>{cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Desplegable>
            <input type="file" accept=".csv,text/csv" className="campo" disabled={cargando} onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setError(""); const t = await f.text(); iniciar(async () => { try { setRes((await exigirOk(importarMovimientos(t, cuenta || null))) as { importados: number; fallos: string[] }); } catch (err) { setError(err instanceof Error ? err.message : "Algo falló."); } }); }} />
            {cargando && <p className="text-texto-3">Importando…</p>}
            {error && <p className="text-mal">{error}</p>}
            {res && <div className="rounded-lg bg-panel-2 p-3"><b>{res.importados}</b> movimientos importados.{res.fallos.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-mal">{res.fallos.slice(0, 20).map((f) => <li key={f}>{f}</li>)}</ul>}</div>}
          </div>
        </Modal>
      )}
    </>
  );
}

export function Conciliar({ id, categorias, tipo }: { id: string; categorias: Cat[]; tipo: "ingreso" | "egreso" }) {
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <form className="inline-flex items-center gap-1" action={(fd) => ejecutar(() => conciliarMovimiento(id, String(fd.get("categoria") || "") || null), "Conciliado")}>
      <Desplegable name="categoria" className="campo w-auto py-1 text-xs" aria-label="Categoría"><option value="">Sin categoría</option>{categorias.filter((c) => c.tipo === tipo).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Desplegable>
      <button className="btn-secundario px-2 py-1 text-xs" disabled={pendiente}><Check className="h-3.5 w-3.5" /> Conciliar</button>
      {error && <span className="text-xs text-mal">{error}</span>}
    </form>
  );
}

export function CalcularComisiones({ mes }: { mes: string }) {
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <span className="inline-flex flex-col items-end">
      <button className="btn-primario" disabled={pendiente} onClick={() => ejecutar(() => calcularLiquidaciones(mes), "Comisiones calculadas")}><Calculator className="h-4 w-4" /> {pendiente ? "Calculando…" : "Calcular comisiones a todos"}</button>
      {error && <span className="text-xs text-mal">{error}</span>}
    </span>
  );
}

export function PagarLiquidacion({ id, pagada, cuentas }: { id: string; pagada: boolean; cuentas: Op[] }) {
  const { pendiente, error, ejecutar } = useAccion();
  const [cuenta, setCuenta] = useState("");
  return pagada ? (
    <button className="btn-secundario px-2 py-1 text-xs" disabled={pendiente} onClick={() => void confirmar("¿Desmarcar como pagada? Se borra el gasto que se creó.").then((ok) => ok && ejecutar(() => desmarcarLiquidacion(id), "Vuelve a pendiente"))}><Undo2 className="h-3.5 w-3.5" /> Desmarcar</button>
  ) : (
    <span className="inline-flex items-center gap-1">
      <Desplegable value={cuenta} onChange={(e) => setCuenta(e.target.value)} className="campo w-auto py-1 text-xs" aria-label="Cuenta desde la que se paga"><option value="">Cuenta por defecto</option>{cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Desplegable>
      <button className="btn-primario px-2 py-1 text-xs" disabled={pendiente} onClick={() => ejecutar(() => pagarLiquidacion(id, cuenta || null), "Marcada como pagada")}><Check className="h-3.5 w-3.5" /> Pagada</button>
      {error && <span className="text-xs text-mal">{error}</span>}
    </span>
  );
}

export function TipoCambio({ porUsd }: { porUsd: number | null }) {
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <form className="flex flex-wrap items-end gap-2" action={(fd) => ejecutar(() => guardarTipoCambio(String(fd.get("v"))), "Tipo de cambio guardado")}>
      <label className="block"><span className="etiqueta-campo">1 USD son … EUR</span><input name="v" inputMode="decimal" defaultValue={porUsd ?? ""} placeholder="0,92" className="campo w-32" /></label>
      <button className="btn-primario" disabled={pendiente}>Guardar</button>
      {error && <p className="w-full text-sm text-mal">{error}</p>}
    </form>
  );
}

export function GuiaFinanciera() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button className="btn-secundario border-oro/40 text-oro" onClick={() => setAbierto(true)}><BookOpen className="h-4 w-4" /> Guía financiera</button>
      {abierto && (
        <Modal titulo="Guía financiera: qué es cada número" onCerrar={() => setAbierto(false)} ancho="max-w-lg">
          <dl className="space-y-3 text-sm">
            {[
              ["Facturación", "El valor de las ventas cerradas en el periodo (contratos), cobradas o no."],
              ["Cash collected", "El dinero que entró en el periodo por ventas: lo cobrado al vender más las cuotas o restos cobrados, menos las devoluciones del periodo."],
              ["De dónde viene el cash", "Venta nueva (lo cobrado el día de la venta), cuotas (cobros posteriores) y back-end (todo lo cobrado de programas marcados como «back-end offer»)."],
              ["Profit (caja)", "Cash collected + ingresos extra − gastos que cuentan en el profit. Lo que de verdad te queda."],
              ["ROAS", "Cash collected ÷ gastos que cuentan en el profit. Por ejemplo, 3 = entran 3 € por cada € gastado."],
              ["Cuentas por cobrar", "Lo que falta por cobrar hoy de los plazos por vencer y vencidos (reservas, cuotas y deudores). Es lo mismo que «Total por cobrar» en Pagos pendientes; no cuenta lo marcado «No paga»."],
              ["Liquidaciones", "Las comisiones del mes de cada persona. Se pagan sobre lo cobrado en el mes; también se enseña sobre lo facturado. Una devolución no descuenta lo ya pagado."],
            ].map(([t, d]) => <div key={t}><dt className="font-semibold">{t}</dt><dd className="text-texto-2">{d}</dd></div>)}
          </dl>
        </Modal>
      )}
    </>
  );
}
