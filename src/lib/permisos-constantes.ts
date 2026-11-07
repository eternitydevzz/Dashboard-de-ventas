// Listas fijas de permisos (Paso H5). Sin «server-only»: las usan también las pantallas de Administración.

export const SECCIONES_TODAS = [
  { v: "funnel", t: "Funnel", d: "Pestaña Funnel de KPIs: cifras del equipo (a un caller o closer, «Mi Funnel»)", grupo: "Ventas" },
  { v: "mi_funnel", t: "Mi Funnel", d: "Sus números y sus objetivos", grupo: "Ventas" },
  { v: "kpis", t: "KPIs", d: "KPIs y objetivos (a un caller o closer, solo los suyos)", grupo: "Ventas" },
  { v: "crm", t: "CRM", d: "Leads por columnas (cada uno ve los suyos)", grupo: "Ventas" },
  { v: "cola", t: "Mis leads / Callers", d: "Cola de llamadas (a un closer, sus leads como closer)", grupo: "Ventas" },
  { v: "agendas", t: "Agendas", d: "Citas, pre-call, post-call y análisis (a un caller, las que agendó, solo mirar)", grupo: "Ventas" },
  { v: "grabadas", t: "Llamadas grabadas", d: "Llamadas de GHL (cada uno las suyas)", grupo: "Ventas" },
  { v: "ventas", t: "Ventas", d: "Ventas y cobros (a un caller, las suyas)", grupo: "Ventas" },
  { v: "ranking", t: "Ranking del equipo", d: "Clasificación de callers y closers", grupo: "Ventas" },
  { v: "recursos", t: "Links y recursos", d: "Links de pago, PDF, guiones y vídeos", grupo: "Día a día" },
  { v: "reportes", t: "Reportes", d: "Reporte de fin de día", grupo: "Día a día" },
  // C9 (plan Callers, 7 nov): manuales de ventas en .html; los ve todo el mundo, los cambian CEO y directores
  { v: "manuales", t: "Manuales", d: "Manuales de ventas (los cambian el CEO y los directores)", grupo: "Día a día" },
  { v: "equipo", t: "Equipo", d: "Organigrama, altas y comisiones", grupo: "Empresa" },
  { v: "programas", t: "Programas", d: "Productos, precios y comisiones (a un caller o closer, solo mirar)", grupo: "Empresa" },
  { v: "finanzas", t: "Finanzas", d: "Facturación, cobros, gastos, liquidaciones", grupo: "Empresa" },
  { v: "clientes", t: "Clientes", d: "Quién ha comprado (a un caller o closer, los suyos)", grupo: "Empresa" },
] as const;
export type Seccion = (typeof SECCIONES_TODAS)[number]["v"];

// Las de «Empresa» (V2-8): el menú las agrupa aparte
export const SECCIONES = SECCIONES_TODAS.filter((s) => s.grupo === "Empresa");

export const ROLES_PERMISO = ["director", "closer", "caller"] as const;
export type RolPermiso = (typeof ROLES_PERMISO)[number];

// Lo que cada rol tenía antes del H5 (lo de siempre)
export const DEFECTO: Record<"ceo" | RolPermiso, Set<Seccion>> = {
  ceo: new Set(SECCIONES_TODAS.map((s) => s.v)),
  director: new Set<Seccion>(["funnel", "kpis", "crm", "cola", "agendas", "grabadas", "ventas", "ranking", "recursos", "reportes", "manuales"]),
  // 1.0 (Cristian, 11 oct): «Llamadas de GHL» (grabadas) fuera por defecto para closers y callers hasta que esté
  // configurado; se abre por persona (los 2 perfiles de prueba) o por rol en Permisos
  closer: new Set<Seccion>(["mi_funnel", "crm", "agendas", "ventas", "ranking", "recursos", "reportes", "manuales"]),
  caller: new Set<Seccion>(["mi_funnel", "crm", "cola", "ranking", "recursos", "reportes", "manuales"]),
};

// Nunca (decisión de Cristian): Equipo y Finanzas a callers y closers; «Mi Funnel» no aplica a director y CEO
export const NUNCA: Record<"ceo" | RolPermiso, Set<Seccion>> = {
  ceo: new Set(),
  director: new Set<Seccion>(["mi_funnel"]),
  closer: new Set<Seccion>(["equipo", "finanzas"]),
  caller: new Set<Seccion>(["equipo", "finanzas"]),
};
