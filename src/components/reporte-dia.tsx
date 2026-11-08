"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { esError } from "@/lib/resultado";
import { reporteAlEntrar } from "@/app/(panel)/avisos-acciones";

// Ventana del CEO al entrar: leads y agendas de ayer. La acción decide si toca (una vez al día) y si es CEO.
export function ReporteDia() {
  const [r, setR] = useState<{ dia: string; leads: number; agendas: number } | null>(null);
  const pedido = useRef(false);
  useEffect(() => {
    if (pedido.current) return;
    pedido.current = true;
    reporteAlEntrar().then((x) => x && !esError(x) && setR(x));
  }, []);
  if (!r) return null;
  const [a, m, d] = r.dia.split("-");
  return (
    <Modal titulo={`Ayer, ${d}/${m}/${a}`} onCerrar={() => setR(null)}>
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl bg-panel-2 p-4"><div className="text-3xl font-semibold">{r.leads}</div><div className="text-xs text-texto-3">Leads que entraron</div></div>
        <div className="rounded-xl bg-panel-2 p-4"><div className="text-3xl font-semibold">{r.agendas}</div><div className="text-xs text-texto-3">Citas agendadas</div></div>
      </div>
      <button onClick={() => setR(null)} className="btn btn-primario mt-4 w-full">Entendido</button>
    </Modal>
  );
}
