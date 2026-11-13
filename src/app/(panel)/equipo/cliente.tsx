"use client";

import { useState } from "react";
import { Save, Trash2, KeyRound, Plus } from "lucide-react";
import { useAccion } from "@/components/acciones-lead";
import { actualizarMiembroEquipo, borrarArea, cambiarModoComision, darAccesoMiembro, guardarArea, guardarComisionRol } from "./acciones";
import type { ComisionPersona } from "@/lib/comisiones";
import type { Rol } from "@/lib/tipos";
import { leerNumero } from "@/lib/numero";
import { confirmar } from "@/components/dialogos";
import { Desplegable, Pastillas } from "@/components/eleccion";
import { MERCADOS, type Mercado } from "@/lib/mercado";

export type Area = { id: string; nombre: string; color: string };
export type Puesto = { id: string; area_id: string | null; nombre: string };
type Producto = { id: string; nombre: string };
export type Miembro = { id: string; nombre: string; area_id: string | null; puesto_id: string | null; lider: boolean; activo: boolean; comision: ComisionPersona; comision_modo?: "tramos" | "propio" | null; perfil_id: string | null; rol: Rol | null };
const ROL_TXT: Record<string, string> = { ceo: "CEO", director: "Director de ventas", closer: "Closer", caller: "Caller" };

// Datos y comisión de una persona (organigrama). Es la primera pestaña de su ficha (bloque 5 de 1.0).
export function DatosYComision({ m, areas, puestos, productos, rolesQuePuedoDar, puedeComision, admin }: { m: Miembro; areas: Area[]; puestos: Puesto[]; productos: Producto[]; rolesQuePuedoDar: Rol[]; puedeComision: boolean; admin: boolean }) {
  const { pendiente, error, ejecutar } = useAccion();
  const [nombre, setNombre] = useState(m.nombre);
  const [area, setArea] = useState(m.area_id ?? "");
  const [puesto, setPuesto] = useState(m.puesto_id ?? "");
  const [lider, setLider] = useState(m.lider);
  const [activo, setActivo] = useState(m.activo);
  const [propia, setPropia] = useState(!!m.comision);
  const [venta, setVenta] = useState(String(m.comision?.pct_venta ?? ""));
  const [agenda, setAgenda] = useState(String(m.comision?.pct_agenda ?? ""));
  const [pp, setPp] = useState<Record<string, string>>(Object.fromEntries(Object.entries(m.comision?.por_producto ?? {}).map(([k, v]) => [k, String(v)])));
  const [acceso, setAcceso] = useState(false);
  const [mercado, setMercado] = useState<Mercado | null>(null); // sin valor por defecto: que nadie salga en Latam por error
  // Bloque 4: callers y closers van por tramos salvo que se elija su % propio
  const conTramos = m.rol === "caller" || m.rol === "closer";
  const [modo, setModo] = useState<"tramos" | "propio">(conTramos ? (m.comision_modo ?? "tramos") : "propio");
  return (
    <div className="space-y-3 text-sm">
      <label className="block"><span className="etiqueta-campo">Nombre</span><input className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="etiqueta-campo">Área</span><Desplegable className="campo" value={area} onChange={(e) => setArea(e.target.value)}><option value="">Sin área</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Desplegable></label>
        <label className="block"><span className="etiqueta-campo">Puesto</span><Desplegable className="campo" value={puesto} onChange={(e) => setPuesto(e.target.value)}><option value="">Sin puesto</option>{puestos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Desplegable></label>
      </div>
      <div className="flex gap-4"><label className="flex items-center gap-2"><input type="checkbox" className="interruptor" checked={lider} onChange={(e) => setLider(e.target.checked)} /> Líder de su área</label><label className="flex items-center gap-2"><input type="checkbox" className="interruptor" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activo</label></div>
      {conTramos && (
        <fieldset className="rounded-lg border border-borde p-3" disabled={!puedeComision || pendiente}>
          <legend className="px-1 text-xs font-medium text-texto-2">¿Qué manda en su comisión?</legend>
          <div className="grupo-pastillas"><label className="pastilla"><input type="radio" checked={modo === "tramos"} onChange={() => { setModo("tramos"); ejecutar(() => cambiarModoComision(m.id, "tramos"), "Mandan los tramos"); }} /> Los tramos</label>
          <label className="pastilla"><input type="radio" checked={modo === "propio"} onChange={() => { setModo("propio"); ejecutar(() => cambiarModoComision(m.id, "propio"), "Manda su % propio"); }} /> Su % propio</label></div>
          <p className="mt-1 text-xs text-texto-3">{modo === "tramos" ? "Cobra el % del tramo que alcance cada mes (Administración → Comisiones). Lo de abajo no se usa." : "Cobra su % de abajo (o el de su rol)."}</p>
        </fieldset>
      )}
      {!puedeComision ? (
        <div className="rounded-lg border border-borde p-3">
          <div className="text-xs font-medium text-texto-2">Comisión</div>
          <p className="mt-1">{m.comision ? `Propia: ${m.comision.pct_venta ?? 0} % por venta${m.comision.pct_agenda ? ` · ${m.comision.pct_agenda} % por agenda` : ""}${m.comision.por_producto ? " · distinta por producto" : ""}` : "La de su rol"}</p>
          <p className="mt-1 text-xs text-texto-3">Solo el CEO o el director pueden cambiar comisiones, y nadie la suya (salvo el CEO).</p>
        </div>
      ) : (
      <fieldset className="rounded-lg border border-borde p-3">
        <legend className="px-1 text-xs font-medium text-texto-2">Comisión</legend>
        <div className="grupo-pastillas"><label className="pastilla"><input type="radio" checked={!propia} onChange={() => setPropia(false)} /> La de su rol</label>
        <label className="pastilla"><input type="radio" checked={propia} onChange={() => setPropia(true)} /> Una propia</label></div>
        {propia && (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="etiqueta-campo">% por venta</span><input className="campo" inputMode="decimal" value={venta} onChange={(e) => setVenta(e.target.value)} /></label>
              {m.rol === "caller" && <label className="block"><span className="etiqueta-campo">% por agenda cerrada</span><input className="campo" inputMode="decimal" value={agenda} onChange={(e) => setAgenda(e.target.value)} /></label>}
            </div>
            <details><summary className="cursor-pointer text-xs text-primario">Distinta por producto</summary>
              <div className="mt-2 space-y-1">{productos.map((p) => <div key={p.id} className="flex items-center gap-2"><span className="flex-1">{p.nombre}</span><input className="campo w-20 py-1" inputMode="decimal" value={pp[p.id] ?? ""} onChange={(e) => setPp({ ...pp, [p.id]: e.target.value })} placeholder="0" aria-label={`% para ${p.nombre}`} />%</div>)}<p className="text-xs text-texto-3">En 0 % usa el porcentaje general.</p></div>
            </details>
          </div>
        )}
      </fieldset>
      )}
      {error && <p className="text-mal">{error}</p>}
      <button
        className="btn-primario w-full"
        disabled={pendiente}
        onClick={() =>
          ejecutar(
            () => actualizarMiembroEquipo(m.id, { nombre, area_id: area || null, puesto_id: puesto || null, lider, activo, comision: !puedeComision ? m.comision : propia ? { pct_venta: leerNumero(venta) || null, pct_agenda: leerNumero(agenda) || null, por_producto: Object.fromEntries(Object.entries(pp).filter(([, v]) => leerNumero(v) > 0).map(([k, v]) => [k, leerNumero(v)])) } : null }),
            "Guardado"
          )
        }
      >
        <Save className="h-4 w-4" /> Guardar
      </button>
      {!m.perfil_id && admin && (
        <div className="border-t border-borde pt-3">
          {!acceso ? (
            <button className="btn-secundario w-full" onClick={() => setAcceso(true)}><KeyRound className="h-4 w-4" /> Darle acceso a la app</button>
          ) : (
            <form className="space-y-2" action={(fd) => ejecutar(() => darAccesoMiembro(m.id, String(fd.get("email")), String(fd.get("password")), String(fd.get("rol")) as Rol, mercado ?? "", String(fd.get("telefono"))), "Acceso creado")}>
              <input name="email" type="email" required className="campo" placeholder="Email de acceso" />
              <div role="radiogroup" aria-label="País" className="flex gap-2">
                {MERCADOS.map((x) => (
                  <button key={x.v} type="button" role="radio" aria-checked={mercado === x.v} onClick={() => setMercado(x.v)} className={`flex-1 rounded-full border px-4 py-2 text-sm ${mercado === x.v ? "border-oro bg-oro-suave" : "border-borde"}`}>{x.t}</button>
                ))}
              </div>
              <input name="telefono" type="tel" inputMode="tel" required minLength={7} className="campo" placeholder="Teléfono con prefijo (ej. +34 600 000 000)" autoComplete="off" />
              <input name="password" type="text" minLength={8} required className="campo" placeholder="Contraseña temporal (mín. 8)" autoComplete="off" />
              <Pastillas name="rol" className="campo" defaultValue={rolesQuePuedoDar[0]}>{rolesQuePuedoDar.map((r) => <option key={r} value={r}>{ROL_TXT[r]}</option>)}</Pastillas>
              <button className="btn-primario w-full" disabled={pendiente || !mercado}>{mercado ? "Crear acceso" : "Elige España o Latam"}</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export function ComisionRolForm({ rol, pctVenta, pctAgenda, editable }: { rol: Rol; pctVenta: number; pctAgenda: number; editable: boolean }) {
  const { pendiente, error, ejecutar } = useAccion();
  if (!editable)
    return (
      <div className="grid grid-cols-[1fr_72px_72px_auto] items-center gap-2 text-sm" title="No puedes cambiar esta comisión">
        <div className="font-medium">{ROL_TXT[rol]}</div>
        <span className="text-right tabular-nums">{pctVenta} %</span>
        <span className="text-right tabular-nums text-texto-3">{rol === "caller" ? `${pctAgenda} %` : "—"}</span>
        <span className="w-7" />
      </div>
    );
  return (
    <form className="grid grid-cols-[1fr_72px_72px_auto] items-center gap-2" action={(fd) => ejecutar(() => guardarComisionRol(rol, String(fd.get("venta")), String(fd.get("agenda") ?? "")), `Comisión de ${ROL_TXT[rol]} guardada`)}>
      <div className="text-sm font-medium">{ROL_TXT[rol]}</div>
      <input name="venta" inputMode="decimal" defaultValue={pctVenta} className="campo px-2 py-1.5 text-right" aria-label={`% por venta de ${ROL_TXT[rol]}`} />
      {rol === "caller" ? <input name="agenda" inputMode="decimal" defaultValue={pctAgenda} className="campo px-2 py-1.5 text-right" aria-label="% por agenda cerrada del caller" /> : <span className="text-center text-xs text-texto-3">—</span>}
      <button className="rounded-md p-1.5 text-texto-3 hover:bg-panel-2" disabled={pendiente} title="Guardar"><Save className="h-4 w-4" /></button>
      {error && <p className="col-span-4 text-xs text-mal">{error}</p>}
    </form>
  );
}

export function EditorAreas({ areas }: { areas: Area[] }) {
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <div className="space-y-2">
      {areas.map((a) => (
        <form key={a.id} className="flex items-center gap-2" action={(fd) => ejecutar(() => guardarArea(a.id, String(fd.get("nombre")), String(fd.get("color"))), "Área guardada")}>
          <input name="color" type="color" defaultValue={a.color} className="h-8 w-8 shrink-0 cursor-pointer rounded border border-borde bg-transparent" aria-label="Color" />
          <input name="nombre" defaultValue={a.nombre} className="campo py-1.5" aria-label="Nombre del área" />
          <button className="rounded-md p-1.5 text-texto-3 hover:bg-panel-2" disabled={pendiente} title="Guardar"><Save className="h-4 w-4" /></button>
          <button type="button" className="rounded-md p-1.5 text-texto-3 hover:bg-mal-suave hover:text-mal" disabled={pendiente} title="Borrar" onClick={() => void confirmar(`¿Borrar el área «${a.nombre}»?`).then((ok) => ok && ejecutar(() => borrarArea(a.id), "Área borrada"))}><Trash2 className="h-4 w-4" /></button>
        </form>
      ))}
      <form className="flex items-center gap-2" action={(fd) => ejecutar(() => guardarArea(null, String(fd.get("nombre")), String(fd.get("color"))), "Área creada")}>
        <input name="color" type="color" defaultValue="#64748b" className="h-8 w-8 shrink-0 cursor-pointer rounded border border-borde bg-transparent" aria-label="Color" />
        <input name="nombre" required placeholder="Nueva área" className="campo py-1.5" />
        <button className="btn-secundario px-2 py-1.5" disabled={pendiente} aria-label="Añadir área"><Plus className="h-4 w-4" /></button>
      </form>
      {error && <p className="text-xs text-mal">{error}</p>}
    </div>
  );
}
