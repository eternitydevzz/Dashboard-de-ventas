"use client";

import { useState } from "react";
import { PlugZap, Save } from "lucide-react";
import { useAccion, Mensajes } from "@/components/acciones-lead";
import { exigirOk } from "@/lib/resultado-cliente";
import { guardarCalendarioCloser, guardarCalendariosProyecto, guardarConexionGhl, guardarUsuarioGhl, probarConexionGhl } from "./acciones";

// Conexión con la API de GHL (token privado + subcuenta). El token nunca vuelve al navegador.
export function ConexionGhl({ locationId, tieneToken }: { locationId: string; tieneToken: boolean }) {
  const { pendiente, error, ejecutar } = useAccion();
  const [ok, setOk] = useState("");
  return (
    <form
      className="space-y-3"
      action={(fd) => {
        setOk("");
        ejecutar(() => guardarConexionGhl(String(fd.get("token") ?? ""), String(fd.get("location") ?? "")), "Conexión con GHL guardada");
      }}
    >
      <div>
        <label className="etiqueta-campo" htmlFor="ghl-private-integration-token-ajus">Private Integration Token (Ajustes → Private Integrations en GHL)</label>
        <input id="ghl-private-integration-token-ajus" name="token" type="password" autoComplete="off" className="campo" placeholder={tieneToken ? "•••••••• guardado (déjalo vacío para no cambiarlo)" : "pit-…"} />
        <p className="mt-1 text-xs text-texto-3">Permisos que necesita: <code>calendars/events.readonly</code>, <code>contacts.readonly</code> y <code>conversations/message.readonly</code> (para las llamadas).</p>
      </div>
      <label className="block"><span className="etiqueta-campo">Id de la subcuenta (Location ID)</span><input name="location" required defaultValue={locationId} className="campo" /></label>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primario" disabled={pendiente}><Save className="h-4 w-4" /> Guardar</button>
        <button
          type="button"
          className="btn-secundario"
          disabled={pendiente}
          onClick={() =>
            ejecutar(async () => {
              const r = (await exigirOk(probarConexionGhl())) as { ok: string };
              setOk(r.ok);
            })
          }
        >
          <PlugZap className="h-4 w-4" /> Probar conexión
        </button>
      </div>
      <Mensajes error={error} ok={ok} />
    </form>
  );
}

// Calendarios de GHL del proyecto: un id por línea. Vacío = por closer, como antes.
export function CalendariosProyecto({ ids }: { ids: string[] }) {
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <form className="space-y-2" action={(fd) => ejecutar(() => guardarCalendariosProyecto(String(fd.get("ids") ?? "").split("\n")), "Calendarios del proyecto guardados")}>
      <label className="block">
        <span className="etiqueta-campo">Calendarios de GHL del proyecto (un id por línea)</span>
        <textarea name="ids" rows={4} defaultValue={ids.join("\n")} className="campo font-mono text-xs" placeholder="Calendar ID" />
      </label>
      <p className="text-xs text-texto-3">Si lo dejas vacío, la app lee el calendario de cada closer.</p>
      <button className="btn-secundario" disabled={pendiente}><Save className="h-4 w-4" /> Guardar</button>
      {error && <p className="text-xs text-mal">{error}</p>}
    </form>
  );
}

export function CalendarioCloser({ perfilId, nombre, calendarId, userId }: { perfilId: string; nombre: string; calendarId: string; userId: string }) {
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <form className="grid gap-2 rounded-lg border border-borde bg-panel-2 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" action={(fd) => ejecutar(() => guardarCalendarioCloser(perfilId, String(fd.get("cal") ?? ""), String(fd.get("user") ?? "")), `Calendario de ${nombre} guardado`)}>
      <div className="text-sm font-medium sm:pb-2">{nombre}</div>
      <label className="block"><span className="etiqueta-campo">Id del calendario</span><input name="cal" defaultValue={calendarId} className="campo" placeholder="Calendar ID" /></label>
      <label className="block"><span className="etiqueta-campo">o id de usuario de GHL</span><input name="user" defaultValue={userId} className="campo" placeholder="User ID" /></label>
      <button className="btn-secundario" disabled={pendiente}><Save className="h-4 w-4" /> Guardar</button>
      {error && <p className="text-xs text-mal sm:col-span-4">{error}</p>}
    </form>
  );
}

// Usuario de GHL de alguien que no es closer (callers, directores): para saber quién hizo cada llamada (V2-11)
export function UsuarioGhl({ perfilId, nombre, rol, userId }: { perfilId: string; nombre: string; rol: string; userId: string }) {
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <form className="flex flex-wrap items-center gap-2 rounded-lg border border-borde bg-panel-2 px-3 py-2 text-sm" action={(fd) => ejecutar(() => guardarUsuarioGhl(perfilId, String(fd.get("user") ?? "")), `Usuario de GHL de ${nombre} guardado`)}>
      <span className="w-40 truncate font-medium">{nombre} <span className="text-xs text-texto-3">{rol}</span></span>
      <input name="user" defaultValue={userId} className="campo w-56 py-1" placeholder="User ID de GHL" aria-label={`Usuario de GHL de ${nombre}`} />
      <button className="btn-secundario px-2 py-1 text-xs" disabled={pendiente}>Guardar</button>
      {error && <span className="w-full text-xs text-mal">{error}</span>}
    </form>
  );
}
