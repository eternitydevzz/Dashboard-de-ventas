"use client";

import { useEffect, useState } from "react";
import { consultarAgenda } from "@/app/(panel)/leads/agenda";
import { zonasDeAgendar } from "@/app/(panel)/leads/acciones";
import { Desplegable } from "@/components/eleccion";
import { localAIso } from "@/lib/formato";
import { enZona } from "@/lib/horarios";
import { nombreZona } from "@/lib/zona-persona";

type Persona = { id: string; nombre: string };

// D43: la hora escrita (zona de quien agenda, como al reagendar) pasada a hora del proyecto, que es lo que lee agendarCita
// (igual que el calendario del caller y el MCP). "" si está a medio escribir.
export function aHoraProyecto(local: string, zonaPersona: string, zonaProyecto: string) {
  try {
    const p = enZona(new Date(localAIso(local, zonaPersona)), zonaProyecto);
    return `${p.ymd}T${p.hm}`;
  } catch {
    return "";
  }
}

// Closer y fecha de una ventana de agendar a mano. Al elegir la hora pregunta al servidor si el closer está libre;
// si no, avisa (se puede agendar igual). La rotación de closers se quitó el 11 oct (4.4).
// C11 (7 nov): `rotacion` = lo agenda un caller; el closer lo pone la rotación (sin desplegable)
export function CamposCita({ closers, inicial, id, rotacion = false }: { closers: Persona[]; inicial?: string; id: string; rotacion?: boolean }) {
  const [closer, setCloser] = useState(inicial || closers[0]?.id || "");
  const [fecha, setFecha] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [zonas, setZonas] = useState<{ proyecto: string; persona: string } | null>(null);
  const fechaProyecto = zonas && fecha ? aHoraProyecto(fecha, zonas.persona, zonas.proyecto) : "";

  useEffect(() => {
    zonasDeAgendar().then(setZonas, () => {});
  }, []);

  useEffect(() => {
    if (!fechaProyecto) return;
    let vivo = true;
    const t = setTimeout(async () => {
      const r = await consultarAgenda(fechaProyecto, rotacion ? null : closer || null);
      if (!vivo || "error" in r) return;
      setAviso(r.aviso);
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [fechaProyecto, closer, rotacion]);

  return (
    <>
      <label className="block">
        <span className="etiqueta-campo">Fecha y hora{zonas ? ` (hora de ${nombreZona(zonas.persona)})` : ""}</span>
        <input type="datetime-local" required className="campo" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <input type="hidden" name="fecha" value={fechaProyecto} />
      </label>
      {rotacion ? (
        <p className="rounded-lg bg-panel-2 px-3 py-2 text-xs text-texto-2"><b>Closer:</b> lo pone la app con la rotación.</p>
      ) : (
      <div>
        <label className="etiqueta-campo" htmlFor={id}>Closer</label>
        <Desplegable id={id} name="closer" required className="campo" value={closer} onChange={(e) => setCloser(e.target.value)}>
          {closers.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </Desplegable>
      </div>
      )}
      {!fecha && !rotacion && <p className="text-xs text-texto-3">Elige la hora para ver si el closer está libre.</p>}
      {aviso && fecha && <p className="rounded-lg bg-aviso-suave px-3 py-2 text-xs text-aviso">⚠ {aviso} Puedes agendar igual.</p>}
    </>
  );
}
