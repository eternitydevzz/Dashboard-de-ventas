"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings2, Trash2, Check, Star, CalendarClock, ListChecks, UserRound } from "lucide-react";
import { Modal } from "@/components/modal";
import { FormVenta, useAccion } from "@/components/acciones-lead";
import { exigirOk } from "@/lib/resultado-cliente";
import { ESTADOS_CLIENTE, type EstadoCliente, type FichaCliente } from "@/lib/clientes";
import type { Producto } from "@/lib/tipos";
import { anotarSeguimiento, borrarPasoOnboarding, cambiarEstadoCliente, guardarCasoExito, guardarPasoOnboarding, marcarPasoOnboarding, nuevoCliente } from "./acciones";
import { confirmar } from "@/components/dialogos";

type Paso = { id: string; nombre: string };
const cerrarSiOk = (r: unknown, cerrar: () => void) => {
  if (!(r && typeof r === "object" && "error" in r)) cerrar();
  return r;
};

// Ficha del cliente: estado, seguimiento, onboarding y caso de éxito
export function GestionarCliente({ leadId, nombre, ficha, pasos, notas, pestana = "seguimiento", texto = "Gestionar" }: { leadId: string; nombre: string; ficha: FichaCliente; pasos: Paso[]; notas: { nota: string; creado_en: string }[]; pestana?: "seguimiento" | "onboarding" | "caso"; texto?: string }) {
  const [abierto, setAbierto] = useState(false);
  const [tab, setTab] = useState(pestana);
  const { pendiente, error, ejecutar } = useAccion();
  const [caso, setCaso] = useState(ficha.caso_exito);
  return (
    <>
      <button className="btn-secundario px-2.5 py-1 text-xs" onClick={() => { setTab(pestana); setAbierto(true); }}>{texto}</button>
      {abierto && (
        <Modal titulo={nombre} onCerrar={() => setAbierto(false)} ancho="max-w-lg">
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-texto-2">Estado:</span>
              {ESTADOS_CLIENTE.map((x) => (
                <button key={x.v} disabled={pendiente} onClick={() => ejecutar(() => cambiarEstadoCliente(leadId, x.v as EstadoCliente), `Ahora está «${x.t}»`)} className={`rounded-full px-3 py-1 text-xs ${ficha.estado === x.v ? "bg-primario text-white" : "bg-panel-2 text-texto-2 hover:text-texto"}`}>
                  {x.t}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-lg border border-borde bg-panel-2 p-0.5">
              {([["seguimiento", "Seguimiento", CalendarClock], ["onboarding", "Onboarding", ListChecks], ["caso", "Caso de éxito", Star]] as const).map(([v, t, I]) => (
                <button key={v} onClick={() => setTab(v)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs ${tab === v ? "bg-primario text-white" : "text-texto-2"}`}><I className="h-3.5 w-3.5" />{t}</button>
              ))}
            </div>

            {tab === "seguimiento" && (
              <form className="space-y-3" action={(fd) => ejecutar(async () => cerrarSiOk(await anotarSeguimiento(leadId, String(fd.get("nota") ?? ""), String(fd.get("proximo") ?? "")), () => setAbierto(false)), "Seguimiento guardado")}>
                <div><label className="etiqueta-campo" htmlFor="seg-nota">Nota de este contacto (opcional)</label><textarea id="seg-nota" name="nota" rows={3} className="campo" placeholder="Cómo va, qué necesita…" /></div>
                <div><label className="etiqueta-campo" htmlFor="seg-proximo">Próximo contacto</label><input id="seg-proximo" name="proximo" type="date" defaultValue={ficha.proximo_contacto ?? ""} className="campo" /></div>
                <button className="btn-primario w-full" disabled={pendiente}>Guardar</button>
                {notas.length > 0 && (
                  <div className="space-y-2 border-t border-borde pt-3">
                    <div className="titulo-seccion">Notas anteriores</div>
                    {notas.slice(0, 8).map((n) => <div key={n.creado_en} className="rounded-lg bg-panel-2 p-2"><div className="text-[11px] text-texto-3">{new Date(n.creado_en).toLocaleDateString("es-ES")}</div>{n.nota}</div>)}
                  </div>
                )}
              </form>
            )}

            {tab === "onboarding" && (
              <div className="space-y-2">
                {pasos.length === 0 && <p className="text-texto-3">No hay pasos. Créalos en «Pasos del onboarding».</p>}
                {pasos.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 rounded-lg bg-panel-2 px-3 py-2">
                    <input type="checkbox" defaultChecked={!!ficha.onboarding[p.id]} disabled={pendiente} onChange={(e) => ejecutar(() => marcarPasoOnboarding(leadId, p.id, e.target.checked), e.target.checked ? "Paso hecho" : "Paso desmarcado")} />
                    <span className="flex-1">{p.nombre}</span>
                    {ficha.onboarding[p.id] && <span className="text-[11px] text-texto-3">{new Date(ficha.onboarding[p.id]).toLocaleDateString("es-ES")}</span>}
                  </label>
                ))}
              </div>
            )}

            {tab === "caso" && (
              <form className="space-y-3" action={(fd) => ejecutar(async () => cerrarSiOk(await guardarCasoExito(leadId, { caso, resultado: String(fd.get("resultado") ?? ""), enlace: String(fd.get("enlace") ?? ""), fecha: String(fd.get("fecha") ?? "") }), () => setAbierto(false)), "Caso de éxito guardado")}>
                <label className="flex items-center gap-2"><input type="checkbox" className="interruptor" checked={caso} onChange={(e) => setCaso(e.target.checked)} /> Es un caso de éxito</label>
                <div><label className="etiqueta-campo" htmlFor="caso-res">Resultado que consiguió</label><textarea id="caso-res" name="resultado" rows={3} defaultValue={ficha.caso_resultado ?? ""} className="campo" placeholder="Ej. Primer cliente de 3.000 € en 6 semanas" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="etiqueta-campo" htmlFor="caso-enl">Enlace al testimonio</label><input id="caso-enl" name="enlace" defaultValue={ficha.caso_enlace ?? ""} className="campo" placeholder="https://…" /></div>
                  <div><label className="etiqueta-campo" htmlFor="caso-fecha">Fecha</label><input id="caso-fecha" name="fecha" type="date" defaultValue={ficha.caso_fecha ?? ""} className="campo" /></div>
                </div>
                <button className="btn-primario w-full" disabled={pendiente}>Guardar</button>
              </form>
            )}
            {error && <p className="text-mal">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

export function EditorPasos({ pasos }: { pasos: Paso[] }) {
  const [abierto, setAbierto] = useState(false);
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <>
      <button className="btn-secundario" onClick={() => setAbierto(true)}><Settings2 className="h-4 w-4" /> Pasos del onboarding</button>
      {abierto && (
        <Modal titulo="Pasos del onboarding" onCerrar={() => setAbierto(false)}>
          <div className="space-y-2 text-sm">
            <p className="text-xs text-texto-3">Lo que hay que hacer con cada cliente nuevo. Si borras un paso, deja de contar en el % de todos.</p>
            {pasos.map((p) => (
              <form key={p.id} className="flex items-center gap-2" action={(fd) => ejecutar(() => guardarPasoOnboarding(p.id, String(fd.get("nombre"))), "Paso guardado")}>
                <input name="nombre" defaultValue={p.nombre} className="campo py-1.5" aria-label="Nombre del paso" />
                <button className="rounded-md p-1.5 text-texto-3 hover:bg-panel-2" disabled={pendiente} title="Guardar"><Check className="h-4 w-4" /></button>
                <button type="button" className="rounded-md p-1.5 text-texto-3 hover:bg-mal-suave hover:text-mal" disabled={pendiente} title="Borrar" onClick={() => void confirmar(`¿Borrar el paso «${p.nombre}»?`).then((ok) => ok && ejecutar(() => borrarPasoOnboarding(p.id), "Paso borrado"))}><Trash2 className="h-4 w-4" /></button>
              </form>
            ))}
            <form className="flex items-center gap-2 border-t border-borde pt-2" action={(fd) => ejecutar(() => guardarPasoOnboarding(null, String(fd.get("nombre"))), "Paso añadido")}>
              <input name="nombre" required placeholder="Nuevo paso" className="campo py-1.5" aria-label="Nuevo paso" />
              <button className="btn-secundario px-2 py-1.5" disabled={pendiente} aria-label="Añadir paso"><Plus className="h-4 w-4" /></button>
            </form>
            {error && <p className="text-mal">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

// «Nuevo cliente» = sus datos + su venta (así cuenta en Ventas y en Finanzas)
export function NuevoCliente({ productos, vendedores, moneda }: { productos: Producto[]; vendedores?: { id: string; nombre: string }[]; moneda: string }) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const router = useRouter();
  const cerrar = () => { setAbierto(false); setDatos(null); setError(""); };
  return (
    <>
      <button className="btn-primario" onClick={() => setAbierto(true)}><Plus className="h-4 w-4" /> Nuevo cliente</button>
      {abierto && (
        <Modal titulo={datos ? `Qué compró ${datos.nombre}` : "Nuevo cliente"} onCerrar={cerrar} ancho="max-w-lg">
          {!datos ? (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); setDatos(Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v)]))); }}>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="etiqueta-campo" htmlFor="nc-nombre">Nombre</label><input id="nc-nombre" name="nombre" required className="campo" /></div>
                <div><label className="etiqueta-campo" htmlFor="nc-apellido">Apellido</label><input id="nc-apellido" name="apellido" className="campo" /></div>
                <div><label className="etiqueta-campo" htmlFor="nc-email">Email</label><input id="nc-email" name="email" type="email" className="campo" /></div>
                <div><label className="etiqueta-campo" htmlFor="nc-tel">Teléfono</label><input id="nc-tel" name="telefono" className="campo" /></div>
              </div>
              <p className="text-xs text-texto-3"><UserRound className="mr-1 inline h-3.5 w-3.5" />Si ya existe con ese email o teléfono, la venta se le suma a él (no se duplica).</p>
              <button className="btn-primario w-full">Siguiente: qué compró</button>
            </form>
          ) : (
            <div className="space-y-3">
              <FormVenta
                productos={productos}
                vendedores={vendedores}
                moneda={moneda}
                onEnviar={async (fd) => {
                  for (const [k, v] of Object.entries(datos)) fd.set(k, v);
                  setCargando(true);
                  setError("");
                  try {
                    await exigirOk(nuevoCliente(fd));
                    cerrar();
                    router.refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Algo falló.");
                  } finally {
                    setCargando(false);
                  }
                }}
              />
              {cargando && <p className="text-sm text-texto-3">Guardando…</p>}
              {error && <p className="text-sm text-mal">{error}</p>}
              <button className="text-xs text-primario hover:underline" onClick={() => setDatos(null)}>← Cambiar los datos</button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
