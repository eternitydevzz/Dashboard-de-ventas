"use client";

import { useState } from "react";
import { Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useAccion } from "@/components/acciones-lead";
import { confirmar } from "@/components/dialogos";
import { Modal } from "@/components/modal";
import { ETIQUETA_ROL } from "@/lib/formato";
import { FRECUENCIAS, type DatosPopup, type Popup } from "@/lib/popups";
import { TEXTOS_ENTRADA, textosCambiados, type ClaveTexto } from "@/lib/mensajes-entrada";
import type { Rol } from "@/lib/tipos";
import { borrarPopup, cambiarActivoPopup, guardarAjustesRanking, guardarPopup, guardarTextoEntrada, lanzarPopup } from "./acciones";

// Fase 3 (Cristian, 13 nov 2026): Administración → Popups. Popups al equipo (mismo popup de la bienvenida), los textos
// de la bienvenida y del reporte del CEO, y los 2 interruptores del ranking.
type Persona = { id: string; nombre: string; rol: Rol };
const ROLES: Rol[] = ["caller", "closer", "director", "ceo"];
const MERCADOS = [{ v: "es", t: "España" }, { v: "latam", t: "Latam" }] as const;
const VACIO: DatosPopup = { titulo: "", texto: "", imagen: null, boton_texto: null, boton_enlace: null, roles: [], personas: [], mercados: [], frecuencia: "sesion", cada_horas: null };

function aQuien(p: DatosPopup, personas: Persona[]) {
  const grupo = p.roles.length === ROLES.length ? "Todos" : p.roles.map((r) => ETIQUETA_ROL[r]).join(", ");
  const mercado = p.mercados.length === 1 ? ` de ${MERCADOS.find((m) => m.v === p.mercados[0])?.t}` : "";
  const nombres = p.personas.map((id) => personas.find((x) => x.id === id)?.nombre ?? "—");
  return [grupo && `${grupo}${mercado}`, ...nombres].filter(Boolean).join(" · ");
}
const cuando = (p: DatosPopup) => (p.frecuencia === "horas" ? `1 vez cada ${p.cada_horas} h` : FRECUENCIAS.find((f) => f.v === p.frecuencia)?.t);
const alterna = <T,>(lista: T[], x: T) => (lista.includes(x) ? lista.filter((y) => y !== x) : [...lista, x]);

export function Popups({ popups, personas, textos, ranking }: { popups: Popup[]; personas: Persona[]; textos: unknown; ranking: { mostrarBajas: boolean; closersParaCallers: boolean } }) {
  const [editando, setEditando] = useState<{ id: string | null; datos: DatosPopup } | null>(null);
  const [texto, setTexto] = useState<{ clave: ClaveTexto; titulo: string; texto: string } | null>(null);
  const { pendiente, error, ejecutar } = useAccion();
  const cambiados = textosCambiados(textos);

  return (
    <div className="space-y-5">
      <section className="tarjeta p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Popups al equipo</h2>
          <button type="button" className="btn-primario inline-flex items-center gap-1.5" onClick={() => setEditando({ id: null, datos: VACIO })}><Plus className="h-4 w-4" />Nuevo popup</button>
        </div>
        <p className="mb-3 text-sm text-texto-2">Salen en la ventana de la bienvenida. «Lanzar ahora» le sale una vez a cada uno: al momento si tiene la app abierta (como mucho en 1 minuto) o al entrar.</p>
        {!popups.length && <p className="text-sm text-texto-3">Aún no hay popups.</p>}
        <ul className="space-y-2">
          {popups.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-borde bg-panel-2 px-3 py-2 text-sm">
              <input type="checkbox" className="interruptor" checked={p.activo} disabled={pendiente} aria-label={`${p.activo ? "Desactivar" : "Activar"} «${p.titulo}»`} onChange={(e) => ejecutar(() => cambiarActivoPopup(p.id, e.target.checked), e.target.checked ? "Popup activado" : "Popup desactivado")} />
              <div className="min-w-0 flex-1">
                <div className={`truncate font-medium ${p.activo ? "" : "text-texto-3"}`}>{p.titulo}</div>
                <div className="truncate text-xs text-texto-3">{aQuien(p, personas)} · {cuando(p)}</div>
              </div>
              {p.frecuencia === "ahora" && (
                <button type="button" className="btn-secundario inline-flex items-center gap-1 px-2 py-1 text-xs" disabled={pendiente} onClick={async () => (await confirmar(`¿Lanzar otra vez «${p.titulo}»? Les vuelve a salir a todos, también a quien ya lo vio.`, { boton: "Lanzar" })) && ejecutar(() => lanzarPopup(p.id), "Popup lanzado")}><Send className="h-3.5 w-3.5" />Lanzar otra vez</button>
              )}
              <button type="button" className="rounded-md p-1.5 text-texto-3 hover:bg-panel" aria-label={`Editar «${p.titulo}»`} onClick={() => setEditando({ id: p.id, datos: p })}><Pencil className="h-4 w-4" /></button>
              <button type="button" className="rounded-md p-1.5 text-texto-3 hover:bg-panel hover:text-mal" aria-label={`Borrar «${p.titulo}»`} disabled={pendiente} onClick={async () => (await confirmar(`¿Borrar el popup «${p.titulo}»? No se puede deshacer.`, { boton: "Borrar" })) && ejecutar(() => borrarPopup(p.id), "Popup borrado")}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
        {error && <p className="mt-2 text-xs text-mal">{error}</p>}
      </section>

      <section className="tarjeta p-5">
        <h2 className="mb-1 text-lg font-semibold">Mensajes de la bienvenida y reporte del CEO</h2>
        <p className="mb-3 text-sm text-texto-2">Los que ya existían. Salen solos cuando se cumple su condición. Puedes usar {"{nombre}"} (y en el reporte, {"{dia}"}, {"{leads}"} y {"{agendas}"}).</p>
        <ul className="space-y-2">
          {(Object.keys(TEXTOS_ENTRADA) as ClaveTexto[]).map((k) => {
            const t = cambiados[k] ?? TEXTOS_ENTRADA[k];
            return (
              <li key={k} className="flex items-center gap-3 rounded-lg border border-borde bg-panel-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{t.titulo}{cambiados[k] && <span className="ml-2 text-xs text-primario">cambiado</span>}</div>
                  <div className="truncate text-xs text-texto-3">{TEXTOS_ENTRADA[k].cuando} · {t.texto}</div>
                </div>
                <button type="button" className="rounded-md p-1.5 text-texto-3 hover:bg-panel" aria-label={`Editar «${t.titulo}»`} onClick={() => setTexto({ clave: k, titulo: t.titulo, texto: t.texto })}><Pencil className="h-4 w-4" /></button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="tarjeta p-5">
        <h2 className="mb-3 text-lg font-semibold">Ranking</h2>
        <div className="space-y-2">
          <label className="flex items-start gap-2 rounded-lg border border-borde bg-panel-2 p-3 text-sm">
            <input type="checkbox" className="interruptor mt-0.5" checked={ranking.mostrarBajas} disabled={pendiente} onChange={(e) => ejecutar(() => guardarAjustesRanking({ ...ranking, mostrarBajas: e.target.checked }), "Guardado")} />
            <span><b>Enseñar a los de baja en el ranking</b><br /><span className="text-texto-3">Apagado: no salen (sus cifras siguen contando en KPIs y comisiones).</span></span>
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-borde bg-panel-2 p-3 text-sm">
            <input type="checkbox" className="interruptor mt-0.5" checked={ranking.closersParaCallers} disabled={pendiente} onChange={(e) => ejecutar(() => guardarAjustesRanking({ ...ranking, closersParaCallers: e.target.checked }), "Guardado")} />
            <span><b>Los callers ven el ranking de closers</b><br /><span className="text-texto-3">Apagado: cada caller ve solo el de callers.</span></span>
          </label>
        </div>
      </section>

      {editando && <FormPopup inicial={editando} personas={personas} onCerrar={() => setEditando(null)} />}
      {texto && <FormTexto inicial={texto} cambiado={!!cambiados[texto.clave]} onCerrar={() => setTexto(null)} />}
    </div>
  );
}

function FormPopup({ inicial, personas, onCerrar }: { inicial: { id: string | null; datos: DatosPopup }; personas: Persona[]; onCerrar: () => void }) {
  const [d, setD] = useState(inicial.datos);
  const { pendiente, error, ejecutar } = useAccion();
  const pon = (c: Partial<DatosPopup>) => setD({ ...d, ...c });
  const todos = d.roles.length === ROLES.length;
  const guardar = () => ejecutar(async () => {
    const r = await guardarPopup(inicial.id, d);
    if (!r) onCerrar(); // sin error: se cierra (con error, useAccion lo enseña)
    return r;
  }, inicial.id ? "Popup guardado" : "Popup creado");

  return (
    <Modal titulo={inicial.id ? "Editar popup" : "Nuevo popup"} onCerrar={onCerrar} ancho="max-w-xl">
      <div className="space-y-3 text-sm">
        <label className="block">Título<input className="campo mt-1 w-full" maxLength={120} value={d.titulo} onChange={(e) => pon({ titulo: e.target.value })} /></label>
        <label className="block">Texto<textarea className="campo mt-1 w-full" rows={4} maxLength={2000} value={d.texto} onChange={(e) => pon({ texto: e.target.value })} /></label>
        <label className="block">Imagen (opcional, enlace https)<input className="campo mt-1 w-full" placeholder="https://…" value={d.imagen ?? ""} onChange={(e) => pon({ imagen: e.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">Botón (opcional)<input className="campo mt-1 w-full" maxLength={40} placeholder="Ver más" value={d.boton_texto ?? ""} onChange={(e) => pon({ boton_texto: e.target.value })} /></label>
          <label className="block">Enlace del botón<input className="campo mt-1 w-full" placeholder="https://… o /crm" value={d.boton_enlace ?? ""} onChange={(e) => pon({ boton_enlace: e.target.value })} /></label>
        </div>

        <fieldset className="rounded-lg border border-borde p-3">
          <legend className="px-1 font-medium">A quién</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={todos} onChange={() => pon({ roles: todos ? [] : ROLES })} />Todos</label>
            {ROLES.map((r) => (
              <label key={r} className="flex items-center gap-1.5"><input type="checkbox" checked={d.roles.includes(r)} onChange={() => pon({ roles: alterna(d.roles, r) })} />{ETIQUETA_ROL[r]}</label>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {MERCADOS.map((m) => (
              <label key={m.v} className="flex items-center gap-1.5"><input type="checkbox" checked={d.mercados.includes(m.v)} onChange={() => pon({ mercados: alterna(d.mercados, m.v) })} />{m.t}</label>
            ))}
            <span className="text-xs text-texto-3">(ninguno = los 2)</span>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-texto-2">Personas sueltas ({d.personas.length})</summary>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {personas.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5"><input type="checkbox" checked={d.personas.includes(p.id)} onChange={() => pon({ personas: alterna(d.personas, p.id) })} />{p.nombre}<span className="text-xs text-texto-3">{ETIQUETA_ROL[p.rol]}</span></label>
              ))}
            </div>
          </details>
        </fieldset>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block">Cuándo
            <select className="campo mt-1 block" value={d.frecuencia} onChange={(e) => pon({ frecuencia: e.target.value as DatosPopup["frecuencia"], cada_horas: e.target.value === "horas" ? d.cada_horas ?? 24 : null })}>
              {FRECUENCIAS.map((f) => <option key={f.v} value={f.v}>{f.t}</option>)}
            </select>
          </label>
          {d.frecuencia === "horas" && <label className="block">Horas<input type="number" min={1} max={720} className="campo mt-1 block w-24" value={d.cada_horas ?? ""} onChange={(e) => pon({ cada_horas: Number(e.target.value) })} /></label>}
        </div>

        {error && <p className="text-xs text-mal">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn-primario" disabled={pendiente} onClick={guardar}>{d.frecuencia === "ahora" && !inicial.id ? "Crear y lanzar" : "Guardar"}</button>
        </div>
      </div>
    </Modal>
  );
}

function FormTexto({ inicial, cambiado, onCerrar }: { inicial: { clave: ClaveTexto; titulo: string; texto: string }; cambiado: boolean; onCerrar: () => void }) {
  const [t, setT] = useState(inicial);
  const { pendiente, error, ejecutar } = useAccion();
  const guardar = (valor: { titulo: string; texto: string } | null) => ejecutar(async () => {
    const r = await guardarTextoEntrada(t.clave, valor);
    if (!r) onCerrar();
    return r;
  }, valor ? "Texto guardado" : "Vuelve el texto de siempre");

  return (
    <Modal titulo="Editar mensaje" onCerrar={onCerrar} ancho="max-w-xl">
      <div className="space-y-3 text-sm">
        <p className="text-texto-3">{TEXTOS_ENTRADA[t.clave].cuando}</p>
        <label className="block">Título<input className="campo mt-1 w-full" maxLength={120} value={t.titulo} onChange={(e) => setT({ ...t, titulo: e.target.value })} /></label>
        <label className="block">Texto<textarea className="campo mt-1 w-full" rows={4} maxLength={1000} value={t.texto} onChange={(e) => setT({ ...t, texto: e.target.value })} /></label>
        {error && <p className="text-xs text-mal">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {cambiado && <button type="button" className="btn-secundario mr-auto" disabled={pendiente} onClick={() => guardar(null)}>Volver al texto de siempre</button>}
          <button type="button" className="btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn-primario" disabled={pendiente} onClick={() => guardar({ titulo: t.titulo, texto: t.texto })}>Guardar</button>
        </div>
      </div>
    </Modal>
  );
}
