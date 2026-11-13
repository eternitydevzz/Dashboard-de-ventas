"use client";

import { Portal } from "@/components/portal";
import { useState } from "react";
import { Check, UserPlus, Briefcase, PieChart, KeyRound, Shield, CircleCheck, Plus, Users, User, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useAccion } from "@/components/acciones-lead";
import { Anillo } from "@/components/ui";
import { crearMiembro } from "./acciones";
import type { ComisionPersona } from "@/lib/comisiones";
import type { Rol } from "@/lib/tipos";
import { leerNumero } from "@/lib/numero";
import { pct, primeraLetra } from "@/lib/formato";
import { Desplegable } from "@/components/eleccion";
import { MERCADOS, type Mercado } from "@/lib/mercado";

type Area = { id: string; nombre: string; color: string };
type Puesto = { id: string; area_id: string | null; nombre: string; rol_base: Rol | "otro" };
type Producto = { id: string; nombre: string; precio: number | null };
const ROL_TXT: Record<string, string> = { ceo: "CEO", director: "Director de ventas", closer: "Closer", caller: "Caller", otro: "Otro" };
const PASOS = [
  { t: "Datos del miembro", d: "Quién es y en qué área entra", i: UserPlus },
  { t: "Puesto", d: "Qué función cumple", i: Briefcase },
  { t: "Compensación", d: "Cuánto cobra por vender", i: PieChart },
  { t: "Cuenta de acceso", d: "Cómo entra en la app", i: KeyRound },
  { t: "Rol y permisos", d: "Qué puede ver y usar", i: Shield },
  { t: "Revisión", d: "Confirmar y crear", i: CircleCheck },
];

export function AltaMiembro({ areas, puestos, productos, comisionesRol, rolesQuePuedoDar, puedeComision, codigoMoneda }: { areas: Area[]; puestos: Puesto[]; productos: Producto[]; comisionesRol: Record<string, { pct_venta: number; pct_agenda: number }>; rolesQuePuedoDar: Rol[]; puedeComision: boolean; codigoMoneda: "USD" | "EUR" }) {
  const [abierto, setAbierto] = useState(false);
  const moneda = (n: number) => new Intl.NumberFormat(codigoMoneda === "EUR" ? "es-ES" : "en-US", { style: "currency", currency: codigoMoneda, maximumFractionDigits: 0 }).format(n);
  return (
    <>
      <button className="btn-primario" onClick={() => setAbierto(true)}><Plus className="h-4 w-4" /> Dar de alta un miembro</button>
      {abierto && <Portal><Asistente {...{ areas, puestos, productos, comisionesRol, rolesQuePuedoDar, puedeComision, moneda }} onCerrar={() => setAbierto(false)} /></Portal>}
    </>
  );
}

function Asistente({ areas, puestos, productos, comisionesRol, rolesQuePuedoDar, puedeComision, moneda, onCerrar }: { areas: Area[]; puestos: Puesto[]; productos: Producto[]; comisionesRol: Record<string, { pct_venta: number; pct_agenda: number }>; rolesQuePuedoDar: Rol[]; puedeComision: boolean; moneda: (n: number) => string; onCerrar: () => void }) {
  const soyCeo = rolesQuePuedoDar.includes("ceo");
  const { pendiente, error, ejecutar } = useAccion();
  const [paso, setPaso] = useState(0);
  const [varios, setVarios] = useState(false);
  const [nombre, setNombre] = useState("");
  const [lista, setLista] = useState("");
  const [area, setArea] = useState<string | null>(areas[0]?.id ?? null);
  const [puesto, setPuesto] = useState<string | null>(null);
  const [puestoNuevo, setPuestoNuevo] = useState<{ nombre: string; rol_base: Rol | "otro" } | null>(null);
  const [propia, setPropia] = useState(false);
  const [pctVenta, setPctVenta] = useState("");
  const [pctAgenda, setPctAgenda] = useState("");
  const [porProducto, setPorProducto] = useState(false);
  const [pp, setPp] = useState<Record<string, string>>({});
  const [acceso, setAcceso] = useState<"crear" | "organigrama">("crear");
  const [mercado, setMercado] = useState<Mercado | null>(null); // sin valor por defecto: que nadie salga en Latam por error
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [lider, setLider] = useState(false);
  const [intentado, setIntentado] = useState(false); // el aviso solo sale si se pulsa «Continuar» sin rellenar

  const p = puestos.find((x) => x.id === puesto);
  const rolBase = (puestoNuevo?.rol_base ?? p?.rol_base ?? "closer") as Rol | "otro";
  const [rol, setRol] = useState<Rol | null>(null);
  const propuesto: Rol = rol ?? (rolBase === "otro" ? "closer" : rolBase);
  // Solo roles iguales o inferiores al tuyo (arreglo 2); si el del puesto no se puede, el primero que sí
  const rolFinal: Rol = rolesQuePuedoDar.includes(propuesto) ? propuesto : rolesQuePuedoDar[0];
  const deRol = comisionesRol[rolFinal] ?? { pct_venta: 0, pct_agenda: 0 };
  const nombres = varios ? lista.split("\n").map((x) => x.trim()).filter(Boolean) : [nombre.trim()].filter(Boolean);
  const accesoReal = varios ? "organigrama" : acceso;
  const pctMostrado = propia ? leerNumero(pctVenta) || 0 : deRol.pct_venta;
  const ejemplo = productos.find((x) => x.precio) ?? null;
  const areaObj = areas.find((a) => a.id === area);
  const puestoTxt = puestoNuevo?.nombre || p?.nombre || "—";

  const faltaPaso = (i: number): string | null => {
    if (i === 0 && !nombres.length) return "Pon el nombre.";
    if (i === 0 && accesoReal === "crear" && !mercado) return "Elige si es de España o de Latam.";
    if (i === 0 && accesoReal === "crear" && telefono.replace(/\D/g, "").length < 7) return "Pon su teléfono con prefijo.";
    if (i === 3 && accesoReal === "crear" && (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8)) return "Pon un email válido y una contraseña de 8 caracteres o más.";
    return null;
  };
  const comision: ComisionPersona = propia
    ? { pct_venta: leerNumero(pctVenta) || null, pct_agenda: rolFinal === "caller" ? leerNumero(pctAgenda) || null : null, por_producto: porProducto ? Object.fromEntries(Object.entries(pp).filter(([, v]) => leerNumero(v) > 0).map(([k, v]) => [k, leerNumero(v)])) : null }
    : null;
  const crear = () =>
    ejecutar(async () => {
      const r = await crearMiembro({ nombres, area_id: area, puesto_id: puestoNuevo ? null : puesto, puesto_nuevo: puestoNuevo, comision, acceso: accesoReal === "crear" ? { modo: "crear", email, password, rol: rolFinal, mercado: mercado ?? "latam", telefono } : { modo: "organigrama" }, lider });
      if (!(r && typeof r === "object" && "error" in r)) onCerrar();
      return r;
    }, nombres.length > 1 ? `${nombres.length} personas dadas de alta` : "Miembro creado");
  const aviso = faltaPaso(paso);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-2 backdrop-blur-md sm:p-6" role="dialog" aria-modal="true" aria-label="Alta de miembro">
      <div className="tarjeta ventana flex max-h-full w-full max-w-6xl flex-col overflow-hidden lg:flex-row">
        {/* Pasos */}
        <aside className="hidden w-72 shrink-0 border-r border-borde p-5 lg:block">
          <div className="titulo-seccion text-oro">Alta de miembro</div>
          <h2 className="mt-1 text-xl font-semibold">Crear de principio a fin</h2>
          <p className="mt-1 text-sm text-texto-2">Un solo flujo une el puesto, lo que cobra, el acceso y los permisos.</p>
          <ol className="mt-5 space-y-1">
            {PASOS.map((x, i) => (
              <li key={x.t}>
                <button type="button" onClick={() => i < paso && setPaso(i)} className={`flex w-full items-center gap-3 rounded-lg p-2 text-left ${i === paso ? "bg-panel-2 ring-1 ring-borde" : ""}`}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${i < paso ? "bg-oro text-white" : i === paso ? "bg-oro-suave text-oro" : "bg-panel-2 text-texto-3"}`}>{i < paso ? <Check className="h-4 w-4" /> : <x.i className="h-4 w-4" />}</span>
                  <span><span className={`block text-sm font-medium ${i > paso ? "text-texto-3" : ""}`}>{x.t}</span><span className="block text-xs text-texto-3">{x.d}</span></span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        {/* Paso actual */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="h-1 bg-panel-2"><div className="h-full bg-oro transition-all" style={{ width: `${pct(((paso + 1) / PASOS.length) * 100)}` }} /></div>
          <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-7">
            <div className="font-mono text-xs text-oro">0{paso + 1} · {PASOS[paso].t.toUpperCase()}</div>
            {paso === 0 && (
              <>
                <h3 className="text-2xl font-semibold">¿Quién entra en el equipo?</h3>
                <p className="text-sm text-texto-2">Nombre, área, país y teléfono. El email se pide después, si le creas una cuenta.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setVarios(false)} className={`btn-secundario ${!varios ? "border-oro text-oro" : ""}`}><User className="h-4 w-4" /> Uno</button>
                  <button type="button" onClick={() => setVarios(true)} className={`btn-secundario ${varios ? "border-oro text-oro" : ""}`}><Users className="h-4 w-4" /> Varios a la vez</button>
                </div>
                {varios ? (
                  <div><label className="etiqueta-campo" htmlFor="alta-lista">Un nombre por línea</label><textarea id="alta-lista" rows={5} className="campo" value={lista} onChange={(e) => setLista(e.target.value)} placeholder={"Camila Ríos\nJorge Pérez"} /><p className="mt-1 text-xs text-texto-3">Varios a la vez entran sin cuenta (solo en el organigrama); el acceso se les da luego desde su ficha.</p></div>
                ) : (
                  <>
                    <label className="block"><span className="etiqueta-campo">Nombre completo</span><input className="campo" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Camila Ríos" /></label>
                    <div>
                      <div className="etiqueta-campo">País</div>
                      <div className="flex flex-wrap gap-2">
                        {MERCADOS.map((m) => (
                          <button key={m.v} type="button" aria-pressed={mercado === m.v} onClick={() => setMercado(m.v)} className={`rounded-full border px-4 py-2 text-sm ${mercado === m.v ? "border-oro bg-oro-suave" : "border-borde"}`}>{m.t}</button>
                        ))}
                      </div>
                    </div>
                    <label className="block"><span className="etiqueta-campo">Teléfono</span><input className="campo" type="tel" inputMode="tel" autoComplete="off" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Ej. +34 600 000 000" /></label>
                  </>
                )}
                <div>
                  <div className="etiqueta-campo">Área</div>
                  <div className="flex flex-wrap gap-2">
                    {areas.map((a) => (
                      <button key={a.id} type="button" onClick={() => setArea(a.id)} className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${area === a.id ? "border-oro bg-oro-suave" : "border-borde"}`}><span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />{a.nombre}</button>
                    ))}
                  </div>
                </div>
              </>
            )}
            {paso === 1 && (
              <>
                <h3 className="text-2xl font-semibold">¿Qué puesto va a ocupar?</h3>
                <p className="text-sm text-texto-2">El puesto dice qué hace dentro del organigrama. No da permisos: eso viene después.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {puestos.filter((x) => !x.area_id || x.area_id === area).map((x) => (
                    <button key={x.id} type="button" onClick={() => { setPuesto(x.id); setPuestoNuevo(null); setRol(null); }} className={`rounded-xl border p-4 text-left ${puesto === x.id && !puestoNuevo ? "border-oro bg-oro-suave" : "border-borde"}`}>
                      <Briefcase className="mb-2 h-5 w-5 text-ok" /><div className="font-semibold">{x.nombre}</div><div className="text-sm text-texto-3">{ROL_TXT[x.rol_base]}</div>
                    </button>
                  ))}
                  <div className={`rounded-xl border border-dashed p-4 ${puestoNuevo ? "border-oro" : "border-borde"}`}>
                    <div className="mb-2 font-semibold">Crear puesto nuevo</div>
                    <input className="campo mb-2" placeholder="Nombre del puesto (p. ej. Closer senior)" value={puestoNuevo?.nombre ?? ""} onChange={(e) => { setPuestoNuevo({ nombre: e.target.value, rol_base: puestoNuevo?.rol_base ?? "closer" }); setPuesto(null); setRol(null); }} />
                    <Desplegable className="campo" value={puestoNuevo?.rol_base ?? "closer"} onChange={(e) => setPuestoNuevo({ nombre: puestoNuevo?.nombre ?? "", rol_base: e.target.value as Rol | "otro" })} aria-label="Rol base del puesto">
                      {["closer", "caller", "director", ...(soyCeo ? ["ceo"] : []), "otro"].map((r) => <option key={r} value={r}>{ROL_TXT[r]}</option>)}
                    </Desplegable>
                  </div>
                </div>
                <p className="text-xs text-texto-3">Puedes seguir sin puesto y ponérselo después.</p>
              </>
            )}
            {paso === 2 && (
              <>
                <h3 className="text-2xl font-semibold">¿Cuánto cobra?</h3>
                <p className="text-sm text-texto-2">Déjalo definido aquí y Finanzas calcula las liquidaciones solas (se paga sobre lo cobrado, cada mes).</p>
                <div className="flex flex-wrap items-center gap-5 rounded-xl border border-borde p-4">
                  <Anillo valor={pctMostrado} color="var(--oro)" tamano={96} />
                  <div className="text-sm">
                    <div className="titulo-seccion">{porProducto ? "Distinto por producto" : "Todos los productos"}</div>
                    <div className="mt-1"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-oro" />Se lleva · <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-panel-2 ring-1 ring-borde" />Queda en la empresa</div>
                    {ejemplo && <p className="mt-1 text-texto-2">De una venta de <b>{moneda(Number(ejemplo.precio))}</b> se lleva <b>{moneda((Number(ejemplo.precio) * pctMostrado) / 100)}</b> (ejemplo con {ejemplo.nombre}).</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setPropia(false)} className={`btn-secundario ${!propia ? "border-oro text-oro" : ""}`}>La de su rol ({ROL_TXT[rolFinal]}: {pct(deRol.pct_venta)}{rolFinal === "caller" ? ` · ${pct(deRol.pct_agenda)} por agenda` : ""})</button>
                  {puedeComision && <button type="button" onClick={() => setPropia(true)} className={`btn-secundario ${propia ? "border-oro text-oro" : ""}`}>Una propia</button>}
                </div>
                {!puedeComision && <p className="text-xs text-texto-3">Una comisión propia solo la pueden poner el CEO o el director.</p>}
                {propia && (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block"><span className="etiqueta-campo">% de comisión por venta</span><input className="campo" inputMode="decimal" value={pctVenta} onChange={(e) => setPctVenta(e.target.value)} placeholder={String(deRol.pct_venta)} /></label>
                      {rolFinal === "caller" && <label className="block"><span className="etiqueta-campo">% cuando el closer cierra su agenda</span><input className="campo" inputMode="decimal" value={pctAgenda} onChange={(e) => setPctAgenda(e.target.value)} placeholder={String(deRol.pct_agenda)} /></label>}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setPorProducto(false)} className={`btn-secundario ${!porProducto ? "border-oro text-oro" : ""}`}>Igual en todos los productos</button>
                      <button type="button" onClick={() => setPorProducto(true)} className={`btn-secundario ${porProducto ? "border-oro text-oro" : ""}`}>Distinto por producto</button>
                    </div>
                    {porProducto && (
                      <div className="divide-y divide-borde rounded-xl border border-borde">
                        {productos.map((x) => (
                          <div key={x.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                            <span className="flex-1">{x.nombre}</span><span className="font-mono text-xs text-texto-3">{x.precio ? moneda(Number(x.precio)) : "personalizado"}</span>
                            <input className="campo w-20 py-1" inputMode="decimal" value={pp[x.id] ?? ""} onChange={(e) => setPp({ ...pp, [x.id]: e.target.value })} placeholder="0" aria-label={`% para ${x.nombre}`} />%
                          </div>
                        ))}
                        <p className="px-3 py-2 text-xs text-texto-3">Los productos que dejes en 0 % usan el porcentaje general.</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            {paso === 3 && (
              <>
                <h3 className="text-2xl font-semibold">¿Cómo entra en la app?</h3>
                {varios ? (
                  <p className="rounded-lg bg-aviso-suave px-3 py-2 text-sm text-aviso">Al dar de alta a varios a la vez, entran solo en el organigrama. Luego les das acceso desde su ficha.</p>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button type="button" onClick={() => setAcceso("crear")} className={`rounded-xl border p-4 text-left ${acceso === "crear" ? "border-oro bg-oro-suave" : "border-borde"}`}><KeyRound className="mb-2 h-5 w-5 text-oro" /><div className="font-semibold">Crear acceso ahora</div><div className="text-sm text-texto-3">Email y contraseña nuevos.</div></button>
                      <button type="button" onClick={() => setAcceso("organigrama")} className={`rounded-xl border p-4 text-left ${acceso === "organigrama" ? "border-oro bg-oro-suave" : "border-borde"}`}><Users className="mb-2 h-5 w-5 text-oro" /><div className="font-semibold">Solo en el organigrama</div><div className="text-sm text-texto-3">Sin acceso. Se lo das más tarde.</div></button>
                    </div>
                    {acceso === "crear" && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block"><span className="etiqueta-campo">Email de acceso</span><input type="email" className="campo" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="camila@empresa.com" /></label>
                        <label className="block"><span className="etiqueta-campo">Contraseña temporal (mín. 8)</span><input type="text" autoComplete="off" className="campo" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            {paso === 4 && (
              <>
                <h3 className="text-2xl font-semibold">¿Qué puede ver y usar?</h3>
                {accesoReal === "organigrama" ? (
                  <p className="rounded-lg bg-oro-suave px-3 py-2 text-sm">Va sin cuenta de acceso. El rol se aplica el día que le crees la cuenta desde su ficha.</p>
                ) : (
                  <>
                    <p className="text-sm text-texto-2">El rol decide qué ve en la app. Los cambios de rol después se hacen en Administración.</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {rolesQuePuedoDar.map((r) => (
                        <button key={r} type="button" onClick={() => setRol(r)} className={`rounded-xl border p-4 text-left ${rolFinal === r ? "border-oro bg-oro-suave" : "border-borde"}`}>
                          <Shield className="mb-2 h-5 w-5 text-oro" /><div className="font-semibold">{ROL_TXT[r]}</div>
                          <div className="text-sm text-texto-3">{r === "closer" ? "Sus agendas, sus ventas y su ranking" : r === "caller" ? "Sus leads, su CRM y el low ticket" : r === "director" ? "Todo el equipo de ventas (sin crear productos)" : "Todo, incluidas las secciones de empresa"}</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
            {paso === 5 && (
              <>
                <h3 className="text-2xl font-semibold">Revisa y confirma</h3>
                <ul className="divide-y divide-borde rounded-xl border border-borde text-sm">
                  {[
                    ["Miembro", nombres.length > 1 ? `${nombres.length} personas` : nombres[0], [areaObj?.nombre ?? "Sin área", accesoReal === "crear" ? MERCADOS.find((m) => m.v === mercado)?.t : null, accesoReal === "crear" ? telefono.trim() : null].filter(Boolean).join(" · "), 0],
                    ["Puesto", puestoTxt, ROL_TXT[rolBase] ?? "", 1],
                    ["Compensación", propia ? `${pct(pctMostrado)} por venta${rolFinal === "caller" && pctAgenda ? ` · ${pct(pctAgenda)} por agenda` : ""}` : `La de su rol (${pct(deRol.pct_venta)})`, porProducto && propia ? "Distinta por producto" : "Igual en todos", 2],
                    ["Cuenta", accesoReal === "crear" ? email : "Sin cuenta por ahora", accesoReal === "crear" ? "Acceso nuevo" : "Se la das más tarde", 3],
                    ["Rol", accesoReal === "crear" ? ROL_TXT[rolFinal] : "—", "", 4],
                  ].map(([t, v, d, i]) => (
                    <li key={t as string} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1"><div className="titulo-seccion">{t}</div><div className="font-medium">{v}</div>{d && <div className="text-xs text-texto-3">{d}</div>}</div>
                      <button type="button" className="btn-secundario px-2 py-1 text-xs" onClick={() => setPaso(i as number)}>Editar</button>
                    </li>
                  ))}
                </ul>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="interruptor" checked={lider} onChange={(e) => setLider(e.target.checked)} /> Marcar como <b>líder</b> de su área</label>
              </>
            )}
            {(aviso && intentado) || error ? <p className="text-sm text-mal">{error || aviso}</p> : null}
          </div>
          <div className="flex items-center justify-between border-t border-borde px-5 py-3">
            <button type="button" className="btn-secundario" onClick={() => { setIntentado(false); if (paso === 0) onCerrar(); else setPaso(paso - 1); }}>{paso === 0 ? "Cancelar" : <><ChevronLeft className="h-4 w-4" /> Atrás</>}</button>
            <span className="font-mono text-xs text-texto-3">Paso {paso + 1} de 6</span>
            {paso < 5 ? (
              <button
                type="button"
                className="btn-primario"
                onClick={() => {
                  if (faltaPaso(paso)) return setIntentado(true);
                  setIntentado(false);
                  setPaso(paso + 1);
                }}
              >
                Continuar <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" className="btn-primario" disabled={pendiente} onClick={crear}><Check className="h-4 w-4" /> Crear miembro</button>
            )}
          </div>
        </section>

        {/* Vista previa */}
        <aside className="hidden w-80 shrink-0 border-l border-borde p-5 xl:block">
          <div className="mb-3 flex items-center justify-between"><div className="titulo-seccion">Vista previa</div><button type="button" onClick={onCerrar} className="rounded-md p-1 text-texto-3 hover:bg-panel-2" aria-label="Cerrar"><X className="h-4 w-4" /></button></div>
          <div className="rounded-xl border border-borde p-4">
            <div className="flex items-center gap-3 border-b border-borde pb-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold text-white" style={{ background: areaObj?.color ?? "var(--texto-3)" }}>{primeraLetra(nombres[0] ?? "·").toUpperCase()}</span>
              <div><div className="font-semibold">{nombres.length > 1 ? `${nombres.length} personas` : nombres[0] || "Nuevo miembro"}</div><div className="text-sm text-texto-2">{areaObj?.nombre ?? "Sin área"}{puestoTxt !== "—" ? ` · ${puestoTxt}` : ""}</div></div>
            </div>
            <dl className="mt-3 space-y-3 text-sm">
              <div><dt className="titulo-seccion">Compensación</dt><dd className="font-medium">{pct(pctMostrado)} por venta{rolFinal === "caller" ? ` · ${pct(propia && pctAgenda ? pctAgenda : deRol.pct_agenda)} por agenda` : ""}</dd></div>
              <div><dt className="titulo-seccion">Acceso</dt><dd className="font-medium">{accesoReal === "crear" ? "Cuenta nueva" : "Sin cuenta (por ahora)"}</dd></div>
              {accesoReal === "crear" && <div><dt className="titulo-seccion">País</dt><dd className="font-medium">{MERCADOS.find((m) => m.v === mercado)?.t ?? "—"}</dd></div>}
              <div><dt className="titulo-seccion">Rol</dt><dd className="font-medium">{accesoReal === "crear" ? ROL_TXT[rolFinal] : "—"}</dd></div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
