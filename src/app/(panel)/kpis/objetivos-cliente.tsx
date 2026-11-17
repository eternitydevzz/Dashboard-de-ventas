"use client";

import { exigirOk } from "@/lib/resultado-cliente";
import { useState } from "react";
import { sinVaciar } from "@/components/sin-vaciar";
import { Plus, Trash2, X } from "lucide-react";
import { guardarObjetivo, quitarObjetivo, crearLanzamiento, borrarLanzamiento } from "./acciones";
import { useAccion } from "@/components/acciones-lead";
import { CIFRAS, PERIODOS, DIAS, type RolObjetivo } from "@/lib/objetivos-constantes";
import { confirmar } from "@/components/dialogos";
import { Desplegable, Pastillas } from "@/components/eleccion";

type Persona = { id: string; nombre: string; rol: RolObjetivo };
type Lanz = { id: string; nombre: string };
const ROLES: { v: RolObjetivo; t: string }[] = [
  { v: "caller", t: "Todos los callers" },
  { v: "closer", t: "Todos los closers" },
  { v: "director", t: "Directores (equipo entero)" },
];

// Formulario «Nuevo objetivo»: para quién, periodo, cifra, número y días (el diario)
export function FormObjetivo({ personas, lanzamientos }: { personas: Persona[]; lanzamientos: Lanz[] }) {
  const { pendiente, ejecutar } = useAccion();
  const [para, setPara] = useState("rol:caller");
  const [periodo, setPeriodo] = useState("dia");
  const [dias, setDias] = useState([1, 2, 3, 4, 5]);
  const rol = para.startsWith("rol:") ? (para.slice(4) as RolObjetivo) : personas.find((p) => `persona:${p.id}` === para)?.rol;
  const cifras = CIFRAS.filter((c) => !rol || c.roles.includes(rol));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
      onSubmit={sinVaciar((fd) =>
        ejecutar(
          () => guardarObjetivo({ para, periodo, lanzamientoId: String(fd.get("lanzamiento") ?? "") || null, cifra: String(fd.get("cifra")), valor: String(fd.get("valor")), dias }),
          "Objetivo guardado"
        )
      )}
    >
      <label className="block lg:col-span-2">
        <span className="etiqueta-campo">Para quién</span>
        <Desplegable className="campo" value={para} onChange={(e) => setPara(e.target.value)}>
          <optgroup label="Por rol">
            {ROLES.map((r) => <option key={r.v} value={`rol:${r.v}`}>{r.t}</option>)}
          </optgroup>
          <optgroup label="Una persona (manda sobre el de su rol)">
            {personas.map((p) => <option key={p.id} value={`persona:${p.id}`}>{p.nombre} · {p.rol}</option>)}
          </optgroup>
        </Desplegable>
      </label>
      <label className="block">
        <span className="etiqueta-campo">Periodo</span>
        <Pastillas className="campo" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
          {PERIODOS.map((p) => <option key={p.v} value={p.v} disabled={p.v === "lanzamiento" && lanzamientos.length === 0}>{p.t}</option>)}
        </Pastillas>
      </label>
      {periodo === "lanzamiento" && (
        <label className="block">
          <span className="etiqueta-campo">Lanzamiento</span>
          <Desplegable name="lanzamiento" className="campo" required>
            {lanzamientos.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </Desplegable>
        </label>
      )}
      <label className="block">
        <span className="etiqueta-campo">Cifra</span>
        <Desplegable name="cifra" className="campo" key={rol}>
          {cifras.map((c) => <option key={c.v} value={c.v}>{c.t}</option>)}
        </Desplegable>
      </label>
      <label className="block">
        <span className="etiqueta-campo">Objetivo</span>
        <input name="valor" inputMode="decimal" required placeholder="60" className="campo" />
      </label>
      {periodo === "dia" && (
        <fieldset className="lg:col-span-6">
          <legend className="etiqueta-campo">Días que cuenta (por defecto de lunes a viernes)</legend>
          <div className="flex flex-wrap gap-1.5">
            {DIAS.map((d, i) => {
              const n = i + 1;
              const marcado = dias.includes(n);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={marcado}
                  onClick={() => setDias(marcado ? dias.filter((x) => x !== n) : [...dias, n])}
                  className={`h-9 w-9 rounded-full border text-sm font-medium ${marcado ? "border-primario bg-primario text-white" : "border-borde text-texto-2"}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      <div className="lg:col-span-6">
        <button className="btn-primario" disabled={pendiente}><Plus className="h-4 w-4" /> Guardar objetivo</button>
        <span className="ml-3 text-xs text-texto-3">Si ya hay uno igual, lo sustituye en el periodo en curso; los periodos ya terminados guardan el que tenían.</span>
      </div>
    </form>
  );
}

export function BotonQuitarObjetivo({ id }: { id: string }) {
  const { pendiente, ejecutar } = useAccion();
  return (
    <button
      className="rounded-md p-1.5 text-texto-3 hover:bg-mal-suave hover:text-mal"
      disabled={pendiente}
      title="Quitar objetivo"
      onClick={() => void confirmar("¿Quitar este objetivo? Deja de contar en el periodo en curso; los ya terminados lo conservan.").then((ok) => ok && ejecutar(() => quitarObjetivo(id), "Objetivo quitado"))}
    >
      <X className="h-4 w-4" />
    </button>
  );
}

export function FormLanzamiento({ eventos }: { eventos: string[] }) {
  const { pendiente, ejecutar } = useAccion();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      onSubmit={sinVaciar((fd, form) =>
        ejecutar(
          async () => { const r = await exigirOk(crearLanzamiento({ nombre: String(fd.get("nombre")), inicio: String(fd.get("inicio")), fin: String(fd.get("fin")), evento: String(fd.get("evento") ?? "") })); form.reset(); /* vacío solo si se guardó bien */ return r; },
          "Lanzamiento creado"
        )
      )}
    >
      <label className="block lg:col-span-2"><span className="etiqueta-campo">Nombre</span><input name="nombre" required maxLength={120} placeholder="Masterclass 15 oct" className="campo" /></label>
      <label className="block"><span className="etiqueta-campo">Inicio</span><input name="inicio" type="date" required className="campo" /></label>
      <label className="block"><span className="etiqueta-campo">Fin</span><input name="fin" type="date" required className="campo" /></label>
      <label className="block">
        <span className="etiqueta-campo">Evento de los leads (opcional)</span>
        <Desplegable name="evento" className="campo" defaultValue="">
          <option value="">Sin evento: cuenta todo</option>
          {eventos.map((e) => <option key={e} value={e}>{e}</option>)}
        </Desplegable>
      </label>
      <div className="lg:col-span-5"><button className="btn-secundario" disabled={pendiente}><Plus className="h-4 w-4" /> Crear lanzamiento</button></div>
    </form>
  );
}

export function BotonBorrarLanzamiento({ id, nombre }: { id: string; nombre: string }) {
  const { pendiente, ejecutar } = useAccion();
  return (
    <button
      className="rounded-md p-1.5 text-texto-3 hover:bg-mal-suave hover:text-mal"
      disabled={pendiente}
      title="Borrar lanzamiento"
      onClick={() => void confirmar(`¿Borrar «${nombre}»? Se borran también sus objetivos.`).then((ok) => ok && ejecutar(() => borrarLanzamiento(id), "Lanzamiento borrado"))}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
