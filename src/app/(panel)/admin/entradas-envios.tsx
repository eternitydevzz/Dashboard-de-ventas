"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useAccion } from "@/components/acciones-lead";
import { useToast } from "@/components/toasts";
import { fechaHora } from "@/lib/formato";
import type { EnvioEntrada } from "@/lib/entradas-datos";
import type { Proyecto } from "@/lib/tipos";
import { masEnviosEntrada, reintentarEnvioGhl } from "./acciones";

// Panel de endpoints (plan GHL, punto 0, Cristian 7 nov 2026): los envíos de cada Entrada.
// Los rojos salen siempre (sin límite) en su caja; abajo, los 15 últimos y «Ver más» de 50 en 50.

const quien = (x: EnvioEntrada) => String(x.payload?.email || x.payload?.phone || x.payload?.name || "—");

function ReintentarGhl({ eventoId }: { eventoId: string }) {
  const { pendiente, ejecutar } = useAccion();
  return (
    <button type="button" className="btn-secundario text-xs" disabled={pendiente} onClick={() => ejecutar(() => reintentarEnvioGhl(eventoId), "Se manda en la próxima lectura (menos de 1 min)")}>
      <RefreshCw className="h-3.5 w-3.5" /> Reintentar
    </button>
  );
}

// Caja roja: los envíos que no llegaron a GHL, aunque sean antiguos
export function EnviosEnRojo({ rojos, zona }: { rojos: EnvioEntrada[]; zona: Proyecto["zona_horaria"] }) {
  if (!rojos.length) return null;
  const personas = new Set(rojos.map((x) => x.lead_id ?? x.id)).size;
  return (
    <div className="mt-3 rounded-xl bg-mal-suave px-3 py-2.5 text-sm text-mal">
      <p className="font-semibold">{personas === 1 ? "1 lead no llegó a GHL" : `${personas} leads no llegaron a GHL`}</p>
      <ul className="mt-1.5 space-y-1.5">
        {rojos.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs opacity-80">{fechaHora(x.recibido_en, { zona_horaria: zona })}</span>
            <span className="min-w-0 break-words">{quien(x)}</span>
            <span className="min-w-0 flex-1 break-words text-xs">GHL lo rechazó {x.ghl_intentos ?? 0} veces: {x.ghl_error ?? "sin motivo"}</span>
            <ReintentarGhl eventoId={x.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Estado({ x }: { x: EnvioEntrada }) {
  if (!x.procesado) return <span className="text-mal">✗ {x.error ?? "No se guardó"}</span>;
  if (x.ghl_estado === "ok") return <span className="text-ok">✓ En GHL</span>;
  if (x.ghl_estado === "esperando") return <span className="text-texto-2">⏳ {x.ghl_intentos ? `Reintento ${x.ghl_intentos + 1} de 5 para GHL` : "Se manda a GHL en breve"}</span>;
  if (x.ghl_estado === "error") return <span className="text-mal">✗ No llegó a GHL</span>;
  return <span className="text-ok">✓ Guardado</span>;
}

export function UltimosEnvios({ entradaId, total, iniciales, zona }: { entradaId: string; total: number; iniciales: EnvioEntrada[]; zona: Proyecto["zona_horaria"] }) {
  const [extra, setExtra] = useState<EnvioEntrada[]>([]);
  const [cargando, iniciar] = useTransition();
  const toast = useToast();
  const lista = [...iniciales, ...extra.filter((x) => !iniciales.some((y) => y.id === x.id))];
  if (!lista.length) return <p className="mt-2 text-sm text-texto-3">Todavía no ha llegado ningún lead a esta dirección.</p>;
  const verMas = () =>
    iniciar(async () => {
      const r = await masEnviosEntrada(entradaId, lista.length);
      if ("error" in r && r.error) toast(r.error, "error");
      else if ("datos" in r) setExtra((xs) => [...xs, ...r.datos]);
    });
  return (
    <>
      <ul className="mt-2 space-y-1.5 text-sm">
        {lista.map((x) => (
          <li key={x.id} className="rounded-lg bg-panel-2">
            <details className="group">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
                <span className="text-xs text-texto-3">{fechaHora(x.recibido_en, { zona_horaria: zona })}</span>
                <span className="min-w-0 break-all">{quien(x)}</span>
                <Estado x={x} />
                {x.lead_id && <Link href={`/leads/${x.lead_id}`} className="ml-auto text-xs text-primario hover:underline">Ver lead</Link>}
              </summary>
              {x.ghl_estado === "esperando" && x.ghl_error && <p className="border-t border-borde px-3 py-2 text-xs text-texto-3">Último fallo: {x.ghl_error}</p>}
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all border-t border-borde p-3 text-xs">{JSON.stringify(x.payload, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ul>
      {lista.length < total && (
        <button type="button" className="btn-secundario mt-2 text-xs" disabled={cargando} onClick={verMas}>
          {cargando ? "Cargando…" : `Ver más (${lista.length} de ${total})`}
        </button>
      )}
    </>
  );
}
