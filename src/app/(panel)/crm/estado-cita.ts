import { ABIERTAS } from "@/lib/llamadas";

// N11 (Cristian, 13 nov 2026: «Todas, que se pueda filtrar»): filtro por estado del tablero «Closers» del CRM, con las
// mismas opciones que el de Agendas (closer/llamadas/page.tsx, FILTROS_ESTADO, que no se exporta: si cambia allí, aquí también)
export const FILTROS_CITA = [
  { v: "", t: "Todos los estados" },
  { v: "abiertas", t: "Pendientes" },
  { v: "cerrada", t: "Cerradas" },
  { v: "perdida", t: "Perdidas" },
  { v: "no_show", t: "No-show" },
  { v: "reagendada", t: "Reagendadas" },
  { v: "cancelada", t: "Canceladas" },
];

export const pasaFiltroCita = (estado: string, filtro: string) =>
  !filtro || (filtro === "abiertas" ? (ABIERTAS as readonly string[]).includes(estado) : estado === filtro);
