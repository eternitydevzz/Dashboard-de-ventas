import { redirect } from "next/navigation";

// Cristian (13 oct): Agendas sin «Métricas»; /closer queda solo para enlaces viejos
export default function AgendasPage() {
  redirect("/closer/llamadas");
}
