"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { sinVaciar } from "@/components/sin-vaciar";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Plus, Upload, Search, RefreshCw, Link2, X, CalendarDays, Columns3, List } from "lucide-react";
import { Modal } from "@/components/modal";
import { useAccion } from "@/components/acciones-lead";
import { SelectorEstrellas } from "@/components/estrellas";
import { exigirOk } from "@/lib/resultado-cliente";
import { agendarCita } from "@/app/(panel)/leads/acciones";
import { buscarLeadsParaLlamada, descartarCitaSinLead, importarCitas, sincronizarGhl, unirCitaSinLead } from "../acciones";
import { useToast } from "@/components/toasts";
import { CamposCita } from "@/components/campos-cita";
import { FILTROS_CITA } from "@/app/(panel)/crm/estado-cita";

type LeadBuscado = { id: string; nombre: string; apellido: string; telefono: string | null; email: string | null };

export function CrearLlamada({ closers, soyCloser }: { closers: { id: string; nombre: string }[]; soyCloser: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<LeadBuscado[]>([]);
  const [lead, setLead] = useState<LeadBuscado | null>(null);
  const [buscando, iniciar] = useTransition();
  const { pendiente, error, ejecutar } = useAccion();
  const buscar = (texto: string) =>
    iniciar(async () => {
      try {
        setResultados((await exigirOk(buscarLeadsParaLlamada(texto))) as LeadBuscado[]);
      } catch {
        setResultados([]);
      }
    });
  return (
    <>
      <button className="btn-primario" onClick={() => setAbierto(true)}><Plus className="h-4 w-4" /> Crear llamada</button>
      {abierto && (
        <Modal titulo="Crear llamada" onCerrar={() => setAbierto(false)}>
          {!lead ? (
            <div className="space-y-3">
              <label className="etiqueta-campo" htmlFor="cliente-busca-el-lead-nombre-email-o-t">Busca el lead (nombre, email o teléfono)</label>
              <input id="cliente-busca-el-lead-nombre-email-o-t" className="campo" autoFocus value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length >= 2) buscar(e.target.value); }} placeholder="Escribe al menos 2 letras…" />
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {resultados.map((l) => (
                  <li key={l.id}><button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-panel-2" onClick={() => setLead(l)}><b>{`${l.nombre} ${l.apellido}`.trim() || "Sin nombre"}</b> <span className="text-texto-3">· {l.telefono ?? l.email ?? ""}</span></button></li>
                ))}
                {!buscando && q.trim().length >= 2 && resultados.length === 0 && <li className="px-3 py-2 text-sm text-texto-3">No hay leads con eso{soyCloser ? " entre tus leads" : ""}.</li>}
              </ul>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={sinVaciar((fd) =>
                // S4-9: se cierra solo si el servidor dice que sí; si falla, queda abierta con el error
                ejecutar(async () => {
                  const r = await exigirOk(agendarCita(lead.id, String(fd.get("closer")), String(fd.get("fecha")), String(fd.get("nota") ?? ""), fd.get("estrellas") ? Number(fd.get("estrellas")) : undefined));
                  setAbierto(false);
                  setLead(null);
                  return r;
                }, "Llamada creada")
              )}
            >
              <p className="text-sm">Lead: <b>{`${lead.nombre} ${lead.apellido}`.trim()}</b> <button type="button" className="text-xs text-primario hover:underline" onClick={() => setLead(null)}>cambiar</button></p>
              <CamposCita closers={closers} inicial={soyCloser ?? undefined} id="cliente-closer" />
              <label className="block"><span className="etiqueta-campo">Nota</span><textarea name="nota" rows={2} className="campo" /></label>
              <SelectorEstrellas quien="caller" opcional />
              <button className="btn-primario w-full" disabled={pendiente}>Crear llamada</button>
            </form>
          )}
          {error && <p className="mt-2 text-sm text-mal">{error}</p>}
        </Modal>
      )}
    </>
  );
}

export function ImportarCitas() {
  const [abierto, setAbierto] = useState(false);
  const [resultado, setResultado] = useState<{ creadas: number; fallos: string[] } | null>(null);
  const [error, setError] = useState("");
  const [cargando, iniciar] = useTransition();
  return (
    <>
      <button className="btn-secundario" onClick={() => setAbierto(true)}><Upload className="h-4 w-4" /> Importar</button>
      {abierto && (
        <Modal titulo="Importar llamadas desde un CSV" onCerrar={() => { setAbierto(false); setResultado(null); }}>
          <div className="space-y-3 text-sm">
            <p className="text-texto-2">Columnas: <code>email</code> (o <code>telefono</code>), <code>fecha</code> (por ejemplo <code>2026-10-20 17:00</code>, hora del proyecto), <code>closer_email</code> y <code>nota</code> (opcional). El lead tiene que existir ya en la app.</p>
            <input
              type="file"
              accept=".csv,text/csv"
              className="campo"
              disabled={cargando}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setError("");
                const texto = await f.text();
                iniciar(async () => {
                  try {
                    setResultado((await exigirOk(importarCitas(texto))) as { creadas: number; fallos: string[] });
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Algo falló.");
                  }
                });
              }}
            />
            {cargando && <p className="text-texto-3">Importando…</p>}
            {error && <p className="text-mal">{error}</p>}
            {resultado && (
              <div className="rounded-lg bg-panel-2 p-3">
                <p><b>{resultado.creadas}</b> llamadas creadas.</p>
                {resultado.fallos.length > 0 && <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5 text-xs text-mal">{resultado.fallos.map((f) => <li key={f}>{f}</li>)}</ul>}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

// Buscador que guarda el texto en la URL (?q=)
export function BuscadorUrl({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [, iniciar] = useTransition();
  const aplicar = () => {
    if (q.trim() === (params.get("q") ?? "")) return;
    const p = new URLSearchParams(params.toString());
    if (q.trim()) p.set("q", q.trim());
    else p.delete("q");
    iniciar(() => router.replace(`${ruta}?${p}`, { scroll: false }));
  };
  // A4-11: se aplica al escribir, tras una pausa de 300 ms (como caller/cola.tsx); Intro lo aplica ya
  useEffect(() => {
    const t = setTimeout(aplicar, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps -- solo al escribir
  return (
    <form className="relative min-w-56 flex-1" onSubmit={(e) => { e.preventDefault(); aplicar(); }}>
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-texto-3" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="campo pl-9" aria-label="Buscar" />
    </form>
  );
}

// «Sincronizar GHL»: botón y sincronización automática al abrir (si han pasado más de 10 minutos)
// Plan GHL, fase 3 (16 oct): la app lee GHL sola cada minuto (desde el 17 oct); se ve cuándo fue la última lectura y, si hace más de
// 5 minutos, sale en rojo (el programador o GHL no van). Se calcula en el servidor al abrir la página.
function UltimaLectura({ s }: { s: number | null }) {
  if (s === null) return null;
  const txt = s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.round(s / 60)} min` : `hace ${Math.round(s / 3600)} h`;
  return <span className={`text-xs ${s > 300 ? "font-semibold text-mal" : "text-texto-3"}`} title="La app lee las citas de GHL sola cada minuto">Última lectura de GHL: {txt}</span>;
}

export function SincronizarGhl({ conectado, ultima, haceSegundos = null }: { conectado: boolean; ultima: string | null; haceSegundos?: number | null }) {
  const router = useRouter();
  const toast = useToast();
  const [cargando, iniciar] = useTransition();
  const hecho = useRef(false);
  const lanzar = (auto: boolean) =>
    iniciar(async () => {
      try {
        const r = (await exigirOk(sincronizarGhl(auto ? 10 * 60_000 : undefined))) as { saltada?: boolean; nuevas?: number; actualizadas?: number; canceladas?: number; sinUnir?: number; errores?: string[] };
        if (r.saltada) return;
        if (!auto || r.nuevas || r.actualizadas || r.canceladas) toast(`GHL: ${r.nuevas ?? 0} nuevas · ${r.actualizadas ?? 0} actualizadas${r.canceladas ? ` · ${r.canceladas} canceladas (borradas en GHL)` : ""}${r.sinUnir ? ` · ${r.sinUnir} sin unir` : ""}`);
        if (r.errores?.length) toast(r.errores[0], "error");
        router.refresh();
      } catch (e) {
        if (!auto) toast(e instanceof Error ? e.message : "No se pudo sincronizar.", "error");
      }
    });
  useEffect(() => {
    if (conectado && !hecho.current) {
      hecho.current = true;
      lanzar(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectado]);
  return (
    <>
      {conectado && <UltimaLectura s={haceSegundos} />}
      <button className="btn-secundario border-oro/40 text-oro" disabled={cargando} onClick={() => lanzar(false)} title={conectado ? (ultima ? `Última: ${ultima}` : "Nunca sincronizado") : "Conecta GHL en Administración → Integraciones"}>
        <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} /> {cargando ? "Sincronizando…" : "Sincronizar GHL"}
      </button>
    </>
  );
}

// Una cita de GHL sin unir: unirla a un lead o descartarla
export function FilaSinUnir({ id, titulo, fechaTxt, closer }: { id: string; titulo: string; fechaTxt: string; closer: string }) {
  const { pendiente, error, ejecutar } = useAccion();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<LeadBuscado[]>([]);
  const [, iniciar] = useTransition();
  return (
    <li className="space-y-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <b>{titulo || "Cita sin título"}</b>
        <span className="text-xs text-texto-3">{fechaTxt} · {closer}</span>
        <button className="btn-secundario ml-auto px-2 py-1 text-xs hover:text-mal" disabled={pendiente} onClick={() => ejecutar(() => descartarCitaSinLead(id), "Descartada")}><X className="h-3.5 w-3.5" /> Descartar</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="campo max-w-xs py-1.5 text-sm"
          placeholder="Buscar el lead para unirla…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            const t = e.target.value;
            if (t.trim().length >= 2) iniciar(async () => { try { setRes((await exigirOk(buscarLeadsParaLlamada(t))) as LeadBuscado[]); } catch { setRes([]); } });
          }}
        />
        {res.slice(0, 5).map((l) => (
          <button key={l.id} className="btn-secundario px-2 py-1 text-xs" disabled={pendiente} onClick={() => ejecutar(() => unirCitaSinLead(id, l.id), "Cita unida al lead")}>
            <Link2 className="h-3.5 w-3.5" /> {`${l.nombre} ${l.apellido}`.trim()} <span className="text-texto-3">{l.telefono ?? l.email ?? ""}</span>
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-mal">{error}</p>}
    </li>
  );
}

const VISTAS_CAL = [
  { v: "mes", t: "Mes", i: CalendarDays },
  { v: "semana", t: "Semana", i: Columns3 },
  { v: "dia", t: "Día", i: CalendarDays },
  { v: "lista", t: "Lista", i: List },
] as const;

// R9: las 4 vistas llegan ya pintadas del servidor; cambiar de una a otra solo toca la dirección (replaceState, guía de
// Next 16 «Native History API»), sin pedir la página. Los filtros leen la dirección actual para no perder la vista.
export function VistasCalendario({ estado, ...vistas }: { estado: string; mes: ReactNode; semana: ReactNode; dia: ReactNode; lista: ReactNode }) {
  const ruta = usePathname();
  const params = useSearchParams();
  const pedida = params.get("vista");
  const vista = VISTAS_CAL.find((x) => x.v === pedida)?.v ?? "mes";
  const con = (k: string, v: string) => {
    const p = new URLSearchParams(params.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    return `${ruta}?${p}`;
  };
  return (
    <div className="tarjeta overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-borde p-2">
        {FILTROS_CITA.map((f) => (
          <Link prefetch={false} key={f.v} href={con("estado", f.v)} className={`rounded-full px-3 py-1 text-sm ${estado === f.v ? "bg-primario text-white" : "bg-panel-2 text-texto-2 hover:text-texto"}`}>{f.v ? f.t : "Todos"}</Link>
        ))}
        <div className="ml-auto flex rounded-lg border border-borde bg-panel-2 p-0.5">
          {VISTAS_CAL.map((v) => (
            <button type="button" key={v.v} aria-pressed={vista === v.v} onClick={() => window.history.replaceState(null, "", con("vista", v.v))} className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs ${vista === v.v ? "bg-primario text-white" : "text-texto-2"}`}><v.i className="h-3.5 w-3.5" />{v.t}</button>
          ))}
        </div>
      </div>
      {vistas[vista]}
    </div>
  );
}
