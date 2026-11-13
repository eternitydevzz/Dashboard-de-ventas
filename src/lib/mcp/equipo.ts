import "server-only";
import { randomBytes } from "node:crypto";
import { getSesion } from "@/lib/sesion";
import { exigir, puedeAdmin } from "@/lib/auth";
import { db, escribir } from "@/lib/datos";
import { ErrorUsuario, esError } from "@/lib/resultado";
import { mercadoValido } from "@/lib/mercado";
import type { Rol } from "@/lib/tipos";
import { crearMiembro } from "@/app/(panel)/equipo/acciones";
import { actualizarMiembro, enviarEnlaceMagico } from "@/app/(panel)/admin/acciones";
import { asignarLeads } from "@/app/(panel)/crm/acciones";

// MCP (Cristian, 13 nov 2026): crear, dar de baja y borrar personas del equipo desde Claude Code. Usan las mismas
// acciones que la pantalla Equipo y Administración (permisos y validaciones de la app). Nadie ve contraseñas: la cuenta
// se crea con una al azar que no se devuelve y a la persona le llega el email con el enlace para crear la suya.

const exigirOk = <T>(r: T) => {
  if (r && typeof r === "object" && "error" in r) throw new ErrorUsuario(String((r as { error: unknown }).error));
  return r;
};

// Por nombre (sin distinguir mayúsculas) o id. Con dos del mismo nombre, no elige.
async function elegir<T extends { id: string; nombre: string }>(lista: T[], quien: string, que: string): Promise<T> {
  const q = quien.trim().toLowerCase();
  const hay = lista.filter((x) => x.id === quien.trim() || x.nombre.trim().toLowerCase() === q);
  if (hay.length === 1) return hay[0];
  if (hay.length > 1) throw new ErrorUsuario(`Hay ${hay.length} ${que} con ese nombre: ${hay.map((x) => `${x.nombre} (${x.id})`).join(", ")}. Di cuál.`);
  throw new ErrorUsuario(`No hay ningún ${que.replace(/s$/, "")} «${quien}». Los que hay: ${lista.map((x) => x.nombre).join(", ") || "ninguno"}.`);
}

async function personasDelProyecto(proyectoId: string) {
  const { data, error } = await db().from("miembros_proyecto").select("perfil_id, perfiles!inner(nombre, email, rol, activo)").eq("proyecto_id", proyectoId);
  if (error) throw new Error(`No se pudo leer el equipo: ${error.message}`);
  return (data ?? []).map((m) => {
    const p = m.perfiles as unknown as { nombre: string; email: string; rol: Rol; activo: boolean };
    return { id: m.perfil_id as string, ...p };
  });
}

export type ArgsCrearMiembro = { nombre: string; email: string; telefono: string; rol: string; mercado: string; area?: string; confirmar?: boolean };

export async function herramientaCrearMiembro(a: ArgsCrearMiembro) {
  const { proyecto } = await getSesion();
  const rol = a.rol as Rol;
  if (!["caller", "closer", "director", "ceo"].includes(rol)) throw new ErrorUsuario("Rol no válido. Usa: caller, closer, director o ceo.");
  const mercado = mercadoValido(a.mercado);
  if (!mercado) throw new ErrorUsuario("El país tiene que ser «es» (España) o «latam».");
  const [{ data: areas }, { data: puestos }, { data: usos }] = await Promise.all([
    db().from("areas").select("id, nombre").eq("proyecto_id", proyecto.id),
    db().from("puestos").select("id, nombre, rol_base").eq("proyecto_id", proyecto.id).eq("rol_base", rol),
    db().from("miembros_equipo").select("puesto_id").eq("proyecto_id", proyecto.id).not("puesto_id", "is", null),
  ]);
  // Área: la que digan; si no, «Ventas» (donde están callers y closers)
  const area = a.area ? await elegir(areas ?? [], a.area, "áreas") : (areas ?? []).find((x) => x.nombre.trim().toLowerCase() === "ventas") ?? null;
  // Puesto: el de su rol que más gente tiene (hay puestos repetidos con el mismo nombre)
  const veces = (id: string) => (usos ?? []).filter((u) => u.puesto_id === id).length;
  const puesto = [...(puestos ?? [])].sort((x, y) => veces(y.id) - veces(x.id))[0] ?? null;
  const resumen = { nombre: a.nombre.trim(), email: a.email.trim().toLowerCase(), telefono: a.telefono.trim(), rol, pais: mercado === "es" ? "España" : "Latam", area: area?.nombre ?? "Sin área", puesto: puesto?.nombre ?? "Sin puesto", proyecto: proyecto.nombre };
  if (!a.confirmar) return { vistaPrevia: true as const, crearia: resumen, acceso: "Se le manda un email con un enlace (24 h) para entrar y crear su contraseña.", paraHacerlo: "No se ha creado nada. Si está bien, vuelve a llamar igual con confirmar: true." };

  // Contraseña al azar que no se guarda ni se devuelve: la persona crea la suya con el enlace
  const password = randomBytes(24).toString("base64url");
  exigirOk(await crearMiembro({ nombres: [resumen.nombre], area_id: area?.id ?? null, puesto_id: puesto?.id ?? null, comision: null, acceso: { modo: "crear", email: resumen.email, password, rol, mercado, telefono: resumen.telefono }, lider: false }));
  const { data: nuevo } = await db().from("perfiles").select("id").eq("email", resumen.email).single();
  const enlace = await enviarEnlaceMagico(nuevo!.id);
  return { creado: resumen, id: nuevo!.id, email: esError(enlace) ? `Creado, pero NO se pudo mandar el email: ${enlace.error}. Mándalo desde su ficha («Enviar enlace mágico»).` : `Email con el enlace enviado a ${resumen.email}.` };
}

export type ArgsBaja = { persona: string; leadsA?: string; confirmar?: boolean };

// Dar de baja (reversible) o borrar del todo (irreversible). Antes, sus leads van a quien diga Cristian o a nadie.
async function prepararSalida(a: ArgsBaja, borrar: boolean) {
  const { perfil, proyecto } = await exigir(puedeAdmin);
  if (perfil.rol !== "ceo") throw new ErrorUsuario("Solo el CEO da de baja o borra a alguien (afecta a todos sus proyectos).");
  const gente = await personasDelProyecto(proyecto.id);
  const p = await elegir(gente, a.persona, "personas");
  if (p.id === perfil.id) throw new ErrorUsuario("No puedes darte de baja ni borrarte a ti mismo.");
  if (p.rol === "ceo") throw new ErrorUsuario("A un CEO no se le da de baja ni se le borra desde aquí.");
  const [{ data: comoCaller }, { data: comoCloser }, { count: proyectos }] = await Promise.all([
    db().from("leads").select("id").eq("proyecto_id", proyecto.id).eq("caller_id", p.id),
    db().from("leads").select("id").eq("proyecto_id", proyecto.id).eq("closer_id", p.id),
    db().from("miembros_proyecto").select("perfil_id", { count: "exact", head: true }).eq("perfil_id", p.id),
  ]);
  if (borrar && (proyectos ?? 0) > 1) throw new ErrorUsuario(`${p.nombre} está en ${proyectos} proyectos. Borrarla la quitaría de todos: dala de baja en su lugar.`);
  const callerIds = (comoCaller ?? []).map((l) => l.id);
  const closerIds = (comoCloser ?? []).map((l) => l.id);
  const total = callerIds.length + closerIds.length;
  // Cristian (13 nov): con leads, no se hace nada hasta que diga a quién van («nadie» = sin asignar)
  if (total && !a.leadsA) throw new ErrorUsuario(`${p.nombre} tiene ${total} leads (${callerIds.length} como caller, ${closerIds.length} como closer). Di a quién pasarlos con leadsA (nombre o id), o «nadie» para dejarlos sin asignar. No se ha cambiado nada.`);
  const nadie = !a.leadsA || a.leadsA.trim().toLowerCase() === "nadie";
  const destino = nadie ? null : await elegir(gente.filter((g) => g.activo && g.id !== p.id && (callerIds.length ? g.rol === "caller" : true) && (closerIds.length ? g.rol === "closer" : true)), a.leadsA!, callerIds.length && closerIds.length ? "personas que sean caller y closer" : callerIds.length ? "callers" : "closers");
  return { p, callerIds, closerIds, total, destino };
}

async function moverLeads(s: Awaited<ReturnType<typeof prepararSalida>>) {
  const a = s.destino?.id ?? null;
  if (s.callerIds.length) exigirOk(await asignarLeads(s.callerIds, a, undefined));
  if (s.closerIds.length) exigirOk(await asignarLeads(s.closerIds, undefined, a));
}

const textoLeads = (s: Awaited<ReturnType<typeof prepararSalida>>) => (s.total ? `${s.total} leads → ${s.destino?.nombre ?? "sin asignar"}` : "No tiene leads");

export async function herramientaDarDeBaja(a: ArgsBaja) {
  const s = await prepararSalida(a, false);
  if (!a.confirmar) return { vistaPrevia: true as const, daria_de_baja: `${s.p.nombre} (${s.p.rol}, ${s.p.email})`, leads: textoLeads(s), efecto: "No podrá entrar, sale del equipo y pasa a «Ver inactivos». Se conserva su historial. Se puede deshacer.", paraHacerlo: "No se ha cambiado nada. Si está bien, vuelve a llamar igual con confirmar: true." };
  await moverLeads(s);
  exigirOk(await actualizarMiembro(s.p.id, { activo: false }));
  const { proyecto } = await getSesion();
  await escribir(db().from("miembros_equipo").update({ activo: false }).eq("proyecto_id", proyecto.id).eq("perfil_id", s.p.id), "miembros_equipo");
  return { dadoDeBaja: s.p.nombre, leads: textoLeads(s) };
}

export async function herramientaBorrarMiembro(a: ArgsBaja) {
  const s = await prepararSalida(a, true);
  if (!a.confirmar) return { vistaPrevia: true as const, borraria_para_siempre: `${s.p.nombre} (${s.p.rol}, ${s.p.email})`, leads: textoLeads(s), efecto: "Borra su cuenta y su sitio en el equipo. Sus llamadas, citas y ventas se quedan sin la persona que las hizo. NO se puede deshacer.", paraHacerlo: "No se ha cambiado nada. Si está bien, vuelve a llamar igual con confirmar: true." };
  await moverLeads(s);
  const { proyecto } = await getSesion();
  await escribir(db().from("miembros_equipo").delete().eq("proyecto_id", proyecto.id).eq("perfil_id", s.p.id), "miembros_equipo");
  // El perfil y su sitio en el proyecto se borran con el usuario (on delete cascade)
  const { error } = await db().auth.admin.deleteUser(s.p.id);
  if (error) throw new Error(`No se pudo borrar la cuenta: ${error.message}`);
  return { borrado: s.p.nombre, leads: textoLeads(s) };
}
