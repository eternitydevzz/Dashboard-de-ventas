"use client";

import Link from "next/link";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useAccion } from "@/components/acciones-lead";
import { useToast } from "@/components/toasts";
import { exigirOk } from "@/lib/resultado-cliente";
import { actualizarMiembro, cambiarPassword, enviarEnlaceMagico, quitarDelProyecto } from "@/app/(panel)/admin/acciones";
import { guardarPermisoPipeline } from "@/app/(panel)/crm/acciones";
import { borrarCuentaFathom, guardarCuentaFathom } from "@/app/(panel)/closer/llamadas/acciones-fathom";
import { cambiarEmailPersona, guardarContactoPersona, guardarTambienCloser, marcarPrueba, type cargarFicha } from "./ficha-acciones";
import type { Rol } from "@/lib/tipos";
import { confirmar } from "@/components/dialogos";
import { Pastillas } from "@/components/eleccion";

// Partes de la ficha de cada persona (bloque 5 de 1.0). Cada una se pone al día al guardar (recargar).
export type Ficha = Exclude<Awaited<ReturnType<typeof cargarFicha>>, { error: string }>;
const NIVEL_TXT: Record<string, string> = { editar: "Editar", ver: "Ver", sin_acceso: "Sin acceso" };
const ROL_TXT: Record<Rol, string> = { caller: "Caller", closer: "Closer", director: "Director", ceo: "CEO" };

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border border-borde p-3">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {children}
    </section>
  );
}

// ---------- Acceso: contacto, email, contraseña, enlace mágico, rol y Administración, perfil de prueba ----------
export function AccesoPersona({ f, recargar }: { f: Ficha; recargar: () => void }) {
  const p = f.persona;
  const { pendiente, error, ejecutar } = useAccion();
  const toast = useToast();
  const [contacto, setContacto] = useState({ telefono: p.telefono, whatsapp: p.whatsapp });
  const [email, setEmail] = useState(p.email);
  const [pass, setPass] = useState("");
  const hacer = (fn: () => Promise<unknown>, ok: string) => ejecutar(async () => { await exigirOk(fn()); recargar(); }, ok);
  return (
    <div className="space-y-3 text-sm">
      <Bloque titulo="Contacto">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block"><span className="etiqueta-campo">Teléfono</span><input className="campo" value={contacto.telefono} onChange={(e) => setContacto({ ...contacto, telefono: e.target.value })} /></label>
          <label className="block"><span className="etiqueta-campo">WhatsApp</span><input className="campo" value={contacto.whatsapp} onChange={(e) => setContacto({ ...contacto, whatsapp: e.target.value })} /></label>
        </div>
        <button type="button" className="btn-secundario px-3 py-1.5 text-xs" disabled={pendiente} onClick={() => hacer(() => guardarContactoPersona(p.id, contacto), "Contacto guardado")}>Guardar contacto</button>
      </Bloque>
      <Bloque titulo="Entrar en la app">
        {(f.soyCeo || f.soyYo) && (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block min-w-56 flex-1"><span className="etiqueta-campo">Email de acceso</span><input className="campo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <button type="button" className="btn-secundario" disabled={pendiente || email.trim().toLowerCase() === p.email} onClick={() => void confirmar(`¿Cambiar el email de acceso de ${p.nombre} a ${email}? Desde ahora entrará con este.`).then((ok) => ok && hacer(() => cambiarEmailPersona(p.id, email), "Email cambiado"))}>Cambiar email</button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block min-w-56 flex-1"><span className="etiqueta-campo">Nueva contraseña</span><input className="campo" type="text" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Mínimo 8 caracteres" /></label>
              <button type="button" className="btn-secundario" disabled={pendiente || pass.length < 8} onClick={() => ejecutar(async () => { await exigirOk(cambiarPassword(p.id, pass)); setPass(""); }, "Contraseña cambiada")}>Cambiar contraseña</button>
            </div>
          </>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secundario" disabled={pendiente} onClick={() => ejecutar(() => enviarEnlaceMagico(p.id), `Enlace enviado a ${p.email}`)}>Enviar enlace mágico</button>
          <span className="text-xs text-texto-3">Le llega un email para entrar sin contraseña (dura 24 horas).</span>
        </div>
        {!p.onboarding_completo && <p className="text-xs text-aviso">Aún no ha hecho el onboarding.</p>}
      </Bloque>
      <Bloque titulo="Rol y estado">
        {f.soyYo ? (
          <p className="text-xs text-texto-3">Tu rol y tu acceso te los cambia otra persona (el CEO).</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {f.soyCeo ? (
              <Pastillas className="campo w-auto py-1" value={p.rol} disabled={pendiente} aria-label="Rol" onChange={(e) => hacer(() => actualizarMiembro(p.id, { rol: e.target.value as Rol }), "Rol cambiado")}>
                {(Object.keys(ROL_TXT) as Rol[]).map((r) => <option key={r} value={r}>{ROL_TXT[r]}</option>)}
              </Pastillas>
            ) : (
              <span className="text-texto-2">{ROL_TXT[p.rol]}{p.activo ? "" : " · desactivado"} <span className="text-xs text-texto-3">(el rol y desactivar, solo el CEO)</span></span>
            )}
            {f.soyCeo && p.rol === "director" && (
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" className="interruptor" checked={p.admin_activo} disabled={pendiente} onChange={(e) => hacer(() => actualizarMiembro(p.id, { admin_activo: e.target.checked }), e.target.checked ? "Con Administración" : "Sin Administración")} /> Administración</label>
            )}
            {f.soyCeo && <button type="button" className="btn-secundario px-2 py-1 text-xs" disabled={pendiente} onClick={() => hacer(() => actualizarMiembro(p.id, { activo: !p.activo }), p.activo ? "Desactivado" : "Activado")}>{p.activo ? "Desactivar" : "Activar"}</button>}
            <button
              type="button"
              className="btn-secundario px-2 py-1 text-xs hover:text-mal"
              disabled={pendiente}
              onClick={() =>
                void confirmar("¿Quitar a esta persona de este proyecto? Su usuario y sus datos se mantienen; sus leads de este proyecto quedarán sin asignar.").then((ok) => ok && ejecutar(async () => {
                  const r = (await exigirOk(quitarDelProyecto(p.id))) as { sinAsignar: number };
                  toast(r.sinAsignar ? `Quitado del proyecto. ${r.sinAsignar} leads suyos han quedado sin asignar: repártelos desde el CRM.` : "Quitado del proyecto.");
                }))
              }
            >
              Quitar del proyecto
            </button>
          </div>
        )}
        {p.rol === "caller" && (
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="interruptor mt-0.5" checked={p.tambien_closer} disabled={pendiente} onChange={(e) => hacer(() => guardarTambienCloser(p.id, e.target.checked), e.target.checked ? "Ahora también es closer" : "Ya no es closer")} />
            <span><b>También closer</b> · sigue de caller y además ve y cuenta sus citas como closer.</span>
          </label>
        )}
        {f.soyCeo && !f.soyYo && (
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="interruptor mt-0.5" checked={p.es_prueba} disabled={pendiente} onChange={(e) => hacer(() => marcarPrueba(p.id, e.target.checked), e.target.checked ? "Marcado como perfil de prueba" : "Ya no es perfil de prueba")} />
            <span><b>Perfil de prueba</b> · no cuenta en cifras, reparto ni liquidaciones, y no sale en Equipo (solo el CEO lo cambia).</span>
          </label>
        )}
      </Bloque>
      {error && <p className="text-xs text-mal">{error}</p>}
    </div>
  );
}

// ---------- Permisos de cada pipeline del CRM, solo para esta persona ----------
export function PipelinesPersona({ f, recargar }: { f: Ficha; recargar: () => void }) {
  const { pendiente, error, ejecutar } = useAccion();
  if (f.persona.rol === "ceo") return <p className="text-xs text-texto-3">El CEO puede con todos los pipelines.</p>;
  return (
    <div className="space-y-1">
      <p className="text-xs text-texto-3">Editar = también sus columnas · Ver = mueve sus tarjetas · Sin acceso = no lo ve. Un director con Administración, siempre Editar.</p>
      {f.pipelines.map((pi) => (
        <div key={pi.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-panel-2">
          <div className="min-w-0 text-sm font-medium">{pi.nombre} <span className="text-xs font-normal text-texto-3">· ahora: {NIVEL_TXT[pi.efectivo]}</span></div>
          <Pastillas
            className="campo w-auto py-1 text-xs"
            aria-label={`${pi.nombre} para ${f.persona.nombre}`}
            value={pi.propio ?? ""}
            disabled={pendiente}
            onChange={(e) => ejecutar(async () => { await exigirOk(guardarPermisoPipeline(pi.id, { perfilId: f.persona.id }, e.target.value || null)); recargar(); }, `${pi.nombre}: guardado`)}
          >
            <option value="">Como su rol ({NIVEL_TXT[pi.delRol]})</option>
            <option value="editar">Editar</option>
            <option value="ver">Ver</option>
            <option value="sin_acceso">Sin acceso</option>
          </Pastillas>
        </div>
      ))}
      {error && <p className="text-xs text-mal">{error}</p>}
    </div>
  );
}

// ---------- Reparto (callers): su %, que se cambia en «Proyecto y reparto» (allí se ve la suma de 100) ----------
// La rotación de closers se quitó el 11 oct (4.4): el closer de las citas por link lo pone GHL.
export function PctPersona({ f }: { f: Ficha }) {
  const pct = f.reparto.pct;
  const encendido = f.reparto.auto && pct > 0;
  return (
    <p className="text-sm">
      Reparto automático de leads: <b>{pct} %</b>
      <span className="text-texto-3"> · {encendido ? "le llegan" : !f.reparto.auto ? "el reparto está apagado" : "no le llegan"}</span>{" "}
      <Link href="/admin?tab=proyecto" className="text-xs text-primario hover:underline">Cambiar en Proyecto y reparto →</Link>
    </p>
  );
}

// ---------- Cuentas de Fathom del closer ----------
export function FathomPersona({ f, recargar }: { f: Ficha; recargar: () => void }) {
  const [nueva, setNueva] = useState({ nombre: "", apiKey: "" });
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <div className="space-y-2 text-sm">
      {f.fathom.length === 0 && <p className="text-xs text-texto-3">Sin cuentas de Fathom.</p>}
      {f.fathom.map((c) => (
        <div key={c.id} className="flex items-center justify-between rounded-lg bg-panel-2 px-3 py-1.5">
          <span>{c.nombre}</span>
          <button type="button" className="rounded p-1 text-texto-3 hover:text-mal" aria-label={`Quitar la cuenta ${c.nombre}`} disabled={pendiente} onClick={() => void confirmar(`¿Quitar la cuenta de Fathom «${c.nombre}»?`).then((ok) => ok && ejecutar(async () => { await exigirOk(borrarCuentaFathom(c.id)); recargar(); }, "Cuenta quitada"))}><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-40 flex-1"><span className="etiqueta-campo">Nombre de la cuenta</span><input className="campo" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} /></label>
        <label className="block min-w-40 flex-1"><span className="etiqueta-campo">API key de Fathom</span><input className="campo" type="password" autoComplete="off" value={nueva.apiKey} onChange={(e) => setNueva({ ...nueva, apiKey: e.target.value })} /></label>
        <button type="button" className="btn-secundario" disabled={pendiente || !nueva.nombre || !nueva.apiKey} onClick={() => ejecutar(async () => { await exigirOk(guardarCuentaFathom(null, { nombre: nueva.nombre, apiKey: nueva.apiKey, formato: "", perfilId: f.persona.id })); setNueva({ nombre: "", apiKey: "" }); recargar(); }, "Cuenta de Fathom añadida")}>Añadir</button>
      </div>
      {error && <p className="text-xs text-mal">{error}</p>}
    </div>
  );
}
