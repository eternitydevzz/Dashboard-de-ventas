import { Insignia } from "@/components/ui";
import { FiltroUrl } from "@/components/barra-periodo";
import { OPCIONES_FILTRO_MERCADO, type Mercado } from "@/lib/mercado";

// Cristian (13 nov): «ES» o «LATAM» junto al nombre de cada caller y closer
export function EtiquetaMercado({ m }: { m?: Mercado | null }) {
  return <Insignia tono={m === "es" ? "aviso" : "neutro"}>{m === "es" ? "ES" : "LATAM"}</Insignia>;
}

// «Todos / España / Latam» para los jefes, en la URL (?mercado=), como los otros filtros
export function FiltroMercado() {
  return <FiltroUrl nombre="mercado" etiqueta="Mercado" todos="Todos los mercados" opciones={OPCIONES_FILTRO_MERCADO} />;
}
