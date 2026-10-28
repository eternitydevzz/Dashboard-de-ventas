"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useMemo, useState, useTransition, type FormEvent } from "react";
import { subirDelFormulario } from "@/lib/subir-cliente";
import {
  Plus,
  Upload,
  LayoutGrid,
  List,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  ArrowLeft,
  ArrowRight,
  KeyRound,
  CheckSquare,
} from "lucide-react";
import {
  borrarEtapa,
  crearEtapa,
  crearLeadManual,
  crearPipeline,
  editarEtapa,
  importarCsv,
  prepararSubidaCsv,
  moverEtapa,
  moverLead,
  ordenarEtapas,
  ordenarPipelines,
  marcarColumnaCitasGhl,
  renombrarPipeline,
  unirEstado,
  guardarPermisoPipeline,
} from "./acciones";
import { registrarLlamada, volverANuevo } from "@/app/(panel)/leads/acciones";
import { VentanaEstado, type DestinoConVentana } from "./ventanas-estado";
import { CLAVES_CLOSER } from "@/lib/llamadas";
import { TableroClosers, type ColumnaC } from "@/app/(panel)/closer/llamadas/tablero-closers";
import { ETIQUETA_ESTADO_CALLER, SIN_PAIS, nombrePais } from "@/lib/formato";
import { OfertaChip } from "@/components/oferta-chip";
import { RepartirLeads } from "@/components/repartir-leads";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toasts";
import { exigirOk } from "@/lib/resultado-cliente";
import Papa from "papaparse";
import { CAMPOS, proponerCampo, type Campo } from "@/lib/csv";
import type { Etapa, EstadoCaller, Pipeline, Producto, TipoPipeline } from "@/lib/tipos";
import { confirmar, pedirTexto } from "@/components/dialogos";
import { Desplegable, Pastillas } from "@/components/eleccion";
import { ARRASTRE_COLUMNA, reordenar } from "@/lib/orden";
import { BarraMasiva, type DestinoMasivo } from "./barra-masiva";
import { TarjetaCrm, haceDias } from "@/components/tarjeta-crm";
import { SelectorPipeline } from "./selector-pipeline";
import { CANALES, PIPELINE_GENERAL, PREFIJO_ETIQUETA, SIN_CANAL, etiquetaCanal } from "@/lib/canal";

export type LeadTarjeta = {
  id: string;
  nombre: string;
  apellido: string;
  email: string | null;
  telefono: string | null;
  pais: string | null; // 1b: código del país («ES») o «Sin país»; null = sin calcular (se enseña «Sin país»)
  etapa_id: string | null;
  caller_id: string | null;
  closer_id: string | null;
  estado_caller: string;
  creado_en: string;
  etiquetas: string[];
  invertir: string | null; // la respuesta de «¿puedes invertir?» (13 oct: la card ya no recibe todas las respuestas)
  oferta?: string | null; // bloque A
  otroPipeline?: boolean; // Fase 4: tarjeta en un pipeline que no es el suyo principal
};

type Persona = { id: string; nombre: string };
type FilaPermiso = { pipeline_id: string; rol: string | null; perfil_id: string | null; nivel: string };
// Uniones de una columna según el pipeline (Paso 0): «Callers», estados del lead; «Closers», Pre-call y Post-call
const UNIONES: Record<TipoPipeline, { v: string; t: string }[]> = {
  // Fase 7: soltar en la columna unida a «Vendido» abre «Registrar venta» (si se cancela, la tarjeta vuelve)
  normal: [{ v: "vendido", t: "Vendido: abre «Registrar venta»" }],
  callers: (Object.keys(ETIQUETA_ESTADO_CALLER) as EstadoCaller[]).map((k) => ({ v: k, t: ETIQUETA_ESTADO_CALLER[k] })),
  closers: CLAVES_CLOSER.map((c) => ({ v: c.v, t: c.t })),
};
const COLORES = ["#64748b", "#2f55d4", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#16a34a", "#dc2626"];
const POR_COLUMNA = 40;

export function TableroCrm({
  pipelines: pipelinesServidor,
  pipeline,
  etapas: etapasServidor,
  leads: leadsIniciales,
  callers,
  closers,
  admin,
  citasGhl = null,
  destinos = [],
  ceo = false,
  editar,
  jefe,
  productos,
  moneda,
  estrellasOpcionales,
  tableroClosers,
  permisos,
}: {
  pipelines: Pipeline[];
  pipeline: Pipeline | null;
  etapas: Etapa[];
  leads: LeadTarjeta[];
  conteos?: Record<string, number>; // 13 oct: el selector como GHL ya no enseña el número de cada pipeline
  callers: Persona[];
  closers: Persona[];
  admin: boolean; // crear pipelines y sus permisos (CEO y director con Administración)
  citasGhl?: string | null; // Fase 4: columna donde van los leads con cita de GHL (solo la ve un administrador)
  destinos?: DestinoMasivo[]; // Fase 4: columnas a las que se pueden mover leads en masa
  ceo?: boolean; // borrar en masa, solo el CEO
  editar: boolean; // Paso 0: «Editar» en este pipeline = sus columnas, renombrar y borrar
  jefe: boolean; // importar, crear y asignar leads (director y CEO)
  productos: Producto[];
  moneda: string;
  estrellasOpcionales: boolean;
  tableroClosers: { columnas: ColumnaC[]; sinColumna: number; soloMirar: boolean } | null;
  permisos: { filas: FilaPermiso[]; gente: { id: string; nombre: string; rol: string }[] } | null;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [vista, setVista] = useState<"tablero" | "lista">("tablero");
  const [q, setQ] = useState("");
  const [moviendo, setMoviendo] = useState<Record<string, string>>({}); // optimista: leadId -> etapaId
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  // Velocidad (13 oct 2026): la pestaña pulsada se marca al momento y el tablero se atenúa hasta que llega el nuevo;
  // las pestañas se precargan al pasar el ratón (o tocarlas) por encima
  const [yendo, setYendo] = useState<{ a: string; desde: string | undefined } | null>(null);
  const [precargar, setPrecargar] = useState<Set<string>>(new Set());
  const [sobre, setSobre] = useState<string | null>(null);
  const [verMas, setVerMas] = useState<Record<string, number>>({});
  const [modal, setModal] = useState<null | "importar" | "lead" | "pipeline" | "permisos">(null);
  const [ventana, setVentana] = useState<{ lead: LeadTarjeta; destino: DestinoConVentana; etapaId: string } | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  // Fase 4: columnas y pipelines se ordenan arrastrando; el orden nuevo se ve al momento (optimista)
  const [ordenCols, setOrdenCols] = useState<{ base: Etapa[]; ids: string[] } | null>(null);
  const [ordenPipes, setOrdenPipes] = useState<{ base: Pipeline[]; ids: string[] } | null>(null);
  const [colSobre, setColSobre] = useState<string | null>(null);
  const etapas = useMemo(
    () => (ordenCols && ordenCols.base === etapasServidor ? ordenCols.ids.map((id) => etapasServidor.find((e) => e.id === id)!).filter(Boolean) : etapasServidor),
    [ordenCols, etapasServidor]
  );
  const pipelines = useMemo(
    () => (ordenPipes && ordenPipes.base === pipelinesServidor ? ordenPipes.ids.map((id) => pipelinesServidor.find((p) => p.id === id)!).filter(Boolean) : pipelinesServidor),
    [ordenPipes, pipelinesServidor]
  );

  const nombrePorId = useMemo(() => Object.fromEntries([...callers, ...closers].map((p) => [p.id, p.nombre])), [callers, closers]);

  // Fase 4 (plan GHL): filtro por canal con la etiqueta «Canal: …» que pone la app a cada lead con cita de GHL
  const [canal, setCanal] = useState("");
  // 17 oct (Cristian): en «0. Agendas General» salen siempre todos los canales y «Sin canal»; en el resto, los que hay
  const esGeneral = pipeline?.nombre.trim().toLowerCase() === PIPELINE_GENERAL.toLowerCase();
  const canales = useMemo(
    () => (esGeneral ? CANALES.map(etiquetaCanal) : [...new Set(leadsIniciales.flatMap((l) => l.etiquetas.filter((e) => e.startsWith(PREFIJO_ETIQUETA))))].sort()),
    [leadsIniciales, esGeneral]
  );
  // 1b (Cristian, 26 oct): filtro por país (sacado del teléfono), con cuántos hay de cada uno en este pipeline;
  // «Sin país» al final. Como el de canal, no cambia los números de las pestañas.
  const [pais, setPais] = useState("");
  const paises = useMemo(() => {
    const n = new Map<string, number>();
    for (const l of leadsIniciales) n.set(l.pais ?? SIN_PAIS, (n.get(l.pais ?? SIN_PAIS) ?? 0) + 1);
    return [...n].sort((a, b) => (a[0] === SIN_PAIS ? 1 : b[0] === SIN_PAIS ? -1 : b[1] - a[1] || nombrePais(a[0]).localeCompare(nombrePais(b[0]))));
  }, [leadsIniciales]);
  const leads = useMemo(() => {
    const t = q.trim().toLowerCase();
    return leadsIniciales
      .map((l) => (moviendo[l.id] ? { ...l, etapa_id: moviendo[l.id] } : l))
      .filter((l) => !canal || (canal === SIN_CANAL ? !l.etiquetas.some((e) => e.startsWith(PREFIJO_ETIQUETA)) : l.etiquetas.includes(canal)))
      .filter((l) => !pais || (l.pais ?? SIN_PAIS) === pais)
      .filter(
        (l) =>
          !t ||
          `${l.nombre} ${l.apellido}`.toLowerCase().includes(t) ||
          (l.email ?? "").includes(t) ||
          (l.telefono ?? "").replace(/\s/g, "").includes(t.replace(/\s/g, "")) ||
          nombrePais(l.pais).toLowerCase().includes(t)
      );
  }, [leadsIniciales, moviendo, q, canal, pais]);

  const toast = useToast();
  function ejecutar(fn: () => Promise<unknown>, mensaje?: string) {
    setError("");
    iniciar(async () => {
      try {
        await fn();
        if (mensaje) toast(mensaje);
      } catch (e) {
        const texto = e instanceof Error ? e.message : "Algo falló.";
        setError(texto);
        toast(texto, "error");
      }
    });
  }

  function soltar(etapaId: string, idArrastrado?: string) {
    const id = idArrastrado || arrastrando;
    setArrastrando(null);
    setSobre(null);
    if (!id) return;
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.etapa_id === etapaId) return;
    // Paso H7: una columna unida a un estado = su botón (y su ventana si pide datos)
    const unido = etapas.find((e) => e.id === etapaId)?.estado_caller as EstadoCaller | null | undefined;
    if (unido && unido !== lead.estado_caller) {
      if (unido === "vendido" && !productos.length) {
        toast("El caller no registra ventas: las cierra el closer.", "error");
        return;
      }
      if (unido === "llamar_luego" || unido === "link_enviado" || unido === "agendado" || unido === "no_interesa" || unido === "vendido") {
        setVentana({ lead, destino: unido, etapaId });
        return;
      }
      const nombre = `${lead.nombre} ${lead.apellido}`.trim();
      mover(id, etapaId, () => (unido === "nuevo" ? volverANuevo(id) : registrarLlamada(id, "no_contesta", "")), `${nombre} → ${unido === "nuevo" ? "Nuevo" : "No contesta"}`);
      return;
    }
    mover(id, etapaId, () => moverLead(id, etapaId));
  }

  // Mueve en pantalla al momento y deshace si el servidor falla
  function mover(id: string, etapaId: string, accion: () => Promise<unknown>, mensaje?: string) {
    setMoviendo((m) => ({ ...m, [id]: etapaId }));
    ejecutar(async () => {
      try {
        await exigirOk(accion());
      } catch (e) {
        setMoviendo((m) => {
          const c = { ...m };
          delete c[id];
          return c;
        });
        throw e;
      }
    }, mensaje);
  }

  function soltarColumna(desde: string, hasta: string) {
    setColSobre(null);
    if (!pipeline || !editar || desde === hasta) return;
    const ids = reordenar(etapas.map((e) => e.id), desde, hasta);
    setOrdenCols({ base: etapasServidor, ids });
    ejecutar(async () => {
      try {
        await exigirOk(ordenarEtapas(pipeline.id, ids));
      } catch (e) {
        setOrdenCols(null);
        throw e;
      }
    });
  }

  function soltarPipeline(desde: string, hasta: string) {
    if (!admin || desde === hasta) return;
    const ids = reordenar(pipelines.map((p) => p.id), desde, hasta);
    setOrdenPipes({ base: pipelinesServidor, ids });
    ejecutar(async () => {
      try {
        await exigirOk(ordenarPipelines(ids));
      } catch (e) {
        setOrdenPipes(null);
        throw e;
      }
    });
  }

  function nuevaColumna() {
    if (!pipeline) return;
    void pedirTexto("Nombre de la nueva columna", "", { boton: "Crear columna" }).then((n) => {
      if (n) ejecutar(() => exigirOk(crearEtapa(pipeline.id, n, COLORES[etapas.length % COLORES.length])), `Columna «${n}» creada`);
    });
  }

  const sinColumna = leads.filter((l) => !l.etapa_id || !etapas.some((e) => e.id === l.etapa_id));
  const tipo: TipoPipeline = pipeline?.tipo ?? "normal";
  const deOrigen = tipo === "normal"; // aquí entran los leads (CSV, nuevo lead)
  const menu = (e: Etapa, i: number) => {
    // Seleccionar todos los leads de la columna (también los que aún no se ven por «Ver más»); solo quien puede marcar leads
    const ids = jefe && tipo !== "closers" ? leads.filter((l) => l.etapa_id === e.id).map((l) => l.id) : [];
    const todas = ids.length > 0 && ids.every((id) => seleccion.has(id));
    const seleccionar = ids.length
      ? {
          todas,
          n: ids.length,
          alCambiar: () => {
            const s = new Set(seleccion);
            ids.forEach((id) => (todas ? s.delete(id) : s.add(id)));
            setSeleccion(s);
          },
        }
      : null;
    return editar || seleccionar ? (
      <MenuColumna
        etapa={e}
        edicion={editar}
        seleccionar={seleccionar}
        uniones={UNIONES[tipo]}
        unida={(tipo === "closers" ? e.columna_cita : e.estado_caller) ?? null}
        primera={i === 0}
        ultima={i === etapas.length - 1}
        onEditar={(n, c) => ejecutar(() => exigirOk(editarEtapa(e.id, n, c)))}
        onMover={(d) => ejecutar(() => exigirOk(moverEtapa(e.id, d)))}
        onBorrar={() => {
          void confirmar(`¿Borrar la columna «${e.nombre}»? ${deOrigen ? "Sus leads pasan a la primera columna." : "Sus tarjetas vuelven a la columna de su estado."}`).then((ok) => {
        if (ok) ejecutar(() => exigirOk(borrarEtapa(e.id)));
      });
        }}
        citasGhl={admin && deOrigen ? { marcada: citasGhl === e.id, alCambiar: (si) => ejecutar(() => exigirOk(marcarColumnaCitasGhl(si ? e.id : null)), si ? `Los leads con cita de GHL irán a «${e.nombre}»` : "Los leads con cita de GHL vuelven a ir a «Agendas orgánico → Agendan» (si existe)") } : null}
        onUnir={(estado) => {
          const t = UNIONES[tipo].find((u) => u.v === estado)?.t;
          ejecutar(() => exigirOk(unirEstado(e.id, estado)), estado ? `«${e.nombre}» unida a «${t}»` : `«${e.nombre}» ya no está unida`);
        }}
      />
    ) : null;
  };
  const anadirColumna = editar && pipeline && (
    <button
      onClick={nuevaColumna}
      className="flex h-14 w-60 shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed border-borde-fuerte text-sm text-texto-2 hover:border-primario hover:text-primario"
    >
      <Plus className="h-4 w-4" /> Añadir columna
    </button>
  );

  const cargandoPipeline = !!yendo && yendo.desde === pipeline?.id && yendo.a !== pipeline?.id;
  const marcado = cargandoPipeline ? yendo!.a : pipeline?.id;
  // prefetch={true} = la página entera con sus datos (router.prefetch solo trae una parte en páginas dinámicas)
  const quiereVer = (id: string) => setPrecargar((s) => (s.has(id) ? s : new Set(s).add(id)));
  return (
    <div className="space-y-4">
      {/* Barra de herramientas */}
      <div className="tarjeta flex flex-wrap items-center gap-2 p-2.5">
        {/* Pipeline (13 oct: un desplegable como en GHL, a la izquierda del buscador) */}
        <SelectorPipeline
          pipelines={pipelines}
          actual={pipeline}
          marcado={marcado}
          admin={admin}
          editar={editar}
          precargar={precargar}
          quiereVer={quiereVer}
          alIr={(id) => id !== pipeline?.id && setYendo({ a: id, desde: pipeline?.id })}
          alReordenar={soltarPipeline}
          alNuevo={() => setModal("pipeline")}
          alRenombrar={(p) => {
            void pedirTexto("Nuevo nombre del pipeline", p.nombre).then((n) => {
              if (n) ejecutar(() => exigirOk(renombrarPipeline(p.id, n)), `Pipeline renombrado a «${n}»`);
            });
          }}
        />
        {/* Cristian (13 oct): sin botones de renombrar y borrar pipeline (se renombra con doble clic en el selector) */}
        {admin && permisos && pipeline && (
          <button className="btn-secundario px-2.5" title="Quién ve este pipeline (permisos)" onClick={() => setModal("permisos")}>
            <KeyRound className="h-4 w-4" />
          </button>
        )}
        <div className="relative min-w-32 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-texto-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar lead por nombre, email, teléfono o país…" className="campo pl-9" />
        </div>
        {(canales.length > 0 || canal) && (
          <Desplegable aria-label="Canal" value={canal} onChange={(e) => setCanal(e.target.value)} className="campo w-auto min-w-40" title="Canal de la cita (por el UTM de la página donde reservó)">
            <option value="">Todos los canales</option>
            {canales.map((c) => <option key={c} value={c}>{c.slice(PREFIJO_ETIQUETA.length)}</option>)}
            {esGeneral && <option value={SIN_CANAL}>Sin canal</option>}
          </Desplegable>
        )}
        {tipo !== "closers" && (paises.length > 0 || pais) && (
          <Desplegable aria-label="País" value={pais} onChange={(e) => setPais(e.target.value)} className="campo w-auto min-w-40" title="País del lead (por el código de su teléfono)">
            <option value="">Todos los países</option>
            {paises.map(([p, n]) => <option key={p} value={p}>{`${nombrePais(p)} (${n})`}</option>)}
          </Desplegable>
        )}
        {/* Cristian (28 oct): Tablero/Lista y «Subir CSV» solo con icono, para que la barra quepa en una fila */}
        {jefe && tipo !== "closers" && <div className="flex rounded-lg border border-borde bg-panel-2 p-0.5">
          <button onClick={() => setVista("tablero")} title="Tablero" aria-label="Tablero" className={`flex items-center rounded-md px-2.5 py-1.5 text-sm ${vista === "tablero" ? "bg-panel text-texto shadow-sm" : "text-texto-3"}`}>
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button onClick={() => setVista("lista")} title="Lista" aria-label="Lista" className={`flex items-center rounded-md px-2.5 py-1.5 text-sm ${vista === "lista" ? "bg-panel text-texto shadow-sm" : "text-texto-3"}`}>
            <List className="h-4 w-4" />
          </button>
        </div>}
        {jefe && deOrigen && (
          <>
            <button onClick={() => setModal("importar")} className="btn-secundario px-2.5" title="Subir CSV" aria-label="Subir CSV">
              <Upload className="h-4 w-4" />
            </button>
            <RepartirLeads callers={callers} fijo={{ pipelineId: pipeline?.id ?? null }} paisesIniciales={pais ? [pais] : []} seleccion={seleccion.size ? [...seleccion] : undefined} etiqueta="" />
          </>
        )}
        {editar && pipeline && (
          <button onClick={nuevaColumna} className="btn-primario h-10 w-10 shrink-0 justify-center p-0" title="Nueva columna" aria-label="Nueva columna">
            <Plus className="h-6 w-6" />
          </button>
        )}
      </div>

      {error && <p className="rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal">{error}</p>}
      {jefe && tipo !== "closers" && seleccion.size > 0 && (
        <BarraMasiva
          seleccion={seleccion}
          leads={leads}
          callers={callers}
          closers={closers}
          destinos={destinos}
          nombrePorId={nombrePorId}
          etapaNombre={Object.fromEntries(etapas.map((e) => [e.id, e.nombre]))}
          ejecutar={ejecutar}
          limpiar={() => setSeleccion(new Set())}
          ceo={ceo}
        />
      )}

      <div className={`relative transition-opacity ${cargandoPipeline ? "pointer-events-none opacity-40" : ""}`} aria-busy={cargandoPipeline}>
      {cargandoPipeline && <div className="absolute left-1/2 top-10 z-10 -translate-x-1/2 rounded-full bg-panel px-4 py-1.5 text-sm text-texto-2 shadow-panel">Cargando…</div>}
      {!pipeline ? (
        <div className="tarjeta p-10 text-center text-sm text-texto-3">{admin ? "No hay pipelines. Crea el primero con «+ Pipeline»." : "Todavía no hay pipelines."}</div>
      ) : tipo === "closers" && tableroClosers ? (
        <TableroClosers
          columnas={tableroClosers.columnas}
          productos={productos}
          moneda={moneda}
          jefe={jefe}
          soloMirar={tableroClosers.soloMirar}
          menuColumna={(col, i) => menu(etapas.find((e) => e.id === col.id)!, i)}
          reordenarColumna={editar ? soltarColumna : undefined}
          alFinal={
            <>
              {anadirColumna}
              {tableroClosers.sinColumna > 0 && (
                <div className="w-72 shrink-0 rounded-xl border border-dashed border-aviso/50 p-3 text-xs text-aviso">
                  {tableroClosers.sinColumna} tarjetas sin columna: su estado no está unido a ninguna. Une una columna a ese estado con «⋯».
                </div>
              )}
            </>
          }
        />
      ) : vista === "tablero" || !jefe ? (
        <div className={`flex gap-3 overflow-x-auto pb-3 ${pendiente ? "cursor-progress" : ""}`}>
          {etapas.map((e, i) => {
            const enColumna = leads.filter((l) => l.etapa_id === e.id);
            const limite = verMas[e.id] ?? POR_COLUMNA;
            return (
              <div
                key={e.id}
                onDragOver={(ev) => {
                  ev.preventDefault();
                  if (ev.dataTransfer.types.includes(ARRASTRE_COLUMNA)) setColSobre(e.id);
                  else setSobre(e.id);
                }}
                onDragLeave={() => {
                  setSobre((s) => (s === e.id ? null : s));
                  setColSobre((s) => (s === e.id ? null : s));
                }}
                onDrop={(ev) => {
                  ev.preventDefault();
                  const col = ev.dataTransfer.getData(ARRASTRE_COLUMNA);
                  if (col) return soltarColumna(col, e.id);
                  soltar(e.id, ev.dataTransfer.getData("text/plain"));
                }}
                className={`flex w-72 shrink-0 flex-col rounded-xl border bg-panel-2/60 transition-colors ${
                  sobre === e.id ? "border-primario bg-primario-suave/40" : colSobre === e.id ? "border-primario border-dashed" : "border-borde"
                }`}
              >
                <div
                  draggable={editar}
                  onDragStart={(ev) => {
                    ev.dataTransfer.effectAllowed = "move";
                    ev.dataTransfer.setData(ARRASTRE_COLUMNA, e.id);
                  }}
                  title={editar ? "Arrastra la columna para cambiarla de sitio" : undefined}
                  className={`flex items-center justify-between gap-2 border-b border-borde px-3 py-2.5 ${editar ? "cursor-grab active:cursor-grabbing" : ""}`}
                  style={{ borderTop: `3px solid ${e.color}`, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{e.nombre}</div>
                    <div className="text-[11px] text-texto-3">
                      {enColumna.length} leads
                      {admin && citasGhl === e.id && <span title="Aquí van los leads con cita de GHL"> · 📅 citas GHL</span>}
                      {e.estado_caller && <span title="Columna unida a un estado: los botones del caller mueven aquí y soltar aquí cambia el estado"> · ↔ {ETIQUETA_ESTADO_CALLER[e.estado_caller]}</span>}
                    </div>
                  </div>
                  {menu(e, i)}
                </div>
                <div className="flex max-h-[calc(100vh-330px)] min-h-32 flex-col gap-2 overflow-y-auto p-2">
                  {enColumna.slice(0, limite).map((l) => (
                    <Tarjeta
                      key={l.id}
                      lead={l}
                      caller={l.caller_id ? nombrePorId[l.caller_id] : null}
                      closer={l.closer_id ? nombrePorId[l.closer_id] : null}
                      onDrag={() => setArrastrando(l.id)}
                      arrastrando={arrastrando === l.id}
                      marcada={seleccion.has(l.id)}
                      onMarcar={
                        jefe
                          ? () => {
                              const s = new Set(seleccion);
                              if (s.has(l.id)) s.delete(l.id);
                              else s.add(l.id);
                              setSeleccion(s);
                            }
                          : undefined
                      }
                    />
                  ))}
                  {enColumna.length > limite && (
                    <button onClick={() => setVerMas((v) => ({ ...v, [e.id]: limite + POR_COLUMNA }))} className="rounded-lg py-2 text-xs text-primario hover:bg-primario-suave">
                      Ver {Math.min(POR_COLUMNA, enColumna.length - limite)} más de {enColumna.length - limite}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {anadirColumna}
          {sinColumna.length > 0 && (
            <div className="w-72 shrink-0 rounded-xl border border-dashed border-aviso/50 p-3 text-xs text-aviso">
              {sinColumna.length} leads sin columna. Arrástralos o muévelos desde su ficha.
            </div>
          )}
        </div>
      ) : (
        <VistaLista
          leads={leads}
          etapas={etapas}
          nombrePorId={nombrePorId}
          seleccion={seleccion}
          setSeleccion={setSeleccion}
        />
      )}
      </div>

      {ventana && (
        <VentanaEstado
          lead={{ id: ventana.lead.id, nombre: `${ventana.lead.nombre} ${ventana.lead.apellido}`.trim() }}
          destino={ventana.destino}
          closers={closers}
          productos={productos}
          moneda={moneda}
          estrellasOpcionales={estrellasOpcionales}
          onCerrar={() => setVentana(null)}
          onGuardar={(accion, mensaje) => mover(ventana.lead.id, ventana.etapaId, accion, mensaje)}
        />
      )}
      {modal === "permisos" && permisos && pipeline && <ModalPermisos pipeline={pipeline} datos={permisos} onCerrar={() => setModal(null)} onGuardar={(quien, nivel, msg) => ejecutar(() => exigirOk(guardarPermisoPipeline(pipeline.id, quien, nivel)), msg)} />}
      {modal === "importar" && <ModalImportar pipelines={pipelines.filter((p) => p.tipo === "normal")} pipelineId={pipeline?.id} onCerrar={() => setModal(null)} />}
      {modal === "lead" && (
        <Modal titulo="Nuevo lead" onCerrar={() => setModal(null)}>
          <form
            action={(fd) =>
              ejecutar(async () => {
                await exigirOk(crearLeadManual(fd));
                setModal(null);
              })
            }
            className="space-y-3"
          >
            <input type="hidden" name="pipeline" value={pipeline?.id ?? ""} />
            <label className="block"><span className="etiqueta-campo">Nombre y apellido</span><input name="nombre" required className="campo" /></label>
            <label className="block"><span className="etiqueta-campo">Email</span><input name="email" type="email" className="campo" /></label>
            <label className="block"><span className="etiqueta-campo">Teléfono</span><input name="telefono" className="campo" placeholder="+1 555 000 0000" /></label>
            <button className="btn-primario w-full" disabled={pendiente}>Crear lead</button>
          </form>
        </Modal>
      )}
      {modal === "pipeline" && (
        <Modal titulo="Nuevo pipeline" onCerrar={() => setModal(null)}>
          <form
            action={(fd) =>
              ejecutar(async () => {
                const id = await exigirOk(crearPipeline(String(fd.get("nombre"))));
                setModal(null);
                router.push(`/crm?pipeline=${id}`);
              })
            }
            className="space-y-3"
          >
            <label className="block"><span className="etiqueta-campo">Nombre</span><input name="nombre" required className="campo" placeholder="Ej: Webinar 2" /></label>
            <p className="text-xs text-texto-3">Se crea con 4 columnas (Nuevos, Agendados, Cerrados y Descartados). Luego puedes añadir, renombrar o borrar columnas. El resultado de cada llamada se ve en el pipeline «Callers».</p>
            <button className="btn-primario w-full" disabled={pendiente}>Crear pipeline</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Tarjeta({
  lead,
  caller,
  closer,
  onDrag,
  arrastrando,
  marcada,
  onMarcar,
}: {
  lead: LeadTarjeta;
  caller: string | null;
  closer: string | null;
  onDrag: () => void;
  arrastrando: boolean;
  marcada: boolean;
  onMarcar?: () => void;
}) {
  const invertir = lead.invertir;
  return (
    <TarjetaCrm
      leadId={lead.id}
      nombre={`${lead.nombre} ${lead.apellido}`.trim()}
      telefono={lead.telefono}
      pais={lead.pais}
      email={lead.email}
      arriba={
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-texto-3">
          {lead.otroPipeline && <span title="También está en otro pipeline (su pipeline principal es otro)">🔗</span>}
          <span title={`Entró el ${lead.creado_en.slice(0, 10)}`}>{haceDias(lead.creado_en)}</span>
        </span>
      }
      arrastrable
      onArrastrar={(e) => {
        e.dataTransfer.setData("text/plain", lead.id);
        onDrag();
      }}
      apagada={arrastrando}
      marcada={marcada}
      onMarcar={onMarcar}
      chips={
        <>
          {invertir && (
            <span className={`chip ${invertir.startsWith("Sí") ? "bg-ok-suave text-ok" : invertir.startsWith("En") ? "bg-aviso-suave text-aviso" : "bg-panel-2 text-texto-3"}`}>{invertir}</span>
          )}
          <OfertaChip oferta={lead.oferta} vacio={false} />
          {lead.estado_caller !== "nuevo" && <span className="chip bg-primario-suave text-primario">{ETIQUETA_ESTADO_CALLER[lead.estado_caller]}</span>}
          {lead.etiquetas.slice(0, 3).map((e) => <span key={e} className="chip bg-panel-2 text-texto-2">{e}</span>)}
          {lead.etiquetas.length > 3 && <span className="chip bg-panel-2 text-texto-3" title={lead.etiquetas.slice(3).join(", ")}>+{lead.etiquetas.length - 3}</span>}
          <span className="chip ml-auto bg-panel-2 text-texto-3" title="Caller">{caller ?? "Sin caller"}</span>
          {closer && <span className="chip bg-panel-2 text-texto-3" title="Closer">{closer}</span>}
        </>
      }
    />
  );
}

function MenuColumna({
  etapa,
  edicion,
  seleccionar,
  uniones,
  unida,
  primera,
  ultima,
  onEditar,
  onMover,
  onBorrar,
  onUnir,
  citasGhl,
}: {
  etapa: Etapa;
  edicion: boolean; // false = solo se enseña «Seleccionar todos» (quien puede marcar leads pero no editar columnas)
  seleccionar: { todas: boolean; n: number; alCambiar: () => void } | null;
  uniones: { v: string; t: string }[]; // vacío = pipeline de origen, sin uniones
  unida: string | null;
  primera: boolean;
  ultima: boolean;
  onEditar: (nombre: string, color: string) => void;
  onMover: (d: -1 | 1) => void;
  onBorrar: () => void;
  onUnir: (estado: string | null) => void;
  citasGhl: { marcada: boolean; alCambiar: (si: boolean) => void } | null; // pipelines de origen, administrador
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setAbierto((a) => !a)} className="rounded-md p-1 text-texto-3 hover:bg-panel hover:text-texto" aria-label="Opciones de la columna">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className="vidrio ventana absolute right-0 z-20 mt-1 w-60 rounded-xl border border-borde p-1">
            {seleccionar && (
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-panel-2"
                onClick={() => {
                  seleccionar.alCambiar();
                  setAbierto(false);
                }}
              >
                <CheckSquare className="h-4 w-4" /> {seleccionar.todas ? "Quitar selección" : `Seleccionar todos (${seleccionar.n})`}
              </button>
            )}
            {edicion && (<>
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-panel-2"
              onClick={() => {
                setAbierto(false);
                void pedirTexto("Nombre de la columna", etapa.nombre).then((n) => {
                  if (n) onEditar(n, etapa.color);
                });
              }}
            >
              <Pencil className="h-4 w-4" /> Renombrar
            </button>
            <div className="flex flex-nowrap gap-1.5 px-2 py-2">
              {COLORES.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    onEditar(etapa.nombre, c);
                    setAbierto(false);
                  }}
                  className={`h-5 w-5 rounded-full ${etapa.color === c ? "ring-2 ring-texto ring-offset-2 ring-offset-panel" : ""}`}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
            {uniones.length > 0 && <label className="block px-2 pb-2">
              <span className="text-[11px] text-texto-3">Unir a un estado</span>
              <Desplegable
                className="campo mt-1 py-1 text-xs"
                value={unida ?? ""}
                onChange={(e) => {
                  onUnir(e.target.value || null);
                  setAbierto(false);
                }}
              >
                <option value="">Sin unir (columna libre)</option>
                {uniones.map((u) => <option key={u.v} value={u.v}>{u.t}</option>)}
              </Desplegable>
            </label>}
            {citasGhl && (
              <label className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <input type="checkbox" className="interruptor" checked={citasGhl.marcada} onChange={(ev) => { citasGhl.alCambiar(ev.target.checked); setAbierto(false); }} />
                Aquí van los leads con cita de GHL
              </label>
            )}
            {!primera && (
              <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-panel-2" onClick={() => { onMover(-1); setAbierto(false); }}>
                <ArrowLeft className="h-4 w-4" /> Mover a la izquierda
              </button>
            )}
            {!ultima && (
              <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-panel-2" onClick={() => { onMover(1); setAbierto(false); }}>
                <ArrowRight className="h-4 w-4" /> Mover a la derecha
              </button>
            )}
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-mal hover:bg-mal-suave" onClick={() => { onBorrar(); setAbierto(false); }}>
              <Trash2 className="h-4 w-4" /> Borrar columna
            </button>
            </>)}
          </div>
        </>
      )}
    </div>
  );
}

function VistaLista({
  leads,
  etapas,
  nombrePorId,
  seleccion,
  setSeleccion,
}: {
  leads: LeadTarjeta[];
  etapas: Etapa[];
  nombrePorId: Record<string, string>;
  seleccion: Set<string>;
  setSeleccion: (s: Set<string>) => void;
}) {
  const [limite, setLimite] = useState(100);
  const etapaNombre = Object.fromEntries(etapas.map((e) => [e.id, e]));
  const visibles = leads.slice(0, limite);
  const todos = visibles.length > 0 && visibles.every((l) => seleccion.has(l.id));
  return (
    <div className="tarjeta overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-borde bg-panel-2 p-3 text-sm">
        <span className="font-medium">{seleccion.size ? `${seleccion.size} seleccionados · las acciones están arriba` : "Marca leads para asignarlos, moverlos, etiquetarlos o exportarlos"}</span>
        <span className="ml-auto text-texto-3">{leads.length} leads</span>
      </div>
      <div className="overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  checked={todos}
                  onChange={() => {
                    const s = new Set(seleccion);
                    visibles.forEach((l) => (todos ? s.delete(l.id) : s.add(l.id)));
                    setSeleccion(s);
                  }}
                  aria-label="Seleccionar todos"
                />
              </th>
              <th>Lead</th><th>Teléfono</th><th>País</th><th>Columna</th><th>Caller</th><th>Closer</th><th>Estado</th><th>Entró</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((l) => {
              const e = l.etapa_id ? etapaNombre[l.etapa_id] : null;
              return (
                <tr key={l.id} className="hover:bg-panel-2">
                  <td>
                    <input
                      type="checkbox"
                      checked={seleccion.has(l.id)}
                      onChange={() => {
                        const s = new Set(seleccion);
                        if (s.has(l.id)) s.delete(l.id);
                        else s.add(l.id);
                        setSeleccion(s);
                      }}
                      aria-label="Seleccionar lead"
                    />
                  </td>
                  <td><Link href={`/leads/${l.id}`} className="font-medium hover:text-primario">{`${l.nombre} ${l.apellido}`.trim()}</Link><div className="text-xs text-texto-3">{l.email}</div></td>
                  <td className="whitespace-nowrap text-texto-2">{l.telefono}</td>
                  <td className="whitespace-nowrap text-texto-2">{nombrePais(l.pais)}</td>
                  <td>{e ? <span className="chip" style={{ background: `${e.color}22`, color: e.color }}>{e.nombre}</span> : "—"}</td>
                  <td className="text-texto-2">{l.caller_id ? nombrePorId[l.caller_id] : "—"}</td>
                  <td className="text-texto-2">{l.closer_id ? nombrePorId[l.closer_id] : "—"}</td>
                  <td className="text-texto-2">{ETIQUETA_ESTADO_CALLER[l.estado_caller]}</td>
                  <td className="whitespace-nowrap text-xs text-texto-3">{l.creado_en.slice(0, 10)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {leads.length > limite && (
        <button onClick={() => setLimite((x) => x + 100)} className="w-full border-t border-borde py-3 text-sm text-primario hover:bg-panel-2">
          Ver 100 más ({leads.length - limite} restantes)
        </button>
      )}
    </div>
  );
}

export function ModalImportar({ pipelines, pipelineId, onCerrar }: { pipelines: Pipeline[]; pipelineId?: string; onCerrar: () => void }) {
  const [estado, accion, enviando] = useActionState(importarCsv, null as null | { ok?: string; error?: string });
  const [vista, setVista] = useState<{ columnas: string[]; ejemplo: Record<string, string>; filas: number } | null>(null);
  const [mapa, setMapa] = useState<Record<string, Campo>>({});
  const sinContacto = vista && !Object.values(mapa).some((c) => c === "email" || c === "telefono" || c === "ghl_contact_id");
  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState("");
  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErrorSubida("");
    setSubiendo(true);
    try {
      await subirDelFormulario(fd, "archivo", "text/csv", prepararSubidaCsv);
    } catch (err) {
      return setErrorSubida(err instanceof Error ? err.message : "No se pudo subir el archivo.");
    } finally {
      setSubiendo(false);
    }
    startTransition(() => accion(fd));
  };
  const error = errorSubida || estado?.error;
  return (
    <Modal titulo="Subir CSV de leads" onCerrar={onCerrar} ancho="max-w-2xl">
      <form onSubmit={enviar} className="space-y-4">
        <p className="text-sm text-texto-2">
          Sirve la exportación de contactos de GoHighLevel o cualquier CSV. Revisa qué es cada columna; lo que marques como <b>respuesta del formulario</b> se verá en la ficha del lead. Si un lead ya existe (mismo Contact Id o email), se actualiza en vez de duplicarse.
        </p>
        <div>
          <label className="etiqueta-campo" htmlFor="tablero-archivo-csv">Archivo CSV</label>
          <input id="tablero-archivo-csv"
            type="file"
            name="archivo"
            accept=".csv,text/csv"
            required
            className="campo file:mr-3 file:rounded-md file:border-0 file:bg-primario-suave file:px-3 file:py-1 file:text-primario"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return setVista(null);
              const texto = (await f.text()).replace(/^\uFEFF/, "");
              const res = Papa.parse<Record<string, string>>(texto, { header: true, skipEmptyLines: true });
              const columnas = (res.meta.fields ?? []).filter((c) => c.trim());
              setVista({ columnas, ejemplo: res.data[0] ?? {}, filas: res.data.length });
              setMapa(Object.fromEntries(columnas.map((c) => [c, proponerCampo(c)])));
            }}
          />
        </div>
        {vista && (
          <div className="rounded-lg border border-borde">
            <div className="border-b border-borde bg-panel-2 px-3 py-2 text-xs font-medium">{vista.filas} filas · {vista.columnas.length} columnas · ¿qué es cada columna?</div>
            <div className="max-h-72 divide-y divide-borde overflow-y-auto">
              {vista.columnas.map((c) => (
                <div key={c} className="grid grid-cols-[minmax(0,1fr)_200px] items-center gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium" title={c}>{c}</div>
                    <div className="truncate text-xs text-texto-3">Ej: {vista.ejemplo[c] || "—"}</div>
                  </div>
                  <Desplegable value={mapa[c]} onChange={(e) => setMapa((m) => ({ ...m, [c]: e.target.value as Campo }))} className="campo py-1.5 text-xs">
                    {CAMPOS.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
                  </Desplegable>
                </div>
              ))}
            </div>
          </div>
        )}
        <input type="hidden" name="mapa" value={JSON.stringify(mapa)} />
        {sinContacto && <p className="rounded-lg bg-aviso-suave px-3 py-2 text-sm text-aviso">Ninguna columna es email, teléfono ni Contact Id: no se podrá importar ningún lead.</p>}
        <div>
          <label className="etiqueta-campo" htmlFor="tablero-pipeline-donde-entran">Pipeline donde entran</label>
          <Desplegable id="tablero-pipeline-donde-entran" name="pipeline" defaultValue={pipelineId} className="campo">
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </Desplegable>
        </div>
        <label className="flex items-center gap-2 text-sm text-texto-2">
          <input type="checkbox" name="repartir" className="interruptor " />
          Repartir los nuevos entre los callers con sus % (solo si el reparto automático está encendido en Administración)
        </label>
        {error && <p className="rounded-lg bg-mal-suave px-3 py-2 text-sm text-mal">{error}</p>}
        {!error && estado?.ok && <p className="rounded-lg bg-ok-suave px-3 py-2 text-sm text-ok">{estado.ok}</p>}
        <button className="btn-primario w-full" disabled={enviando || subiendo || !!sinContacto}>{subiendo ? "Subiendo…" : enviando ? "Importando…" : "Importar"}</button>
      </form>
    </Modal>
  );
}

// Permisos de un pipeline (Paso 0, como GHL): por rol y por persona; manda la persona. CEO y director con
// Administración, siempre «Editar».
const NIVELES = [
  { v: "editar", t: "Editar (también columnas)" },
  { v: "ver", t: "Ver (mueve sus tarjetas)" },
  { v: "sin_acceso", t: "Sin acceso" },
];
const DEFECTO_PIPE: Record<TipoPipeline, Record<string, string>> = {
  normal: { director: "ver", closer: "ver", caller: "ver" },
  callers: { director: "ver", closer: "sin_acceso", caller: "ver" },
  closers: { director: "ver", closer: "ver", caller: "sin_acceso" },
};
const ROLES_PIPE = [
  { v: "director", t: "Directores" },
  { v: "closer", t: "Closers" },
  { v: "caller", t: "Callers" },
];
function ModalPermisos({
  pipeline,
  datos,
  onCerrar,
  onGuardar,
}: {
  pipeline: Pipeline;
  datos: { filas: FilaPermiso[]; gente: { id: string; nombre: string; rol: string }[] };
  onCerrar: () => void;
  onGuardar: (quien: { rol: string } | { perfilId: string }, nivel: string | null, mensaje: string) => void;
}) {
  const texto = (v: string) => NIVELES.find((n) => n.v === v)?.t.split(" (")[0] ?? v;
  const delRol = (rol: string) => datos.filas.find((f) => f.rol === rol)?.nivel ?? null;
  return (
    <Modal titulo={`Quién ve «${pipeline.nombre}»`} onCerrar={onCerrar} ancho="max-w-xl">
      <div className="space-y-4">
        <p className="text-xs text-texto-3">Como en GHL: <b>Editar</b> = también sus columnas · <b>Ver</b> = mueve sus tarjetas (cada uno las suyas) · <b>Sin acceso</b> = no lo ve. Manda lo de la persona sobre lo de su rol. El CEO y el director con Administración, siempre Editar.</p>
        <div className="space-y-1.5">
          <div className="titulo-seccion">Por rol</div>
          {ROLES_PIPE.map((r) => {
            const propio = delRol(r.v);
            const defecto = DEFECTO_PIPE[pipeline.tipo][r.v];
            return (
              <div key={r.v} className="flex items-center justify-between gap-3">
                <span className="text-sm">{r.t}</span>
                <Pastillas
                  corto
                  aria-label={`${r.t} en ${pipeline.nombre}`}
                  className="campo w-auto py-1 text-xs"
                  value={propio ?? ""}
                  onChange={(e) => onGuardar({ rol: r.v }, e.target.value || null, `${r.t}: ${e.target.value ? texto(e.target.value) : "lo de siempre"}`)}
                >
                  <option value="">Lo de siempre ({texto(defecto)})</option>
                  {NIVELES.map((n) => <option key={n.v} value={n.v}>{n.t}</option>)}
                </Pastillas>
              </div>
            );
          })}
        </div>
        <div className="max-h-[45vh] space-y-1.5 overflow-y-auto">
          <div className="titulo-seccion">Por persona</div>
          {datos.gente.map((g) => {
            const propio = datos.filas.find((f) => f.perfil_id === g.id)?.nivel ?? "";
            const deSuRol = delRol(g.rol) ?? DEFECTO_PIPE[pipeline.tipo][g.rol] ?? "ver";
            return (
              <div key={g.id} className="flex items-center justify-between gap-3">
                <span className="text-sm">{g.nombre} <span className="text-xs text-texto-3">· {g.rol}</span></span>
                <Pastillas
                  corto
                  aria-label={`${g.nombre} en ${pipeline.nombre}`}
                  className="campo w-auto py-1 text-xs"
                  value={propio}
                  onChange={(e) => onGuardar({ perfilId: g.id }, e.target.value || null, `${g.nombre}: ${e.target.value ? texto(e.target.value) : "como su rol"}`)}
                >
                  <option value="">Como su rol ({texto(deSuRol)})</option>
                  {NIVELES.map((n) => <option key={n.v} value={n.v}>{n.t}</option>)}
                </Pastillas>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
