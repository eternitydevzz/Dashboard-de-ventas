"use client";

import { useState, useTransition } from "react";
import { sinVaciar } from "@/components/sin-vaciar";
import { useRouter } from "next/navigation";
import { RefreshCw, Settings2, Plus, Trash2, Link2, X, PlugZap } from "lucide-react";
import { Modal } from "@/components/modal";
import { useAccion } from "@/components/acciones-lead";
import { useToast } from "@/components/toasts";
import { exigirOk } from "@/lib/resultado-cliente";
import { borrarCuentaFathom, conciliarGrabacionManual, desunirGrabacion, guardarCuentaFathom, probarFathom, sincronizarFathomAhora } from "./acciones-fathom";
import { confirmar } from "@/components/dialogos";
import { Desplegable } from "@/components/eleccion";

type CuentaVista = { id: string; nombre: string; perfil_id: string; formato_titulo: string | null; sincronizado: string | null; resultado: string | null };

export function SincronizarFathom({ hayCuentas }: { hayCuentas: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [cargando, iniciar] = useTransition();
  return (
    <button
      className="btn-secundario border-oro/40 text-oro"
      disabled={cargando || !hayCuentas}
      title={hayCuentas ? "Trae las grabaciones nuevas de Fathom y las une con su cita" : "Añade primero una cuenta de Fathom"}
      onClick={() =>
        iniciar(async () => {
          try {
            const r = (await exigirOk(sincronizarFathomAhora())) as { resumen: string };
            toast(r.resumen);
            router.refresh();
          } catch (e) {
            toast(e instanceof Error ? e.message : "No se pudo sincronizar.", "error");
          }
        })
      }
    >
      <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} /> {cargando ? "Sincronizando…" : "Sincronizar Fathom"}
    </button>
  );
}

// «Cuentas»: la cuenta de Fathom de cada closer (nombre, API key y formato de título)
export function CuentasFathom({ cuentas, closers, jefe, yo }: { cuentas: CuentaVista[]; closers: { id: string; nombre: string }[]; jefe: boolean; yo: string }) {
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<CuentaVista | "nueva" | null>(null);
  const { pendiente, error, ok, ejecutar } = useAccion();
  const toast = useToast();
  const [probando, iniciar] = useTransition();
  const nombreCloser = (id: string) => closers.find((c) => c.id === id)?.nombre ?? "—";
  return (
    <>
      <button className="btn-secundario" onClick={() => setAbierto(true)}><Settings2 className="h-4 w-4" /> Cuentas</button>
      {abierto && (
        <Modal titulo="Cuentas de Fathom" onCerrar={() => { setAbierto(false); setEditando(null); }} ancho="max-w-lg">
          {editando ? (
            <form
              className="space-y-3 text-sm"
              onSubmit={sinVaciar((fd) =>
                ejecutar(async () => {
                  const r = await guardarCuentaFathom(editando === "nueva" ? null : editando.id, { nombre: String(fd.get("nombre") ?? ""), apiKey: String(fd.get("key") ?? ""), formato: String(fd.get("formato") ?? ""), perfilId: String(fd.get("closer") ?? yo) });
                  if (!(r && typeof r === "object" && "error" in r)) setEditando(null);
                  return r;
                }, "Cuenta guardada")
              )}
            >
              <div><label className="etiqueta-campo" htmlFor="fa-nombre">Nombre</label><input id="fa-nombre" name="nombre" required defaultValue={editando === "nueva" ? "" : editando.nombre} className="campo" placeholder="Ej. Fathom de Ana" /></div>
              {jefe && (
                <div><label className="etiqueta-campo" htmlFor="fa-closer">Closer</label><Desplegable id="fa-closer" name="closer" defaultValue={editando === "nueva" ? closers[0]?.id : editando.perfil_id} className="campo">{closers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Desplegable></div>
              )}
              <div>
                <label className="etiqueta-campo" htmlFor="fa-key">API key de Fathom</label>
                <input id="fa-key" name="key" type="password" autoComplete="off" className="campo" placeholder={editando === "nueva" ? "Pégala aquí" : "Déjala vacía para no cambiarla"} required={editando === "nueva"} />
                <p className="mt-1 text-xs text-texto-3">En Fathom: Settings → API Access → crear clave. Se guarda en el servidor y no se vuelve a enseñar.</p>
              </div>
              <div>
                <label className="etiqueta-campo" htmlFor="fa-formato">Formato de título</label>
                <input id="fa-formato" name="formato" defaultValue={editando === "nueva" ? "{nombre cliente}: Sesión…" : editando.formato_titulo ?? ""} className="campo" />
                <p className="mt-1 text-xs text-texto-3">Cómo se llaman las reuniones, para sacar el nombre del cliente y unir la grabación con su cita. «…» vale cualquier cosa.</p>
              </div>
              {error && <p className="text-mal">{error}</p>}
              <div className="flex gap-2"><button type="button" className="btn-secundario flex-1" onClick={() => setEditando(null)}>Atrás</button><button className="btn-primario flex-1" disabled={pendiente}>Guardar</button></div>
            </form>
          ) : (
            <div className="space-y-3 text-sm">
              {cuentas.length === 0 && <p className="text-texto-3">Aún no hay cuentas. Cada closer añade la suya.</p>}
              {cuentas.map((c) => (
                <div key={c.id} className="rounded-lg border border-borde p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div><b>{c.nombre}</b> <span className="text-xs text-texto-3">· {nombreCloser(c.perfil_id)}</span></div>
                    <div className="flex gap-1">
                      <button className="btn-secundario px-2 py-1 text-xs" disabled={probando} onClick={() => iniciar(async () => { try { const r = (await exigirOk(probarFathom(c.id))) as { mensaje: string }; toast(r.mensaje); } catch (e) { toast(e instanceof Error ? e.message : "Falló", "error"); } })}><PlugZap className="h-3.5 w-3.5" /> Probar</button>
                      <button className="btn-secundario px-2 py-1 text-xs" onClick={() => setEditando(c)}>Editar</button>
                      <button className="rounded-md p-1.5 text-texto-3 hover:bg-mal-suave hover:text-mal" disabled={pendiente} title="Quitar" onClick={() => void confirmar("¿Quitar esta cuenta? Las grabaciones ya traídas se quedan.").then((ok) => ok && ejecutar(() => borrarCuentaFathom(c.id), "Cuenta quitada"))}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-texto-3">{c.formato_titulo ? `Título: ${c.formato_titulo}` : "Sin formato de título"} · {c.sincronizado ? `Última: ${c.sincronizado}` : "Nunca sincronizada"}{c.resultado ? ` · ${c.resultado}` : ""}</div>
                </div>
              ))}
              <button className="btn-primario w-full" onClick={() => setEditando("nueva")}><Plus className="h-4 w-4" /> Añadir cuenta</button>
              {(error || ok) && <p className={error ? "text-mal" : "text-ok"}>{error || ok}</p>}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

// Conciliar una grabación: elegir la cita (del mismo closer, de ese día o cerca) o desunir / descartar
export function AccionesGrabacion({ id, unida, descartada, opciones }: { id: string; unida: boolean; descartada: boolean; opciones: { id: string; texto: string }[] }) {
  const { pendiente, error, ejecutar } = useAccion();
  const [cita, setCita] = useState("");
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      {!unida && !descartada && (
        <>
          <Desplegable value={cita} onChange={(e) => setCita(e.target.value)} className="campo w-auto max-w-56 py-1 text-xs" aria-label="Cita a la que unir la grabación">
            <option value="">{opciones.length ? "Elegir cita…" : "No hay citas cerca"}</option>
            {opciones.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
          </Desplegable>
          <button className="btn-primario px-2 py-1 text-xs" disabled={pendiente || !cita} onClick={() => ejecutar(() => conciliarGrabacionManual(id, cita), "Grabación unida")}><Link2 className="h-3.5 w-3.5" /> Unir</button>
          <button className="btn-secundario px-2 py-1 text-xs" disabled={pendiente} onClick={() => ejecutar(() => desunirGrabacion(id, true), "Descartada")} title="No es una llamada de venta">Descartar</button>
        </>
      )}
      {(unida || descartada) && <button className="btn-secundario px-2 py-1 text-xs" disabled={pendiente} onClick={() => ejecutar(() => desunirGrabacion(id), "Vuelve a pendiente")}><X className="h-3.5 w-3.5" /> {unida ? "Desunir" : "Recuperar"}</button>}
      {error && <span className="w-full text-right text-xs text-mal">{error}</span>}
    </span>
  );
}
