import { getSesion } from "@/lib/auth";
import { db } from "@/lib/datos";
import { ETIQUETA_ROL } from "@/lib/formato";
import { horarioValido } from "@/lib/horarios";
import { ajustesDe } from "@/lib/disponibilidad";
import { esCloser } from "@/lib/tipos";
import { Cabecera, Contenido, Seccion } from "@/components/ui";
import { EditorHorario } from "@/components/editor-horario";
import { FormMisDatos, FormMiMercado, FormMiPassword } from "./cliente";
import { leerMercado } from "@/lib/mercado-datos";

// «Mi perfil» (bloque 1 de 1.0): para todos. Datos, contraseña y, para callers y closers, su horario.
export default async function PerfilPage({ searchParams }: PageProps<"/perfil">) {
  const { perfil, proyecto } = await getSesion();
  const bienvenida = (await searchParams).bienvenida === "1"; // Fase 1: llega desde un enlace de entrar
  const conHorario = perfil.rol === "caller" || perfil.rol === "closer";
  const { data: miembro } = conHorario ? await db().from("miembros_proyecto").select("horario, calendario").eq("proyecto_id", proyecto.id).eq("perfil_id", perfil.id).maybeSingle() : { data: null };
  const mercado = await leerMercado(proyecto.id, perfil.id); // undefined = no es miembro o falta la migración
  const ajustes = esCloser(perfil) ? ajustesDe(proyecto.calendario, miembro?.calendario) : null;
  return (
    <>
      <Cabecera titulo="Mi perfil" subtitulo={<>{ETIQUETA_ROL[perfil.rol]} · {perfil.email}</>} />
      <Contenido>
        {bienvenida && <p className="rounded-lg bg-ok-suave px-3 py-2 text-sm text-ok">Ya has entrado. Si no recuerdas tu contraseña, crea una nueva aquí abajo («Cambiar mi contraseña»).</p>}
        <div className="grid gap-5 xl:grid-cols-2">
          <Seccion titulo="Mis datos">
            <FormMisDatos nombre={perfil.nombre} telefono={perfil.telefono ?? ""} whatsapp={perfil.whatsapp ?? ""} email={perfil.email} />
          </Seccion>
          <Seccion titulo="Cambiar mi contraseña">
            <FormMiPassword />
          </Seccion>
        </div>
        {mercado !== undefined && (
          <Seccion titulo={`Mi equipo · ${proyecto.nombre}`}>
            <FormMiMercado inicial={mercado} />
          </Seccion>
        )}
        {conHorario && (
          <Seccion titulo={perfil.rol === "closer" ? `Mi horario para recibir llamadas · ${proyecto.nombre}` : `Mi horario de trabajo · ${proyecto.nombre}`}>
            <EditorHorario inicial={horarioValido(miembro?.horario)} zona={proyecto.zona_horaria} perfilId={perfil.id} plantillas />
          </Seccion>
        )}
        {ajustes && (
          <Seccion titulo="Mis llamadas (los pone el administrador)">
            <ul className="grid gap-2 text-sm sm:grid-cols-4">
              <li className="rounded-lg bg-panel-2 p-3"><div className="text-xs text-texto-3">Duración</div><b>{ajustes.duracion} min</b></li>
              <li className="rounded-lg bg-panel-2 p-3"><div className="text-xs text-texto-3">Descanso tras cada llamada</div><b>{ajustes.descanso} min</b></li>
              <li className="rounded-lg bg-panel-2 p-3"><div className="text-xs text-texto-3">Aviso mínimo para agendar</div><b>{textoAviso(ajustes.aviso)}</b></li>
              <li className="rounded-lg bg-panel-2 p-3"><div className="text-xs text-texto-3">Máximo de llamadas al día</div><b>{ajustes.max_dia ?? "Sin máximo"}</b></li>
            </ul>
          </Seccion>
        )}
      </Contenido>
    </>
  );
}

function textoAviso(min: number) {
  if (!min) return "Sin aviso";
  if (min % 60) return `${min} min`;
  return `${min / 60} h`;
}
