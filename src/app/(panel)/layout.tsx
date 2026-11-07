import { redirect } from "next/navigation";
import { getSesion, esJefe, puedeAdmin } from "@/lib/auth";
import { BarraLateral, type ItemMenu } from "@/components/barra-lateral";
import { ProveedorToasts } from "@/components/toasts";
import { Dialogos } from "@/components/dialogos";
import { AvisosEnVivo } from "@/components/avisos-en-vivo";
import { proyectoParaMenu } from "@/lib/formato";
import { seccionesPermitidas, SECCIONES, type Seccion } from "@/lib/permisos";

// Cristian (13 oct 2026): «Llamadas de GHL» oculto en el menú para todos; se retomará más adelante (ver plan).
// La página sigue existiendo (/caller/grabadas); para volver a enseñarla, poner true.
const LLAMADAS_GHL_VISIBLE = false;

export default async function PanelLayout({ children }: LayoutProps<"/">) {
  const { perfil, proyectos, proyecto } = await getSesion();

  // Onboarding obligatorio la primera vez (la página /onboarding está fuera de este layout)
  if (!perfil.onboarding_completo) redirect("/onboarding");

  const jefe = esJefe(perfil);

  // C11 (plan Callers, 7 nov, punto 11): sin número rojo de llamadas vencidas (ya no hay fechas). Una consulta menos.
  const secciones = await seccionesPermitidas(perfil, proyecto.id);
  const tiene = (x: Seccion) => secciones.has(x);
  const empresa: ItemMenu[] = SECCIONES.filter((s) => secciones.has(s.v)).map((s) => ({ href: `/${s.v}`, texto: s.t, icono: s.v }));
  const menu: { grupo: string; items: ItemMenu[] }[] = [
    {
      grupo: "Ventas",
      // Paso H5: cada entrada sale solo si la persona tiene esa sección (por su rol o por su ficha)
      items: [
        // H8: «Mi Funnel» (a un caller o closer con «Funnel», es lo mismo: sus números)
        ...(!jefe && (tiene("mi_funnel") || tiene("funnel")) ? [{ href: "/mi-funnel", texto: "Mi Funnel", icono: "funnel" as const }] : []),
        // 26 oct 2026 (Cristian): el Funnel es una pestaña de KPIs; un jefe con solo «Funnel» entra por aquí
        ...(tiene("kpis") || (jefe && tiene("funnel")) ? [{ href: "/kpis", texto: jefe ? "KPIs" : "Mis KPIs", icono: "kpis" as const }] : []),
        // H7: un solo CRM («Mi CRM» para caller y closer, con sus leads)
        ...(tiene("crm") ? [{ href: "/crm", texto: jefe ? "CRM" : "Mi CRM", icono: "crm" as const }] : []),
        ...(tiene("cola") ? [{ href: "/caller", texto: jefe ? "Callers" : "Mis leads", icono: "caller" as const, exacto: true }] : []),
        ...(tiene("agendas") ? [{ href: "/closer", texto: jefe ? "Agendas" : "Mis agendas", icono: "closer" as const }] : []),
        // Bloque 7 de 1.0: onboarding de los clientes de cada closer (aparte del onboarding de Clientes)
        ...(tiene("agendas") && (jefe || perfil.rol === "closer") ? [{ href: "/onboarding-closers", texto: jefe ? "Onboarding closers" : "Onboarding", icono: "onboarding" as const }] : []),
        ...(LLAMADAS_GHL_VISIBLE && tiene("grabadas") ? [{ href: "/caller/grabadas", texto: jefe ? "Llamadas de GHL" : "Mis llamadas grabadas", icono: "grabadas" as const }] : []),
        ...(tiene("ventas") ? [{ href: "/ventas", texto: jefe ? "Ventas" : "Mis ventas", icono: "ventas" as const }] : []),
        ...(tiene("ranking") ? [{ href: "/ranking", texto: "Ranking del equipo", icono: "ranking" as const }] : []),
      ],
    },
    {
      grupo: "Día a día",
      items: [
        ...(tiene("recursos") ? [{ href: "/recursos", texto: "Links y recursos", icono: "recursos" as const }] : []),
        // C9 (plan Callers, 7 nov): manuales de ventas, dentro de la app
        ...(tiene("manuales") ? [{ href: "/manuales", texto: "Manuales", icono: "manuales" as const }] : []),
        ...(tiene("reportes") ? [{ href: "/reportes", texto: "Reportes", icono: "reportes" as const }] : []),
        // Fase 6: el guion de llamada lo editan el CEO y los directores (callers y closers lo ven al pulsar «Llamar»)
        ...(jefe ? [{ href: "/guiones", texto: "Guiones", icono: "guiones" as const }] : []),
      ],
    },
    ...(empresa.length ? [{ grupo: "Empresa", items: empresa }] : []),
    ...(puedeAdmin(perfil)
      ? [{ grupo: "Gestión", items: [{ href: "/admin", texto: "Administración", icono: "admin" as const }] }]
      : []),
  ].filter((g) => g.items.length > 0);


  return (
    <ProveedorToasts>
      <div className="flex min-h-screen">
        <BarraLateral perfil={perfil} proyectos={proyectos.map(proyectoParaMenu)} proyecto={proyectoParaMenu(proyecto)} menu={menu} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <Dialogos />
      <AvisosEnVivo proyectoId={proyecto.id} />
      {/* 25 oct 2026: bienvenida apagada (solo esperaba a la precarga de todas las secciones, también apagada) */}
    </ProveedorToasts>
  );
}
