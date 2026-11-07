"use client";

import { sinVaciar } from "@/components/sin-vaciar";
import { useActionState, useState } from "react";
import { Copy, Check, RefreshCw } from "lucide-react";
import { anadirAlProyecto, crearProyecto, crearUsuario, guardarLinkAgenda, guardarProyecto, regenerarSecreto } from "./acciones";
import { useAccion, Mensajes } from "@/components/acciones-lead";
import { confirmar } from "@/components/dialogos";
import { Desplegable, Pastillas } from "@/components/eleccion";

type Res = { ok?: string; error?: string } | null;
function Resultado({ estado }: { estado: Res }) {
  return <Mensajes error={estado?.error ?? ""} ok={estado?.ok ?? ""} />;
}

export function FormUsuario({ soyCeo }: { soyCeo: boolean }) {
  const [estado, accion, enviando] = useActionState(crearUsuario, null as Res);
  return (
    <form onSubmit={sinVaciar(accion)} className="space-y-3">
      <label className="block"><span className="etiqueta-campo">Nombre y apellido</span><input name="nombre" required className="campo" /></label>
      <label className="block"><span className="etiqueta-campo">Email</span><input name="email" type="email" required className="campo" /></label>
      <div>
        <label className="etiqueta-campo" htmlFor="cliente-rol">Rol</label>
        <Pastillas id="cliente-rol" name="rol" className="campo" defaultValue="caller">
          <option value="caller">Caller</option>
          <option value="closer">Closer</option>
          <option value="director">Director de ventas</option>
          {soyCeo && <option value="ceo">CEO</option>}
        </Pastillas>
      </div>
      <label className="block"><span className="etiqueta-campo">Contraseña temporal (mín. 8)</span><input name="password" type="text" minLength={8} required className="campo" autoComplete="off" /></label>
      <Resultado estado={estado} />
      <button className="btn-primario w-full" disabled={enviando}>{enviando ? "Creando…" : "Crear usuario"}</button>
    </form>
  );
}

export function FormProyecto({ aviso }: { aviso: string }) {
  const [estado, accion, enviando] = useActionState(guardarProyecto, null as Res);
  return (
    <form onSubmit={sinVaciar(accion)} className="space-y-4">
      <div>
        <label className="etiqueta-campo" htmlFor="cliente-webhook-de-avisos-ghl-inbound-">Webhook de avisos (GHL «Inbound Webhook»)</label>
        <input id="cliente-webhook-de-avisos-ghl-inbound-" name="aviso_webhook_url" defaultValue={aviso} placeholder="https://services.leadconnectorhq.com/hooks/…" className="campo" />
        <p className="mt-1 text-xs text-texto-3">Cuando alguien envía su reporte, la app manda los datos aquí y el workflow de GHL envía el email y el WhatsApp al director y al CEO.</p>
      </div>
      <Resultado estado={estado} />
      <button className="btn-primario" disabled={enviando}>Guardar</button>
    </form>
  );
}

// 4.4 (Cristian, 11 oct): el link del calendario de GHL que el caller manda al lead con «Link enviado»
export function LinkAgenda({ inicial }: { inicial: string }) {
  const { pendiente, error, ok, ejecutar } = useAccion();
  const [valor, setValor] = useState(inicial);
  return (
    <div className="space-y-3">
      <div>
        <label className="etiqueta-campo" htmlFor="admin-link-agenda">Link del calendario de GHL</label>
        <input id="admin-link-agenda" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="https://…" className="campo" />
        <p className="mt-1 text-xs text-texto-3">El de reservas que reparte entre los closers. Cuando un caller pulsa «Link enviado», se abre WhatsApp con este link ya escrito. La hora y el closer llegan luego desde GHL.</p>
      </div>
      <Mensajes error={error} ok={ok} />
      <button className="btn-primario" disabled={pendiente} onClick={() => ejecutar(() => guardarLinkAgenda(valor), "Link de agenda guardado")}>Guardar</button>
    </div>
  );
}

export function FormNuevoProyecto() {
  const [estado, accion, enviando] = useActionState(crearProyecto, null as Res);
  return (
    <form onSubmit={sinVaciar(accion)} className="space-y-3 border-t border-borde pt-4">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <label className="block"><span className="etiqueta-campo">Nombre del nuevo proyecto</span><input name="nombre" required className="campo" /></label>
        <label className="block"><span className="etiqueta-campo">Color</span><input name="color" type="color" defaultValue="#2f55d4" className="h-[38px] w-14 cursor-pointer rounded-lg border border-borde bg-panel-2" /></label>
      </div>
      <div>
        <label className="etiqueta-campo" htmlFor="cliente-moneda-y-zona-horaria">Moneda y zona horaria</label>
        <Pastillas id="cliente-moneda-y-zona-horaria" name="region" className="campo">
          <option value="us">USD · Nueva York (EE. UU.)</option>
          <option value="es">EUR · Madrid (España)</option>
        </Pastillas>
      </div>
      <Resultado estado={estado} />
      <button className="btn-primario" disabled={enviando}>Crear proyecto</button>
    </form>
  );
}

export function Copiar({ texto, etiqueta, className = "btn-secundario text-xs" }: { texto: string; etiqueta: string; className?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
      }}
    >
      {copiado ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />} {copiado ? "Copiado" : etiqueta}
    </button>
  );
}

export function Secreto({ url, cabecera, secreto }: { url: string; cabecera: string; secreto: string }) {
  const [ver, setVer] = useState(false);
  const { pendiente, ejecutar } = useAccion();
  return (
    <div className="mt-3 space-y-3 text-sm">
      <div>
        <div className="etiqueta-campo">URL</div>
        <code className="block break-all rounded-lg border border-borde bg-panel-2 p-2.5 text-xs">{url}</code>
        <div className="mt-1.5"><Copiar texto={url} etiqueta="Copiar URL" /></div>
      </div>
      <div>
        <div className="etiqueta-campo">Cabecera (Headers → añadir; Authorization = No auth)</div>
        <code className="block break-all rounded-lg border border-borde bg-panel-2 p-2.5 text-xs">
          {cabecera}: {ver ? secreto : "••••••••••••••••"}
        </code>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <button type="button" className="btn-secundario text-xs" onClick={() => setVer((v) => !v)}>{ver ? "Ocultar clave" : "Mostrar clave"}</button>
          <Copiar texto={cabecera} etiqueta="Copiar nombre" />
          <Copiar texto={secreto} etiqueta="Copiar clave" />
          <button
            type="button"
            className="btn-secundario text-xs"
            disabled={pendiente}
            onClick={() => void confirmar("Si cambias la clave, tendrás que ponerla nueva en todos los workflows de GHL. ¿Seguir?").then((ok) => ok && ejecutar(() => regenerarSecreto(), "Clave nueva creada"))}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Nueva clave
          </button>
        </div>
      </div>
    </div>
  );
}

export function Plantilla({ titulo, disparador, cuerpo }: { titulo: string; disparador: string; cuerpo: string }) {
  return (
    <details className="rounded-lg border border-borde bg-panel-2">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{titulo} <span className="font-normal text-texto-3">· disparador: {disparador}</span></summary>
      <div className="border-t border-borde p-3">
        <pre className="overflow-x-auto whitespace-pre rounded-md bg-panel p-3 text-[11px] leading-relaxed">{cuerpo}</pre>
        <div className="mt-2"><Copiar texto={cuerpo} etiqueta="Copiar JSON" /></div>
      </div>
    </details>
  );
}

export function AnadirExistente({ personas, proyecto }: { personas: { id: string; nombre: string }[]; proyecto: string }) {
  const { pendiente, error, ok, ejecutar } = useAccion();
  const [elegido, setElegido] = useState("");
  if (!personas.length) return <p className="text-sm text-texto-3">Todas las personas ya están en {proyecto}.</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-texto-3">Para quien ya tiene usuario en otro proyecto: entra con el mismo email y contraseña y elige el proyecto en el selector.</p>
      <Desplegable className="campo" value={elegido} onChange={(e) => setElegido(e.target.value)}>
        <option value="">Elige una persona…</option>
        {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </Desplegable>
      <Mensajes error={error} ok={ok} />
      <button className="btn-primario w-full" disabled={!elegido || pendiente} onClick={() => ejecutar(async () => { await anadirAlProyecto(elegido); setElegido(""); }, `Añadida a ${proyecto}`)}>
        Añadir a {proyecto}
      </button>
    </div>
  );
}
