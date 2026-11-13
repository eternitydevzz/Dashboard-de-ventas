"use client";

import { Portal } from "@/components/portal";
import { useState } from "react";
import { Pencil, CreditCard, Percent, Plus, ExternalLink, AlertCircle } from "lucide-react";
import { useAccion } from "@/components/acciones-lead";
import { activarPrograma, guardarPrograma, type DatosPrograma } from "./acciones";
import type { Producto } from "@/lib/tipos";
import { leerNumero } from "@/lib/numero";
import { pct } from "@/lib/formato";
import { Pastillas } from "@/components/eleccion";

const COLORES = ["#2f55d4", "#7c3aed", "#db2777", "#d97706", "#15803d", "#0891b2", "#b91c1c"];
const ROLES = [
  { k: "closer", t: "Closer (lo que vende)" },
  { k: "caller", t: "Caller (si lo vende él)" },
  { k: "caller_agenda", t: "Caller (cuando el closer cierra su agenda)" },
  { k: "director", t: "Director" },
  { k: "ceo", t: "CEO" },
];

function aDatos(p: Producto | null): DatosPrograma {
  return {
    id: p?.id ?? null,
    nombre: p?.nombre ?? "",
    descripcion: p?.descripcion ?? "",
    categoria: p?.categoria ?? "",
    color: p?.color ?? COLORES[0],
    activo: p?.activo ?? true,
    backend_offer: p?.backend_offer ?? false,
    vende_caller: p?.vende_caller ?? false,
    cuenta_comision: p?.cuenta_comision ?? true,
    modo_pago: p?.modo_pago ?? "unico",
    num_cuotas: p?.num_cuotas ?? 3,
    precio: p?.precio === null || p?.precio === undefined ? "" : String(p.precio),
    precios_divisa: Object.fromEntries(Object.entries(p?.precios_divisa ?? {}).map(([k, v]) => [k, String(v)])),
    comisiones: Object.fromEntries(Object.entries(p?.comisiones ?? {}).map(([k, v]) => [k, String(v)])),
    link_pago: p?.link_pago ?? "",
    link_dossier: p?.link_dossier ?? "",
  };
}

// `editables`: qué comisiones de rol puede cambiar quien mira (arreglo 2: solo CEO y director, el director no la de su rol)
export function EditorPrograma({ programa, moneda, comisionesRol, editables }: { programa: Producto | null; moneda: "USD" | "EUR"; comisionesRol: Record<string, { pct_venta: number; pct_agenda: number }>; editables: string[] }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      {programa ? (
        <button className="btn-secundario w-full justify-center border-oro/40 text-oro" onClick={() => setAbierto(true)}><ExternalLink className="h-4 w-4" /> Gestionar programa</button>
      ) : (
        <button className="btn-primario" onClick={() => setAbierto(true)}><Plus className="h-4 w-4" /> Nuevo programa</button>
      )}
      {abierto && <Portal><Ventana programa={programa} moneda={moneda} comisionesRol={comisionesRol} editables={editables} onCerrar={() => setAbierto(false)} /></Portal>}
    </>
  );
}

function Ventana({ programa, moneda, comisionesRol, editables, onCerrar }: { programa: Producto | null; moneda: "USD" | "EUR"; comisionesRol: Record<string, { pct_venta: number; pct_agenda: number }>; editables: string[]; onCerrar: () => void }) {
  const [d, setD] = useState<DatosPrograma>(aDatos(programa));
  const [tab, setTab] = useState<"datos" | "precios" | "comisiones">("datos");
  const { pendiente, error, ejecutar } = useAccion();
  const poner = (c: Partial<DatosPrograma>) => setD((x) => ({ ...x, ...c }));
  const otra = moneda === "USD" ? "EUR" : "USD";
  const faltas = [!d.nombre.trim() ? { t: "Falta el nombre del programa", tab: "datos" as const } : null, d.precio.trim() !== "" && leerNumero(d.precio) === 0 ? { t: "El precio del programa está en cero", tab: "precios" as const } : null].filter(Boolean) as { t: string; tab: "datos" | "precios" }[];
  const TABS = [
    { v: "datos" as const, t: "Datos básicos", i: Pencil, falta: !d.nombre.trim() },
    { v: "precios" as const, t: "Precios", i: CreditCard, falta: faltas.some((f) => f.tab === "precios") },
    { v: "comisiones" as const, t: "Comisiones", i: Percent, falta: false },
  ];
  const rolDe = (k: string) => (k === "caller_agenda" ? comisionesRol.caller?.pct_agenda : comisionesRol[k]?.pct_venta) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-2 backdrop-blur-md sm:p-6" role="dialog" aria-modal="true" aria-label={programa ? "Editar programa" : "Nuevo programa"}>
      <div className="tarjeta ventana flex max-h-full w-full max-w-4xl flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-borde px-5 py-3"><h2 className="font-semibold">{programa ? `Programa · ${programa.nombre}` : "Nuevo programa"}</h2><button onClick={onCerrar} className="rounded-md px-2 py-1 text-texto-3 hover:bg-panel-2" aria-label="Cerrar">✕</button></div>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav className="flex shrink-0 gap-1 border-b border-borde p-2 sm:w-52 sm:flex-col sm:border-b-0 sm:border-r">
            {TABS.map((t) => (
              <button key={t.v} type="button" onClick={() => setTab(t.v)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${tab === t.v ? "bg-panel-2 font-medium" : "text-texto-2"}`}>
                <t.i className="h-4 w-4" /> {t.t} {t.falta && <AlertCircle className="ml-auto h-4 w-4 text-aviso" />}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {faltas.length > 0 && (
              <div className="rounded-lg border border-mal/30 bg-mal-suave p-3 text-sm">
                <div className="font-semibold text-mal">Falta completar</div>
                {faltas.map((f) => <button key={f.t} type="button" onClick={() => setTab(f.tab)} className="block text-mal underline">{f.t}</button>)}
              </div>
            )}
            {tab === "datos" && (
              <>
                <label className="block"><span className="etiqueta-campo">Nombre *</span><input className="campo" value={d.nombre} onChange={(e) => poner({ nombre: e.target.value })} placeholder="Ej. Mentoría grupal" /></label>
                <label className="block"><span className="etiqueta-campo">Descripción (opcional)</span><textarea className="campo" rows={2} value={d.descripcion} onChange={(e) => poner({ descripcion: e.target.value })} /></label>
                <div><label className="etiqueta-campo" htmlFor="prog-categoria">Categoría</label><input id="prog-categoria" className="campo max-w-xs" value={d.categoria} onChange={(e) => poner({ categoria: e.target.value })} placeholder="Sin categoría" /><p className="mt-1 text-xs text-texto-3">Agrupa los programas en esta pantalla. No cambia nada de lo que compra el cliente.</p></div>
                <div>
                  <div className="etiqueta-campo">Color</div>
                  <div className="flex gap-2">{COLORES.map((c) => <button key={c} type="button" onClick={() => poner({ color: c })} className={`h-8 w-8 rounded-full ${d.color === c ? "ring-2 ring-texto ring-offset-2 ring-offset-panel" : ""}`} style={{ background: c }} aria-label={`Color ${c}`} />)}</div>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="interruptor" checked={d.activo} onChange={(e) => poner({ activo: e.target.checked })} /> Activo (se puede vender)</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="interruptor" checked={d.vende_caller} onChange={(e) => poner({ vende_caller: e.target.checked })} /> Lo puede vender el caller (low ticket)</label>
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="interruptor mt-1" checked={d.cuenta_comision !== false} onChange={(e) => poner({ cuenta_comision: e.target.checked })} /><span>Cuenta para comisión<span className="block text-xs text-texto-3">Si lo quitas, sus ventas no pagan comisión a nadie ni suman para los tramos (como la Membresía, de momento).</span></span></label>
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="interruptor mt-1" checked={d.backend_offer} onChange={(e) => poner({ backend_offer: e.target.checked })} /><span>Back-end offer<span className="block text-xs text-texto-3">En Finanzas → Resumen, lo cobrado de este programa cuenta como «Back-end» en vez de «Venta nueva» o «Cuotas». Vale también para lo ya cobrado.</span></span></label>
              </>
            )}
            {tab === "precios" && (
              <>
                <div><label className="etiqueta-campo" htmlFor="cliente-como-lo-paga-el-cliente">Cómo lo paga el cliente</label>
                  <Pastillas id="cliente-como-lo-paga-el-cliente" className="campo max-w-xs" value={d.modo_pago} onChange={(e) => poner({ modo_pago: e.target.value as "unico" | "cuotas" | "mensual" })}><option value="unico">Una sola vez</option><option value="cuotas">En cuotas</option><option value="mensual">Cada mes, sin fin (membresía)</option></Pastillas>
                </div>
                {d.modo_pago === "cuotas" && <label className="block"><span className="etiqueta-campo">Número de cuotas</span><input type="number" min={2} max={60} className="campo w-28" value={d.num_cuotas ?? ""} onChange={(e) => poner({ num_cuotas: Number(e.target.value) || null })} /></label>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className="etiqueta-campo" htmlFor="prog-precio">Precio ({moneda})</label><input id="prog-precio" className="campo" inputMode="decimal" value={d.precio} onChange={(e) => poner({ precio: e.target.value })} placeholder="Vacío = precio personalizado" /><p className="mt-1 text-xs text-texto-3">Lo que cobra un closer al cerrar la venta.</p></div>
                  <label className="block"><span className="etiqueta-campo">Precio en {otra} (opcional)</span><input className="campo" inputMode="decimal" value={d.precios_divisa[otra] ?? ""} onChange={(e) => poner({ precios_divisa: { ...d.precios_divisa, [otra]: e.target.value } })} placeholder="Solo si cambia según la moneda" /></label>
                </div>
                <label className="block"><span className="etiqueta-campo">Link del dossier (opcional)</span><input className="campo" value={d.link_dossier ?? ""} onChange={(e) => poner({ link_dossier: e.target.value })} placeholder="https://…" /><span className="mt-1 block text-xs text-texto-3">Sale en Links y recursos, encima del link de pago.</span></label>
                <label className="block"><span className="etiqueta-campo">Link de pago (opcional)</span><input className="campo" value={d.link_pago} onChange={(e) => poner({ link_pago: e.target.value })} placeholder="https://…" /></label>
              </>
            )}
            {tab === "comisiones" && (
              <>
                {editables.length < ROLES.length && <p className="rounded-lg bg-panel-2 px-3 py-2 text-xs text-texto-2">{editables.length ? "Algunas no las puedes cambiar: la de tu propio rol la cambia el CEO." : "Solo el CEO o el director pueden cambiar comisiones."}</p>}
                <p className="text-sm text-texto-2">Si este programa paga distinto, ponlo aquí. Vacío o 0 = la comisión de cada rol (Equipo). Si una persona tiene una comisión propia, manda la suya.</p>
                <div className="divide-y divide-borde rounded-xl border border-borde">
                  {ROLES.map((r) => (
                    <div key={r.k} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="flex-1">{r.t}</span>
                      <span className="text-xs text-texto-3">del rol: {pct(rolDe(r.k))}</span>
                      <input className="campo w-20 py-1 text-right disabled:opacity-60" disabled={!editables.includes(r.k)} inputMode="decimal" value={d.comisiones[r.k] ?? ""} onChange={(e) => poner({ comisiones: { ...d.comisiones, [r.k]: e.target.value } })} placeholder="—" aria-label={`% ${r.t}`} />%
                    </div>
                  ))}
                </div>
              </>
            )}
            {error && <p className="text-sm text-mal">{error}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-borde px-5 py-3">
          <button className="btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primario" disabled={pendiente || faltas.length > 0} onClick={() => ejecutar(async () => { const r = await guardarPrograma(d); if (!(r && typeof r === "object" && "error" in r)) onCerrar(); return r; }, programa ? "Programa guardado" : "Programa creado")}>{programa ? "Guardar" : "Crear programa"}</button>
        </div>
      </div>
    </div>
  );
}

export function InterruptorActivo({ id, activo }: { id: string; activo: boolean }) {
  const { pendiente, ejecutar } = useAccion();
  return (
    <button role="switch" aria-checked={activo} aria-label={activo ? "Desactivar" : "Activar"} disabled={pendiente} onClick={() => ejecutar(() => activarPrograma(id, !activo), activo ? "Programa desactivado" : "Programa activado")} className={`relative h-6 w-11 rounded-full transition ${activo ? "bg-ok" : "bg-apagado"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${activo ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
