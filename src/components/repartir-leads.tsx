"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Shuffle } from "lucide-react";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toasts";
import { exigirOk } from "@/lib/resultado-cliente";
import { MODOS_REPARTO, type ModoReparto } from "@/lib/reparto";
import { OFERTAS } from "@/lib/oferta";
import { previsualizarReparto, repartirLeads, type PeticionReparto } from "@/app/(panel)/crm/reparto";
import { Desplegable, Pastillas } from "@/components/eleccion";
import { SIN_PAIS, nombrePais } from "@/lib/formato";

type Persona = { id: string; nombre: string };
type Vista = { porPais: Record<string, number>; conCaller: number; disponibles: number; total: number; porCaller: { id: string; nombre: string; n: number; carga: number | null }[] };

// Bloque A (Cristian, 11 oct 2026): «Repartir leads» a mano entre callers, con vista previa. En la Biblioteca y en el CRM.
export function RepartirLeads({
  callers,
  fijo,
  ofertaInicial,
  paisesIniciales,
  seleccion,
  etiqueta = "Repartir leads", // vacía = solo el icono (CRM, Cristian 13 oct)
}: {
  callers: Persona[];
  fijo?: Partial<PeticionReparto>; // filtros que vienen de la pantalla (p. ej. pipeline del CRM, solo Biblioteca)
  ofertaInicial?: string | null;
  paisesIniciales?: string[]; // 1b: el filtro de país que tenga la pantalla al abrir (CRM)
  seleccion?: string[]; // Cristian (28 oct): los leads marcados en el CRM; si hay, se reparten esos, tengan o no caller
  etiqueta?: string;
}) {
  const haySeleccion = !!seleccion?.length;
  const [abierto, setAbierto] = useState(false);
  const [origen, setOrigen] = useState<"sin_asignar" | "reasignar">("sin_asignar");
  const [deCallers, setDeCallers] = useState<string[]>([]);
  const [oferta, setOferta] = useState(ofertaInicial ?? "");
  const [paises, setPaises] = useState<string[]>(paisesIniciales ?? []);
  const [elegidos, setElegidos] = useState<string[]>(callers.map((c) => c.id));
  const [modo, setModo] = useState<ModoReparto>("equitativo");
  const [numero, setNumero] = useState("20");
  const [vista, setVista] = useState<Vista | null>(null);
  // Los últimos recuentos por país: la lista no desaparece mientras se recalcula la vista previa
  const [ultimosPaises, setUltimosPaises] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  const toast = useToast();

  const peticion = (): PeticionReparto => ({
    ...(haySeleccion ? { leadIds: seleccion } : fijo),
    origen: haySeleccion ? "seleccion" : origen,
    deCallers: !haySeleccion && origen === "reasignar" ? deCallers : undefined,
    oferta: oferta || null,
    paises,
    callers: elegidos,
    modo,
    ...(modo === "fijo" ? { porPersona: Number(numero) } : modo === "tope" ? { tope: Number(numero) } : { n: Number(numero) }),
  });
  const cambiar = <T,>(f: (v: T) => void) => (v: T) => {
    f(v);
    setVista(null); // cualquier cambio deja sin vista previa hasta que se recalcula
  };
  // Mejora de la pasada (Cristian, 11 oct): la vista previa sale sola al abrir y se recalcula con cada cambio
  // (sin botón «Ver reparto»). «Repartir» solo se enciende con la vista previa de lo que hay en pantalla.
  const numeroOk = Number.isInteger(Number(numero)) && Number(numero) >= 1;
  const clave = JSON.stringify(peticion());
  const ultima = useRef(0);
  const [calculando, setCalculando] = useState(false);
  useEffect(() => {
    if (!abierto || !numeroOk) return;
    const id = ++ultima.current;
    const t = setTimeout(async () => {
      setCalculando(true);
      setError("");
      try {
        const v = (await exigirOk(previsualizarReparto(JSON.parse(clave) as PeticionReparto))) as Vista;
        if (id === ultima.current) {
          setVista(v); // solo la respuesta de la última petición
          setUltimosPaises(v.porPais);
        }
      } catch (e) {
        if (id === ultima.current) setError(e instanceof Error ? e.message : "Algo falló.");
      } finally {
        if (id === ultima.current) setCalculando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [abierto, clave, numeroOk]);
  const repartir = () => {
    setError("");
    iniciar(async () => {
      try {
        const r = (await exigirOk(repartirLeads(peticion()))) as { repartidos: number };
        toast(`${r.repartidos} leads repartidos`);
        setAbierto(false);
        setVista(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Algo falló.");
      }
    });
  };
  // Los países con leads disponibles (más primero; «Sin país» al final) y los elegidos aunque ya no tengan ninguno
  const opcionesPais = Object.entries({ ...Object.fromEntries(paises.map((p) => [p, 0])), ...(ultimosPaises ?? {}) }).sort((a, b) =>
    a[0] === SIN_PAIS ? 1 : b[0] === SIN_PAIS ? -1 : b[1] - a[1] || nombrePais(a[0]).localeCompare(nombrePais(b[0]))
  );
  const alternar = (lista: string[], id: string) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  const textoNumero = modo === "fijo" ? "¿Cuántos a cada caller?" : modo === "tope" ? "Tope de leads sin trabajar por caller" : "¿Cuántos leads en total?";

  return (
    <>
      <button
        className={`btn-primario ${etiqueta ? "" : "px-2.5"}`}
        title={haySeleccion ? `Repartir los ${seleccion!.length} seleccionados` : "Repartir leads"}
        aria-label="Repartir leads"
        onClick={() => {
          // Al abrir, el filtro de oferta que tenga la pantalla en ese momento (p. ej. el chip «VIP» de la Biblioteca)
          setOferta(ofertaInicial ?? "");
          // Con selección, todos los marcados (sin filtro de país y el número = cuántos hay)
          setPaises(haySeleccion ? [] : paisesIniciales ?? []);
          if (haySeleccion) setNumero(String(seleccion!.length));
          setUltimosPaises(null);
          setVista(null);
          setAbierto(true);
        }}
      >
        <Shuffle className="h-4 w-4" />
        {etiqueta}
      </button>
      {abierto && (
        <Modal titulo="Repartir leads" onCerrar={() => setAbierto(false)} ancho="max-w-xl">
          {/* Cristian (28 oct): compacta y nunca más alta que la pantalla; se mueve con scroll y «Repartir» queda siempre abajo */}
          <div className="flex max-h-[calc(100dvh-9rem)] flex-col text-xs">
          <div className="-mr-2 space-y-3 overflow-y-auto pr-2">
            {haySeleccion ? (
              <p className="rounded-lg bg-primario-suave px-3 py-2 text-primario">
                Los <b>{seleccion!.length} seleccionados</b>
                {vista && vista.conCaller > 0 ? `: ${vista.conCaller} ya tienen caller y se les cambia.` : "."}
              </p>
            ) : (
            <div className="flex flex-wrap gap-1.5">
              {[
                { v: "sin_asignar", t: "Los que no tienen caller" },
                { v: "reasignar", t: "Reasignar los de unos callers" },
              ].map((o) => (
                <button key={o.v} type="button" onClick={() => cambiar(setOrigen)(o.v as typeof origen)} className={`rounded-full px-3 py-1 ${origen === o.v ? "bg-primario text-white" : "bg-panel-2 text-texto-2"}`}>{o.t}</button>
              ))}
            </div>
            )}
            {!haySeleccion && origen === "reasignar" && (
              <div>
                <div className="etiqueta-campo">Quitar a</div>
                <div className="flex flex-wrap gap-1.5">
                  {callers.map((c) => (
                    <label key={c.id} className="flex items-center gap-1.5 rounded-lg bg-panel-2 px-2 py-0.5"><input type="checkbox" checked={deCallers.includes(c.id)} onChange={() => cambiar(setDeCallers)(alternar(deCallers, c.id))} />{c.nombre}</label>
                  ))}
                </div>
              </div>
            )}
            <label className="block">
              <span className="etiqueta-campo">Oferta (de la Biblioteca)</span>
              <Desplegable className="campo py-1.5 text-xs" value={oferta} onChange={(e) => cambiar(setOferta)(e.target.value)}>
                <option value="">Todas</option>
                {OFERTAS.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
              </Desplegable>
            </label>
            {/* 1b (Cristian, 26 oct): países (por el teléfono), con cuántos hay de cada uno con los demás filtros; ninguno = todos */}
            <div>
              <div className="etiqueta-campo">País {paises.length ? `(${paises.length} elegido${paises.length > 1 ? "s" : ""})` : "(todos)"}</div>
              {opcionesPais.length ? (
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                  {opcionesPais.map(([p, n]) => (
                    <label key={p} className="flex items-center gap-1.5 rounded-lg bg-panel-2 px-2 py-0.5"><input type="checkbox" checked={paises.includes(p)} onChange={() => cambiar(setPaises)(alternar(paises, p))} />{nombrePais(p)} <span className="text-xs text-texto-3 tabular-nums">{n}</span></label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-texto-3">{ultimosPaises ? "No hay leads con estos filtros." : "Calculando…"}</p>
              )}
            </div>
            <div>
              <div className="etiqueta-campo">Entre estos callers</div>
              <div className="flex flex-wrap gap-1.5">
                {callers.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 rounded-lg bg-panel-2 px-2 py-0.5"><input type="checkbox" checked={elegidos.includes(c.id)} onChange={() => cambiar(setElegidos)(alternar(elegidos, c.id))} />{c.nombre}</label>
                ))}
                {callers.length === 0 && <span className="text-texto-3">No hay callers en este proyecto.</span>}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="etiqueta-campo">Cómo</span>
                <Pastillas className="campo text-xs" value={modo} onChange={(e) => cambiar(setModo)(e.target.value as ModoReparto)}>
                  {MODOS_REPARTO.map((m) => <option key={m.v} value={m.v}>{m.t}</option>)}
                </Pastillas>
              </label>
              <label className="block">
                <span className="etiqueta-campo">{textoNumero}</span>
                <input className="campo py-1.5 text-xs" type="number" min={1} value={numero} onChange={(e) => cambiar(setNumero)(e.target.value)} />
              </label>
            </div>
            <p className="text-xs text-texto-3">{MODOS_REPARTO.find((m) => m.v === modo)?.d}. Se reparten primero los más nuevos.</p>
            {!numeroOk && <p className="rounded-lg bg-aviso-suave px-3 py-2 text-aviso">Pon un número de 1 o más.</p>}
            {numeroOk && !vista && !error && <p className="text-xs text-texto-3">Calculando el reparto…</p>}
            {vista && (
              <div className="rounded-lg border border-borde p-2.5">
                <div className="mb-2 font-medium">Se repartirán {vista.total} de {vista.disponibles} disponibles</div>
                <ul className="space-y-1">
                  {vista.porCaller.map((c) => (
                    <li key={c.id} className="flex justify-between"><span>{c.nombre}{c.carga !== null ? <span className="text-xs text-texto-3"> · ya tiene {c.carga} sin trabajar</span> : null}</span><b className="tabular-nums">{c.n}</b></li>
                  ))}
                </ul>
              </div>
            )}
            {numeroOk && error && <p className="rounded-lg bg-mal-suave px-3 py-2 text-mal">{error}</p>}
          </div>
          <div className="mt-3 border-t border-borde pt-3">
            <button className="btn-primario w-full" disabled={pendiente || calculando || !vista || !vista.total} onClick={repartir}>
              {pendiente ? "Repartiendo…" : vista && !vista.total ? "No hay leads que repartir con esos filtros" : `Repartir ${vista ? vista.total : ""}`}
            </button>
          </div>
          </div>
        </Modal>
      )}
    </>
  );
}
