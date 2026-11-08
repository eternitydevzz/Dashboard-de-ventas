import { redirect } from "next/navigation";
import { esJefe } from "@/lib/auth";
import { exigirPagina } from "@/lib/permisos";
import { db, todas } from "@/lib/datos";
import { agruparDuplicados } from "@/lib/duplicados";
import { Cabecera, Contenido } from "@/components/ui";
import { ListaDuplicados, type LeadDup } from "./lista";

// D2 (plan GHL 4.3): posibles duplicados por teléfono, con el botón «Unir» (nada automático). Solo jefes.
export default async function DuplicadosPage() {
  const { perfil, proyecto } = await exigirPagina("crm");
  if (!esJefe(perfil)) redirect("/");
  const leads = await todas<LeadDup>((a, b) =>
    db().from("leads").select("id, nombre, apellido, email, telefono, ghl_contact_id, creado_en").eq("proyecto_id", proyecto.id).not("telefono", "is", null).order("id").range(a, b)
  );
  const grupos = agruparDuplicados(leads);
  return (
    <>
      <Cabecera titulo="Duplicados" subtitulo={`${proyecto.nombre} · mismo teléfono (últimas 9 cifras) · ${grupos.length} ${grupos.length === 1 ? "grupo" : "grupos"}`} />
      <Contenido>
        <ListaDuplicados grupos={grupos} />
      </Contenido>
    </>
  );
}
