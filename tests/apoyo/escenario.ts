// Crea un proyecto de prueba aislado en la base de datos LOCAL y lo borra al terminar.
// Todo lo que crea lleva el prefijo TEST-AUTO para no tocar nunca los datos reales.
import { vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getSesion } from "@/lib/sesion";
import type { Perfil, Proyecto, Rol } from "@/lib/tipos";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!url || !(url.includes("127.0.0.1") || url.includes("localhost"))) {
  throw new Error("Los tests de integración solo se ejecutan contra Supabase LOCAL.");
}
export const db = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
export const PASSWORD = "Test-auto-2026!";

export type Escenario = Awaited<ReturnType<typeof crearEscenario>>;

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, que: string): Promise<T> {
  const { data, error } = await p;
  if (error || data === null) throw new Error(`${que}: ${error?.message ?? "sin datos"}`);
  return data;
}

export async function crearEscenario() {
  const id = Math.random().toString(36).slice(2, 8);
  const pref = `test-auto-${id}`;
  try {
    return await montar(id, pref);
  } catch (err) {
    // Si falla a medias, no dejar restos en la base de datos
    await borrarEscenario({ id, pref });
    throw err;
  }
}

async function montar(id: string, pref: string) {
  const [proyecto] = await must(db.from("proyectos").insert({ nombre: `TEST-AUTO ${id}` }).select(), "proyecto");

  const crear = async (clave: string, rol: Rol, extra: Partial<Perfil> = {}) => {
    const email = `${pref}-${clave}@eternity.test`;
    const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw new Error(`usuario ${clave}: ${error.message}`);
    const [perfil] = await must(
      db.from("perfiles").insert({ id: data.user.id, nombre: `Test ${clave}`, email, rol, onboarding_completo: true, ...extra }).select(),
      `perfil ${clave}`
    );
    return perfil as Perfil;
  };
  const p = {
    ceo: await crear("ceo", "ceo"),
    director: await crear("director", "director"),
    directorAdmin: await crear("diradmin", "director", { admin_activo: true }),
    closerA: await crear("closera", "closer"),
    closerB: await crear("closerb", "closer"),
    callerA: await crear("callera", "caller"),
    callerB: await crear("callerb", "caller"),
    callerC: await crear("callerc", "caller"),
  };
  const orden = [p.ceo, p.director, p.directorAdmin, p.closerA, p.closerB, p.callerA, p.callerB, p.callerC];
  const { error: errMiembros } = await db.from("miembros_proyecto").insert(orden.map((x, i) => ({ proyecto_id: proyecto.id, perfil_id: x.id, orden: i })));
  if (errMiembros) throw new Error(`miembros: ${errMiembros.message}`);

  const [pipeline] = await must(db.from("pipelines").insert({ proyecto_id: proyecto.id, nombre: "Pipeline test", orden: 0 }).select(), "pipeline");
  const etapas = await must(
    db.from("etapas").insert(["Nuevos", "Agendados", "Cerrados", "Descartados"].map((n, i) => ({ pipeline_id: pipeline.id, nombre: n, orden: i }))).select(),
    "etapas"
  );
  const productos = await must(
    db.from("productos").insert([
      { proyecto_id: proyecto.id, nombre: "Low ticket", precio: 47, vende_caller: true, orden: 0 },
      { proyecto_id: proyecto.id, nombre: "Mentoría grupal", precio: 1997, vende_caller: false, orden: 1 },
    ]).select(),
    "productos"
  );
  const nuevos = etapas.find((e) => e.nombre === "Nuevos")!;
  const leads = await must(
    db.from("leads").insert([
      { proyecto_id: proyecto.id, nombre: "LeadA", email: `${pref}-la@x.test`, caller_id: p.callerA.id, pipeline_id: pipeline.id, etapa_id: nuevos.id },
      { proyecto_id: proyecto.id, nombre: "LeadB", email: `${pref}-lb@x.test`, caller_id: p.callerB.id, pipeline_id: pipeline.id, etapa_id: nuevos.id },
      { proyecto_id: proyecto.id, nombre: "LeadLibre", email: `${pref}-ll@x.test`, pipeline_id: pipeline.id, etapa_id: nuevos.id },
    ]).select(),
    "leads"
  );
  return {
    id,
    pref,
    proyecto: proyecto as Proyecto,
    p,
    pipeline,
    etapas: Object.fromEntries(etapas.map((e) => [e.nombre, e.id])) as Record<string, string>,
    productos: Object.fromEntries(productos.map((x) => [x.nombre, x.id])) as Record<string, string>,
    leads: Object.fromEntries(leads.map((l) => [l.nombre, l.id])) as Record<string, string>,
  };
}

// A partir de aquí, las acciones se ejecutan «como» esta persona
export function como(e: Escenario, perfil: Perfil) {
  vi.mocked(getSesion).mockResolvedValue({ perfil, proyectos: [e.proyecto], proyecto: e.proyecto });
}

export async function borrarEscenario(e: Pick<Escenario, "id" | "pref">) {
  await db.from("proyectos").delete().like("nombre", `TEST-AUTO ${e.id}%`);
  // Usuarios creados por el escenario o por los tests (mismo prefijo)
  const { data } = await db.from("perfiles").select("id").like("email", `${e.pref}%`);
  for (const u of data ?? []) await db.auth.admin.deleteUser(u.id);
}

export function formulario(campos: Record<string, string>) {
  const fd = new FormData();
  Object.entries(campos).forEach(([k, v]) => fd.set(k, v));
  return fd;
}

// Las acciones devuelven { error } en vez de lanzar (para que en producción se vea el mensaje).
export async function falla(promesa: Promise<unknown>, patron?: RegExp) {
  const r = (await promesa) as { error?: unknown } | undefined;
  if (!r || typeof r.error !== "string") throw new Error(`Se esperaba un error y la acción fue bien: ${JSON.stringify(r)}`);
  if (patron && !patron.test(r.error)) throw new Error(`Error inesperado: «${r.error}» no encaja con ${patron}`);
}
export async function ok<T>(promesa: Promise<T>): Promise<Exclude<T, { error: string }>> {
  const r = await promesa;
  if (r && typeof r === "object" && "error" in r) throw new Error(`La acción falló: ${(r as { error: string }).error}`);
  return r as Exclude<T, { error: string }>;
}

// C11 (7 nov): sin «Link enviado». Simula una cita que llega de GHL, como la crea el webhook: a nombre del caller del
// lead (punto 10) y con las estrellas que el caller puso en «Seguimiento».
export async function agendaPorLink(e: Escenario, leadId: string, caller: Perfil, closerId: string, fechaLocal: string, estrellas = 4) {
  const { registrarLlamada } = await import("@/app/(panel)/leads/acciones");
  const { datosAgendaGhl } = await import("@/lib/leads");
  const { localAIso } = await import("@/lib/formato");
  como(e, caller);
  await ok(registrarLlamada(leadId, "seguimiento", "", estrellas));
  const { data, error } = await db
    .from("citas")
    .insert({ proyecto_id: e.proyecto.id, lead_id: leadId, closer_id: closerId, fecha: localAIso(fechaLocal, e.proyecto.zona_horaria), origen: "ghl", ...(await datosAgendaGhl(leadId)) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await db.from("leads").update({ estado_caller: "agendado", closer_id: closerId, llamar_en: null }).eq("id", leadId);
  return data.id as string;
}
