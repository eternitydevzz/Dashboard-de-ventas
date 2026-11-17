"use client";

import { useState } from "react";
import { useAccion } from "@/components/acciones-lead";
import { Seccion } from "@/components/ui";
import type { ConfigWhatsapp, EventoWhatsapp } from "@/lib/tipos";
import { guardarConfigWhatsapp, guardarGrupoWhatsapp } from "./acciones-whatsapp";

// Fase D (Jose, 17 nov 2026): avisos por WhatsApp al equipo. Al lead no se le escribe (lo hace GHL).
const NOMBRE: Record<EventoWhatsapp, string> = { cita: "Cita agendada", venta: "Venta cerrada" };
const DESTINOS: { v: "a_closer" | "a_caller" | "a_grupo"; t: string }[] = [
  { v: "a_closer", t: "Al closer" },
  { v: "a_caller", t: "Al caller que la agendó" },
  { v: "a_grupo", t: "Al grupo de los CEO" },
];

function FormAviso({ inicial }: { inicial: ConfigWhatsapp }) {
  const { evento } = inicial;
  const [c, setC] = useState(inicial);
  const { pendiente, error, ejecutar } = useAccion();
  const guardar = () => ejecutar(() => guardarConfigWhatsapp(evento, c), `Aviso «${NOMBRE[evento]}» guardado`);

  return (
    <Seccion titulo={NOMBRE[evento]}>
      <div className="space-y-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="interruptor" checked={c.activo} onChange={(e) => setC({ ...c, activo: e.target.checked })} />
          {c.activo ? "Encendido: se avisa por WhatsApp" : "Apagado: no se avisa"}
        </label>
        <fieldset>
          <legend className="mb-1 font-medium">A quién se manda</legend>
          <div className="flex flex-col gap-1.5">
            {DESTINOS.map((d) => (
              <label key={d.v} className="flex items-center gap-1.5">
                <input type="checkbox" className="accent-[var(--primario)]" checked={c[d.v]} onChange={(e) => setC({ ...c, [d.v]: e.target.checked })} />
                {d.t}
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="text-xs text-mal">{error}</p>}
        <button type="button" className="btn-primario" disabled={pendiente} onClick={guardar}>
          {pendiente ? "Guardando…" : `Guardar «${NOMBRE[evento]}»`}
        </button>
      </div>
    </Seccion>
  );
}

function FormGrupo({ inicial }: { inicial: string | null }) {
  const [grupo, setGrupo] = useState(inicial ?? "");
  const { pendiente, error, ejecutar } = useAccion();
  const guardar = () => ejecutar(() => guardarGrupoWhatsapp(grupo), "Grupo de los CEO guardado");

  return (
    <Seccion titulo="Grupo de los CEO">
      <div className="space-y-4 text-sm">
        <div>
          <label htmlFor="whatsapp-grupo" className="mb-1 block font-medium">Id del grupo de WhatsApp (termina en @g.us; te lo da WAHA cuando el número está en el grupo)</label>
          <input id="whatsapp-grupo" className="campo w-full" value={grupo} placeholder="120363012345678901@g.us" onChange={(e) => setGrupo(e.target.value)} />
        </div>
        {error && <p className="text-xs text-mal">{error}</p>}
        <button type="button" className="btn-primario" disabled={pendiente} onClick={guardar}>
          {pendiente ? "Guardando…" : "Guardar grupo"}
        </button>
      </div>
    </Seccion>
  );
}

// La pestaña «WhatsApp» de Administración: los avisos al equipo al agendar una cita y al cerrar una venta
export function PantallaWhatsapp({ configs, grupo }: { configs: Record<EventoWhatsapp, ConfigWhatsapp>; grupo: string | null }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-texto-2">Los avisos por WhatsApp al equipo cuando se agenda una cita y cuando se cierra una venta. Para cada uno, si está encendido y a quién le llega.</p>
      <p className="text-sm text-aviso-texto">Los mensajes salen del número del equipo conectado en WAHA. Si WAHA no está conectado, no se manda nada.</p>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {(["cita", "venta"] as const).map((ev) => (
          <FormAviso key={`${ev}-${JSON.stringify(configs[ev])}`} inicial={configs[ev]} />
        ))}
      </div>
      <FormGrupo key={grupo ?? ""} inicial={grupo} />
    </div>
  );
}
