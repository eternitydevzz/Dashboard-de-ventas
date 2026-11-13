"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, RotateCw } from "lucide-react";
import { Modal } from "@/components/modal";
import { EditorHorario } from "@/components/editor-horario";
import { ListaPermisosPersona } from "@/app/(panel)/admin/permisos";
import { FormAjustes } from "@/app/(panel)/admin/horarios";
import { CalendarioCloser, UsuarioGhl } from "@/app/(panel)/admin/ghl";
import { DatosYComision, type Area, type Miembro, type Puesto } from "./cliente";
import { AccesoPersona, FathomPersona, PctPersona, PipelinesPersona, type Ficha } from "./ficha-partes";
import { cargarFicha } from "./ficha-acciones";
import { esCloser, type Rol } from "@/lib/tipos";

type Pestana = "datos" | "acceso" | "permisos" | "agenda" | "integraciones";

// Ficha completa de cada persona (bloque 5 de 1.0, Cristian 11 oct 2026). Se abre desde Empresa → Equipo y desde
// Administración → Equipo. «Datos y comisión» la ve quien tiene Equipo (como antes); el resto, solo el CEO y los
// directores con Administración, y solo para quien tiene acceso a la app.
export function FichaPersona({
  titulo,
  m,
  perfilId,
  admin,
  abiertaAlInicio = false,
  boton,
  datos,
}: {
  titulo: string;
  m: Miembro | null; // su fila del organigrama (los perfiles de prueba no tienen)
  perfilId: string | null; // su usuario (null = solo está en el organigrama)
  admin: boolean;
  abiertaAlInicio?: boolean;
  boton?: "lapiz" | "texto" | "nombre"; // «nombre» (Fase 5): el propio nombre abre la ficha (organigrama)
  datos: { areas: Area[]; puestos: Puesto[]; productos: { id: string; nombre: string }[]; rolesQuePuedoDar: Rol[]; puedeComision: boolean };
}) {
  const [abierta, setAbierta] = useState(abiertaAlInicio);
  const conAcceso = admin && !!perfilId;
  const [pestana, setPestana] = useState<Pestana>(m ? "datos" : "acceso");
  const [f, setF] = useState<Ficha | null>(null);
  const [error, setError] = useState("");
  const [fallo, setFallo] = useState(false); // falló la red: «Reintentar» en vez de «Cargando…» para siempre

  const recargar = useCallback(() => {
    if (!perfilId) return;
    cargarFicha(perfilId).then(
      (r) => {
        setFallo(!r || typeof r !== "object");
        if (!r || typeof r !== "object") return;
        if ("error" in r) setError(r.error);
        else {
          setError("");
          setF(r);
        }
      },
      () => setFallo(true),
    );
  }, [perfilId]);
  useEffect(() => {
    if (abierta && conAcceso) recargar();
  }, [abierta, conAcceso, recargar]);

  const rol = f?.persona.rol;
  const pestanas: { v: Pestana; t: string }[] = [
    ...(m ? [{ v: "datos" as const, t: "Datos y comisión" }] : []),
    ...(conAcceso ? [{ v: "acceso" as const, t: "Acceso" }, { v: "permisos" as const, t: "Permisos" }] : []),
    ...(conAcceso && (rol === "caller" || rol === "closer") ? [{ v: "agenda" as const, t: "Horario y reparto" }, { v: "integraciones" as const, t: "GHL y Fathom" }] : []),
    ...(conAcceso && (rol === "director" || rol === "ceo") ? [{ v: "integraciones" as const, t: "GHL" }] : []),
  ];

  return (
    <>
      {boton === "nombre" ? (
        <button type="button" className="truncate text-left font-medium hover:text-primario hover:underline" onClick={() => setAbierta(true)} title={`Abrir la ficha de ${titulo}`}>{titulo}</button>
      ) : boton === "texto" ? (
        <button type="button" className="btn-secundario px-2.5 py-1.5 text-xs" onClick={() => setAbierta(true)} aria-label={`Ficha de ${titulo}`}>Ficha</button>
      ) : (
        <button type="button" className="rounded-md p-1.5 text-texto-3 hover:bg-panel-2 hover:text-texto" onClick={() => setAbierta(true)} title="Ficha" aria-label={`Ficha de ${titulo}`}><Pencil className="h-3.5 w-3.5" /></button>
      )}
      {abierta && (
        <Modal titulo={`Ficha · ${titulo}`} onCerrar={() => setAbierta(false)} ancho="max-w-3xl">
          {pestanas.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-borde bg-panel p-1" role="tablist">
              {pestanas.map((p) => (
                <button key={p.v} type="button" role="tab" aria-selected={pestana === p.v} onClick={() => setPestana(p.v)} className={`rounded-lg px-3 py-1.5 text-sm ${pestana === p.v ? "bg-primario text-white" : "text-texto-2 hover:bg-panel-2"}`}>{p.t}</button>
              ))}
            </div>
          )}
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            {pestana === "datos" && m && <DatosYComision m={m} {...datos} admin={admin} />}
            {pestana !== "datos" && conAcceso && !f && !error && !fallo && <p className="text-sm text-texto-3">Cargando…</p>}
            {pestana !== "datos" && fallo && (
              <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-mal hover:underline" onClick={() => (setFallo(false), recargar())}>
                <RotateCw className="h-3.5 w-3.5" /> No se pudo cargar · Reintentar
              </button>
            )}
            {pestana !== "datos" && error && <p className="text-sm text-mal">{error}</p>}
            {f && pestana === "acceso" && <AccesoPersona key={`${f.persona.email}-${f.persona.rol}`} f={f} recargar={recargar} />}
            {f && pestana === "permisos" && (
              <div className="space-y-4">
                {f.persona.rol === "ceo" ? <p className="text-sm text-texto-3">El CEO lo tiene todo siempre.</p> : <ListaPermisosPersona persona={{ id: f.persona.id, nombre: f.persona.nombre, rol: f.persona.rol as "director" | "closer" | "caller" }} datos={f.permisos} onCambio={recargar} />}
                <div className="border-t border-borde pt-3">
                  <h3 className="mb-2 text-sm font-semibold">Pipelines del CRM</h3>
                  <PipelinesPersona f={f} recargar={recargar} />
                </div>
              </div>
            )}
            {f && pestana === "agenda" && (
              <div className="space-y-4">
                {f.persona.rol === "caller" && <PctPersona f={f} />}
                <div className="border-t border-borde pt-3">
                  <h3 className="mb-2 text-sm font-semibold">{rol === "closer" ? "Horario para recibir llamadas" : "Horario de trabajo"}</h3>
                  <EditorHorario inicial={f.horario} zona={f.zona} perfilId={f.persona.id} />
                </div>
                {esCloser(f.persona) && ( // también Facu (caller con «También closer», 9 nov)
                  <div className="border-t border-borde pt-3">
                    <h3 className="mb-1 text-sm font-semibold">Sus llamadas</h3>
                    <p className="mb-2 text-xs text-texto-3">Si no le pones unos propios, usa los del proyecto ({f.calendario.general.duracion} min, descanso {f.calendario.general.descanso} min…).</p>
                    <FormAjustes key={JSON.stringify(f.calendario.propios)} perfilId={f.persona.id} inicial={f.calendario.propios ?? f.calendario.general} propios={!!f.calendario.propios} />
                  </div>
                )}
              </div>
            )}
            {f && pestana === "integraciones" && (
              <div className="space-y-4">
                {rol === "closer" ? (
                  <CalendarioCloser perfilId={f.persona.id} nombre={f.persona.nombre} calendarId={f.ghl.calendarId} userId={f.ghl.userId} />
                ) : (
                  <UsuarioGhl perfilId={f.persona.id} nombre={f.persona.nombre} rol={rol ?? ""} userId={f.ghl.userId} />
                )}
                {rol === "closer" && (
                  <div className="border-t border-borde pt-3">
                    <h3 className="mb-2 text-sm font-semibold">Cuentas de Fathom</h3>
                    <FathomPersona f={f} recargar={recargar} />
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
