"use client";

import { useState } from "react";
import { sinVaciar } from "@/components/sin-vaciar";
import { Plus, Search, UserPlus } from "lucide-react";
import { Modal } from "@/components/modal";
import { FormVenta, Mensajes, crearUnaVez, useAccion } from "@/components/acciones-lead";
import { registrarVenta } from "@/app/(panel)/leads/acciones";
import { confirmar } from "@/components/dialogos";
import { useToast } from "@/components/toasts";
import { exigirOk } from "@/lib/resultado-cliente";
import type { Producto } from "@/lib/tipos";
import { buscarLeadsVenta, crearLeadVenta } from "./acciones";

type LeadVenta = { id: string; nombre: string; apellido: string | null; email: string | null; telefono: string | null };
type Persona = { id: string; nombre: string; moneda?: string };
const nombreDe = (l: LeadVenta) => `${l.nombre} ${l.apellido ?? ""}`.trim();
const contacto = (l: LeadVenta) => [l.email, l.telefono].filter(Boolean).join(" · ");

// Cristian, 14 nov: «Nueva venta» (CEO y directores) para una venta que entró por otro lado.
// Paso 1, el lead (buscarlo o crearlo); paso 2, el formulario y la acción de «Registrar venta» de siempre.
export function NuevaVenta({ productos, vendedores, miId, moneda }: { productos: Producto[]; vendedores: Persona[]; miId: string; moneda: string }) {
  const [abierto, setAbierto] = useState(false);
  const [lead, setLead] = useState<LeadVenta | null>(null);
  const [encontrados, setEncontrados] = useState<LeadVenta[] | null>(null);
  const [crear, setCrear] = useState(false);
  const { pendiente, error, ok, ejecutar } = useAccion();
  const toast = useToast();
  const [enCurso] = useState(() => new Set<string>()); // doble clic = una sola venta (como en la ficha)
  const unaVez = crearUnaVez(enCurso, ejecutar, toast);
  const cerrar = () => { setAbierto(false); setLead(null); setEncontrados(null); setCrear(false); };

  return (
    <>
      <button className="btn-primario" onClick={() => setAbierto(true)}><Plus className="h-4 w-4" /> Nueva venta</button>
      {abierto && (
        <Modal titulo={lead ? `Venta de ${nombreDe(lead)}` : "Nueva venta"} onCerrar={cerrar} ancho="max-w-lg">
          {lead ? (
            <div className="space-y-3">
              <p className="text-sm text-texto-2">{contacto(lead)} <button type="button" className="ml-1 text-xs text-primario hover:underline" onClick={() => setLead(null)}>← Cambiar lead</button></p>
              <FormVenta
                productos={productos}
                vendedores={vendedores}
                miId={miId}
                moneda={moneda}
                onEnviar={(fd) => unaVez("venta", async () => { await exigirOk(registrarVenta(lead.id, fd)); cerrar(); }, "Venta registrada")}
              />
              <Mensajes error={error} ok={ok} />
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <form className="flex gap-2" onSubmit={sinVaciar((fd) => ejecutar(async () => setEncontrados(await exigirOk(buscarLeadsVenta(String(fd.get("texto") ?? ""))))))}>
                <input name="texto" minLength={3} required autoFocus className="campo" placeholder="Nombre, email o teléfono (mínimo 3 letras)" aria-label="Buscar lead" />
                <button className="btn-secundario" disabled={pendiente} aria-label="Buscar"><Search className="h-4 w-4" /></button>
              </form>
              {encontrados && (encontrados.length === 0 ? (
                <p className="text-texto-3">No hay ningún lead con eso.</p>
              ) : (
                <ul className="divide-y divide-borde rounded-lg border border-borde">
                  {encontrados.map((l) => (
                    <li key={l.id}>
                      <button type="button" className="w-full px-3 py-2 text-left hover:bg-panel-2" onClick={() => setLead(l)}>
                        <div className="font-medium">{nombreDe(l)}</div>
                        <div className="text-xs text-texto-3">{contacto(l)}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
              {!crear ? (
                <button type="button" className="text-xs text-primario hover:underline" onClick={() => setCrear(true)}><UserPlus className="mr-1 inline h-3.5 w-3.5" />No está: crear el lead</button>
              ) : (
                <form
                  className="space-y-3 border-t border-borde pt-3"
                  onSubmit={sinVaciar((fd) =>
                    ejecutar(async () => {
                      const r = await exigirOk(crearLeadVenta(fd));
                      if (r.lead) return setLead(r.lead);
                      // Ya hay un lead con ese email o teléfono: se ofrece ese en vez de crear un duplicado
                      if (r.existente && await confirmar(`Ya existe «${nombreDe(r.existente)}» (${contacto(r.existente)}) con ese email o teléfono. ¿Registrar la venta a ese lead?`, { boton: "Usar ese lead" })) setLead(r.existente!);
                    })
                  )}
                >
                  <div><label className="etiqueta-campo" htmlFor="nv-nombre">Nombre y apellido</label><input id="nv-nombre" name="nombre" required className="campo" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="etiqueta-campo" htmlFor="nv-email">Email</label><input id="nv-email" name="email" type="email" className="campo" /></div>
                    <div><label className="etiqueta-campo" htmlFor="nv-tel">Teléfono</label><input id="nv-tel" name="telefono" className="campo" /></div>
                  </div>
                  <button className="btn-primario w-full" disabled={pendiente}>Crear y seguir</button>
                </form>
              )}
              <Mensajes error={error} ok={ok} />
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
