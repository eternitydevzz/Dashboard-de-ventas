"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Copy } from "lucide-react";
import { unirLeads } from "../acciones";
import { confirmar } from "@/components/dialogos";
import { useToast } from "@/components/toasts";
import { Seccion, Vacio } from "@/components/ui";
import { exigirOk } from "@/lib/resultado-cliente";

export type LeadDup = { id: string; nombre: string; apellido: string; email: string | null; telefono: string | null; ghl_contact_id: string | null; creado_en: string };
const nombreDe = (l: LeadDup) => `${l.nombre} ${l.apellido}`.trim() || l.email || "Sin nombre";

export function ListaDuplicados({ grupos }: { grupos: { clave: string; leads: LeadDup[] }[] }) {
  const toast = useToast();
  const [pendiente, empezar] = useTransition();
  const [resultado, setResultado] = useState<string | null>(null);

  async function unir(queda: LeadDup, sobra: LeadDup) {
    const ok = await confirmar(
      `¿Unir a ${nombreDe(sobra)} con ${nombreDe(queda)}? Se queda «${nombreDe(queda)}» (el más antiguo) y pasa a él todo lo de «${nombreDe(sobra)}» (ventas, citas, clientes…). «${nombreDe(sobra)}» se borra, también su contacto en GHL, y no se puede deshacer.`,
      { boton: "Unir" }
    );
    if (!ok) return;
    empezar(async () => {
      try {
        const { fallosGhl } = await exigirOk(unirLeads(queda.id, sobra.id));
        // La unión de la app ya está hecha: lo que GHL no aceptó se hace a mano (queda también en el historial del lead)
        setResultado(fallosGhl.length ? `Unidos en la app, pero en GHL falta: ${fallosGhl.join(" · ")}.` : "Unidos. GHL ha quedado igual.");
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo unir.", "error");
      }
    });
  }

  return (
    <>
      {resultado && <p className="tarjeta p-3 text-sm" role="status">{resultado}</p>}
      {grupos.length === 0 ? (
        <Vacio icono={Copy} texto="No hay leads con el mismo teléfono." />
      ) : (
        grupos.map(({ clave, leads }) => (
          <Seccion key={clave} titulo={`Teléfono …${clave}`}>
            <div className="overflow-x-auto rounded-lg border border-borde">
              <table className="tabla">
                <thead><tr><th>Lead</th><th>Teléfono</th><th>Entró</th><th>Contacto GHL</th><th /></tr></thead>
                <tbody>
                  {leads.map((l, i) => (
                    <tr key={l.id}>
                      <td><Link href={`/leads/${l.id}`} className="font-medium hover:text-primario">{nombreDe(l)}</Link><div className="text-xs text-texto-3">{l.email}</div></td>
                      <td>{l.telefono}</td>
                      <td>{l.creado_en.slice(0, 10)}</td>
                      <td className="text-xs text-texto-3">{l.ghl_contact_id ?? "—"}</td>
                      <td className="text-right">
                        {i === 0 ? <span className="text-xs font-medium text-texto-2">Se queda (el más antiguo)</span> : (
                          <button type="button" className="btn btn-secundario" disabled={pendiente} onClick={() => unir(leads[0], l)}>Unir con el más antiguo</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Seccion>
        ))
      )}
    </>
  );
}
