import { ZONAS, conZona, zonaValida } from "@/app/(panel)/perfil/foto-zona";
import { localAIso } from "@/lib/formato";
import { enZona } from "@/lib/horarios";
import type { Proyecto } from "@/lib/tipos";

// N2 (Cristian, 13 nov 2026): cada caller y closer ve las HORAS en su zona; periodos, KPIs, objetivos, comisiones
// y finanzas siguen en la del proyecto. Los jefes, como hoy. Solo para pintar horas (y leer las que escribe la persona).
// shortcut: el tipo Proyecto["zona_horaria"] de tipos.ts solo lista 2 zonas; quitar el «as» cuando lo amplíen
export function zonaPersona(perfil: { rol: string; zona_horaria?: string | null }, proyecto: { zona_horaria: string }) {
  return ((conZona(perfil.rol) && zonaValida(perfil.zona_horaria)) || proyecto.zona_horaria) as Proyecto["zona_horaria"];
}

export const nombreZona = (zona: string) => ZONAS.find((z) => z.v === zona)?.t ?? zona;

// Huecos libres (en hora del proyecto) vistos en la zona de quien agenda: `t` es lo que ve y `v` lo que se envía,
// «AAAA-MM-DDTHH:MM» en hora del proyecto (agendarCita lo sigue leyendo así, igual que el MCP y la ventana de jefes).
export function huecosEnZona(dias: { ymd: string; horas: string[] }[], zonaProyecto: string, zonaVer: string) {
  const salida: { ymd: string; horas: { t: string; v: string }[] }[] = [];
  for (const d of dias) {
    for (const h of d.horas) {
      const v = `${d.ymd}T${h}`;
      const p = enZona(new Date(localAIso(v, zonaProyecto)), zonaVer);
      const ultimo = salida[salida.length - 1];
      if (ultimo?.ymd === p.ymd) ultimo.horas.push({ t: p.hm, v });
      else salida.push({ ymd: p.ymd, horas: [{ t: p.hm, v }] });
    }
  }
  return salida;
}
