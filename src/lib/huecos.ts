import { libreA, type AjustesCalendario } from "@/lib/disponibilidad";
import { enZona, tramosDelDia, type Horario } from "@/lib/horarios";
import { localAIso } from "@/lib/formato";

// Ventana de «Agendado» como la maqueta (plan Callers 7c.3; Cristian, 7 nov: «las horas libres del closer»).
// Recorre los próximos días y devuelve, por día, las horas en las que el closer está libre según libreA (su horario,
// sus otras citas con la duración y el descanso, el aviso mínimo y el máximo del día). Una hora cada «duración».
// Sin base de datos: los datos los pone quien llama (leads/agenda.ts).
const minutos = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const sumarDias = (ymd: string, n: number) => new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10) + n)).toISOString().slice(0, 10);

export function huecosLibres(o: { horario: Horario; ajustes: AjustesCalendario; citas: string[]; ahora: Date; zona: string; dias: number }) {
  if (!o.horario) return [];
  const hoy = enZona(o.ahora, o.zona).ymd;
  const salida: { ymd: string; horas: string[] }[] = [];
  for (let n = 0; n < o.dias; n++) {
    const ymd = sumarDias(hoy, n);
    const dia = enZona(new Date(`${ymd}T12:00:00Z`), "UTC").dia;
    const horas: string[] = [];
    for (const t of tramosDelDia(o.horario, ymd, dia)) {
      for (let m = minutos(t.desde); m + o.ajustes.duracion <= minutos(t.hasta); m += o.ajustes.duracion) {
        const inicio = new Date(localAIso(`${ymd}T${hm(m)}`, o.zona));
        if (libreA({ horario: o.horario, ajustes: o.ajustes, citas: o.citas, inicio, ahora: o.ahora, zona: o.zona }).libre) horas.push(hm(m));
      }
    }
    if (horas.length) salida.push({ ymd, horas });
  }
  return salida;
}
