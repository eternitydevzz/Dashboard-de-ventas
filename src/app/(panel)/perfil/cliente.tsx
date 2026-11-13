"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccion } from "@/components/acciones-lead";
import { Avatar } from "@/components/ui";
import { cambiarMiPassword, guardarMiFoto, guardarMiMercado, guardarMiPerfil, guardarMiZona } from "./acciones";
import { MERCADOS, type Mercado } from "@/lib/mercado";
import { LADO_FOTO, MAX_ORIGINAL, ZONAS, type Zona } from "./foto-zona";

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
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        ejecutar(async () => {
          const r = await cambiarMiPassword(actual, nueva, repetida);
          if (!r) { setActual(""); setNueva(""); setRepetida(""); }
          return r;
        }, "Contraseña cambiada");
      }}
    >
      <label className="block"><span className="etiqueta-campo">Contraseña actual</span><input className="campo" type="password" autoComplete="current-password" required value={actual} onChange={(e) => setActual(e.target.value)} /></label>
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

// N3 (Cristian, 13 nov): recorta la foto cuadrada y la reduce aquí, en el navegador (createImageBitmap ya la gira
// según el móvil). Así sube en un momento y la app no guarda fotos de varios MB.
async function fotoReducida(archivo: File): Promise<Blob> {
  const img = await createImageBitmap(archivo).catch(() => {
    throw new Error("No se pudo leer esa imagen. Prueba con una foto JPG o PNG.");
  });
  const lado = Math.min(img.width, img.height);
  const lienzo = document.createElement("canvas");
  lienzo.width = lienzo.height = LADO_FOTO;
  lienzo.getContext("2d")?.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, LADO_FOTO, LADO_FOTO);
  img.close();
  return new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo preparar la foto."))), "image/jpeg", 0.85));
}

// `entrada`: es el paso obligatorio al entrar; al guardarla, sigue a la app
export function FormMiFoto({ nombre, foto, entrada = false }: { nombre: string; foto: string | null; entrada?: boolean }) {
  const router = useRouter();
  const { pendiente, error, ejecutar } = useAccion();
  function elegir(archivo: File | undefined) {
    if (!archivo) return;
    ejecutar(async () => {
      if (!archivo.type.startsWith("image/")) throw new Error("Elige una imagen.");
      if (archivo.size > MAX_ORIGINAL) throw new Error("La imagen pesa más de 20 MB.");
      const datos = new FormData();
      datos.append("foto", await fotoReducida(archivo), "foto.jpg");
      const r = await guardarMiFoto(datos);
      if (!r && entrada) router.replace("/");
      return r;
    }, "Foto guardada");
  }
  return (
    <div className="flex items-center gap-4">
      <Avatar nombre={nombre} foto={foto} tamano="h-20 w-20 text-xl" />
      <div className="space-y-2">
        <label className={`btn-primario cursor-pointer ${pendiente ? "pointer-events-none opacity-60" : ""}`}>
          {pendiente ? "Subiendo…" : foto ? "Cambiar mi foto" : "Subir mi foto"}
          {/* Solo subir un archivo (Cristian): en el móvil el propio sistema deja hacerla con la cámara */}
          <input type="file" accept="image/*" className="sr-only" disabled={pendiente} onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <p className="text-xs text-texto-3">Una foto tuya donde se te vea la cara. Sale en el menú, el ranking y las tarjetas del equipo.</p>
        {error && <p className="text-xs text-mal">{error}</p>}
      </div>
    </div>
  );
}

// N2 (Cristian, 13 nov): en qué zona ve las horas (el proyecto y sus cifras siguen en la suya)
export function FormMiZona({ inicial }: { inicial: Zona | null }) {
  const [z, setZ] = useState(inicial);
  const { pendiente, error, ejecutar } = useAccion();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Mi zona horaria">
        {ZONAS.map((x) => (
          <button
            key={x.v}
            type="button"
            role="radio"
            aria-checked={z === x.v}
            disabled={pendiente}
            className={z === x.v ? "btn-primario" : "btn-secundario"}
            onClick={() => { setZ(x.v); ejecutar(() => guardarMiZona(x.v), `Ahora ves las horas de ${x.t}`); }}
          >
            {x.t}
          </button>
        ))}
      </div>
      <p className="text-xs text-texto-3">Solo cambia cómo ves tú las horas. Las cifras y los KPIs siguen en la hora del proyecto.</p>
      {error && <p className="text-xs text-mal">{error}</p>}
    </div>
  );
}
