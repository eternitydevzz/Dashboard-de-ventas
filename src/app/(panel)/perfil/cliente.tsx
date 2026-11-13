"use client";

import { useState } from "react";
import { useAccion } from "@/components/acciones-lead";
import { cambiarMiPassword, guardarMiMercado, guardarMiPerfil } from "./acciones";
import { MERCADOS, type Mercado } from "@/lib/mercado";

export function FormMisDatos({ nombre, telefono, whatsapp, email }: { nombre: string; telefono: string; whatsapp: string; email: string }) {
  const [d, setD] = useState({ nombre, telefono, whatsapp });
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); ejecutar(() => guardarMiPerfil(d), "Datos guardados"); }}>
      <label className="block"><span className="etiqueta-campo">Nombre y apellido</span><input className="campo" required value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} /></label>
      <label className="block"><span className="etiqueta-campo">Email</span><input className="campo opacity-70" value={email} disabled /></label>
      <p className="-mt-2 text-xs text-texto-3">El email lo cambia un administrador.</p>
      <label className="block"><span className="etiqueta-campo">Teléfono</span><input className="campo" value={d.telefono} placeholder="+1 555 000 0000" onChange={(e) => setD({ ...d, telefono: e.target.value })} /></label>
      <label className="block"><span className="etiqueta-campo">WhatsApp</span><input className="campo" value={d.whatsapp} placeholder="+34 600 000 000" onChange={(e) => setD({ ...d, whatsapp: e.target.value })} /></label>
      {error && <p className="text-xs text-mal">{error}</p>}
      <button className="btn-primario" disabled={pendiente}>Guardar</button>
    </form>
  );
}

export function FormMiPassword() {
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        ejecutar(async () => {
          const r = await cambiarMiPassword(nueva, repetida);
          if (!r) { setNueva(""); setRepetida(""); }
          return r;
        }, "Contraseña cambiada");
      }}
    >
      <label className="block"><span className="etiqueta-campo">Nueva contraseña</span><input className="campo" type="password" autoComplete="new-password" minLength={8} required value={nueva} onChange={(e) => setNueva(e.target.value)} /></label>
      <label className="block"><span className="etiqueta-campo">Repítela</span><input className="campo" type="password" autoComplete="new-password" minLength={8} required value={repetida} onChange={(e) => setRepetida(e.target.value)} /></label>
      <p className="text-xs text-texto-3">Mínimo 8 caracteres.</p>
      {error && <p className="text-xs text-mal">{error}</p>}
      <button className="btn-primario" disabled={pendiente}>Cambiar contraseña</button>
    </form>
  );
}

// 13 nov (Cristian): de qué equipo es (cambia sus links, recursos, guion y manuales)
export function FormMiMercado({ inicial }: { inicial: Mercado | null }) {
  const [m, setM] = useState(inicial);
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Mi equipo">
        {MERCADOS.map((x) => (
          <button
            key={x.v}
            type="button"
            role="radio"
            aria-checked={m === x.v}
            disabled={pendiente}
            className={m === x.v ? "btn-primario" : "btn-secundario"}
            onClick={() => { setM(x.v); ejecutar(() => guardarMiMercado(x.v), `Ahora eres del equipo de ${x.t}`); }}
          >
            {x.v === "es" ? "Trabajo desde España" : "Trabajo desde Latinoamérica"}
          </button>
        ))}
      </div>
      <p className="text-xs text-texto-3">Con esto ves los links de agenda y de pago, los recursos, el guion y los manuales de tu equipo.</p>
      {error && <p className="text-xs text-mal">{error}</p>}
    </div>
  );
}
