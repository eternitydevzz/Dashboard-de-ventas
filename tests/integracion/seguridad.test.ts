// Seguridad: la base de datos no se puede leer «por detrás» con la clave pública,
// límites de intentos, tamaño del webhook y PDF falsos.
import { readdirSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { crearEscenario, borrarEscenario, como, db, formulario, ok, PASSWORD, type Escenario } from "../apoyo/escenario";
import { POST } from "@/app/api/webhooks/ghl/[proyectoId]/route";
import { crearRecurso, prepararSubidaPdf } from "@/app/(panel)/recursos/acciones";
import { subirDelFormulario } from "@/lib/subir-cliente";
import { limpiarSubidasHuerfanas } from "@/lib/subidas";
import { anotar, bloqueado, dentroDelLimite, reiniciarLimites } from "@/lib/limite";

const URL_DB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLICA = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
// S7-2: TODAS las tablas de las migraciones (63 el 17 nov); una tabla nueva entra sola en el test
const MIGRACIONES = new URL("../../supabase/migrations/", import.meta.url);
const TABLAS = [
  ...new Set(
    readdirSync(MIGRACIONES)
      .filter((f) => f.endsWith(".sql"))
      .flatMap((f) => [...readFileSync(new URL(f, MIGRACIONES), "utf8").matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+)/gi)].map((m) => m[1].toLowerCase()))
  ),
].sort();
// S7-3: todos los buckets, con un archivo dentro (en una carpeta propia para no estorbar a «PDF falso»)
const BUCKETS: [string, string, string][] = [
  ["recursos", "a.pdf", "application/pdf"],
  ["importaciones", "a.csv", "text/csv"],
  ["manuales", "a.html", "text/html"],
  ["grabaciones", "a.webm", "audio/webm"],
  ["fotos", "a.jpg", "image/jpeg"],
];
// RPC de dinero: solo el servidor (service_role) puede llamarlas
const RPC_DINERO = ["registrar_venta", "registrar_cobro", "cambiar_forma_pago", "recalcular_liquidaciones"];

let e: Escenario;
let carpeta: string;
beforeAll(async () => {
  e = await crearEscenario();
  carpeta = `rls-${e.id}`;
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
  for (const [b, f] of BUCKETS) await db.storage.from(b).remove([`${carpeta}/${f}`]);
});

// S7-2: una fila de verdad en las tablas sensibles (antes, 11 de las 18 estaban vacías y el test pasaba igual)
async function fila(p: PromiseLike<{ data: unknown; error: { message: string } | null }>, tabla: string) {
  const { data, error } = await p;
  if (error || !data) throw new Error(`sembrar ${tabla}: ${error?.message ?? "sin datos"}`);
  return data as { id: string };
}
async function sembrar() {
  const P = e.proyecto.id;
  const L = e.leads.LeadA;
  const venta = await fila(db.from("ventas").insert({ proyecto_id: P, lead_id: L, vendedor_id: e.p.closerA.id, facturacion: 100 }).select("id").single(), "ventas");
  await fila(db.from("pagos").insert({ venta_id: venta.id, importe: 50 }).select("id").single(), "pagos");
  await fila(db.from("citas").insert({ proyecto_id: P, lead_id: L, closer_id: e.p.closerA.id, agendada_por: e.p.callerA.id, fecha: "2037-01-05T15:00:00Z" }).select("id").single(), "citas");
  await fila(db.from("webhook_eventos").insert({ proyecto_id: P, payload: { email: "rls@x.test" } }).select("id").single(), "webhook_eventos");
  await fila(db.from("reportes").insert({ proyecto_id: P, perfil_id: e.p.callerA.id, rol: "caller", fecha: "2037-01-05", respuestas: {} }).select("id").single(), "reportes");
  await fila(db.from("actividades").insert({ proyecto_id: P, lead_id: L, perfil_id: e.p.callerA.id, tipo: "nota" }).select("id").single(), "actividades");
  await fila(db.from("claves_mcp").insert({ perfil_id: e.p.director.id, huella: randomBytes(32).toString("hex"), nombre: "rls" }).select("id").single(), "claves_mcp");
  await fila(db.from("cuentas_fathom").insert({ proyecto_id: P, perfil_id: e.p.closerA.id, nombre: "rls", api_key: "no-es-una-clave" }).select("id").single(), "cuentas_fathom");
  await fila(db.from("objetivos").insert({ proyecto_id: P, perfil_id: e.p.callerA.id, periodo: "dia", cifra: "llamadas", valor: 10 }).select("id").single(), "objetivos");
  await fila(db.from("grabaciones_caller").insert({ proyecto_id: P, lead_id: L, perfil_id: e.p.callerA.id, archivo_path: `${carpeta}/a.webm` }).select("id").single(), "grabaciones_caller");
  await fila(db.from("permisos_persona").insert({ proyecto_id: P, perfil_id: e.p.callerC.id, seccion: "grabadas", permitido: true }).select("perfil_id").single(), "permisos_persona"); // sin columna id: su clave es (proyecto, persona, sección)
  for (const [b, f, tipo] of BUCKETS) {
    const { error } = await db.storage.from(b).upload(`${carpeta}/${f}`, new Blob(["x"], { type: tipo }), { contentType: tipo, upsert: true });
    if (error) throw new Error(`subir a ${b}: ${error.message}`);
  }
}

describe("Base de datos cerrada (RLS)", () => {
  beforeAll(async () => {
    await sembrar();
  });
  it("la lista sale de las migraciones y la clave secreta sí ve las filas sembradas", async () => {
    expect(TABLAS.length).toBeGreaterThanOrEqual(63);
    expect(TABLAS).toEqual(expect.arrayContaining(["ventas", "pagos", "claves_mcp", "cuentas_fathom", "grabaciones_caller", "limite_intentos"]));
    // Sin esto, «la pública lee 0 filas» no demuestra nada: puede que no haya ninguna
    for (const t of ["leads", "perfiles", "proyectos", "ventas", "pagos", "citas", "webhook_eventos", "reportes", "actividades", "claves_mcp", "cuentas_fathom", "objetivos", "grabaciones_caller", "permisos_persona"]) {
      const { count, error } = await db.from(t).select("*", { count: "exact", head: true });
      expect(error, t).toBeNull();
      expect(count ?? 0, `tabla ${t} sin filas`).toBeGreaterThan(0);
    }
  });
  it("con la clave pública no se lee ninguna tabla ni se puede insertar", async () => {
    const anon = createClient(URL_DB, PUBLICA, { auth: { persistSession: false } });
    for (const t of TABLAS) {
      const { data } = await anon.from(t).select("*").limit(1);
      expect(data ?? [], `tabla ${t}`).toHaveLength(0);
    }
    const { error } = await anon.from("leads").insert({ proyecto_id: e.proyecto.id, nombre: "hack" });
    expect(error).not.toBeNull();
  });
  it("un usuario con sesión tampoco puede leer la base de datos directamente", async () => {
    const u = createClient(URL_DB, PUBLICA, { auth: { persistSession: false } });
    const { error: login } = await u.auth.signInWithPassword({ email: e.p.callerA.email, password: PASSWORD });
    expect(login).toBeNull();
    for (const t of TABLAS) {
      const { data } = await u.from(t).select("*").limit(1);
      expect(data ?? [], `tabla ${t}`).toHaveLength(0);
    }
    const { error } = await u.rpc("siguiente_caller", { p_proyecto: e.proyecto.id });
    expect(error?.message).toMatch(/permission denied/);
  });
  it("las RPC de dinero no se pueden llamar con la clave pública ni con sesión (S7-4)", async () => {
    const anon = createClient(URL_DB, PUBLICA, { auth: { persistSession: false } });
    const u = createClient(URL_DB, PUBLICA, { auth: { persistSession: false } });
    expect((await u.auth.signInWithPassword({ email: e.p.closerA.email, password: PASSWORD })).error).toBeNull();
    const P = e.proyecto.id;
    const args: Record<string, object> = {
      registrar_venta: { p_proyecto: P, p_lead: e.leads.LeadA, p_producto: e.productos["Low ticket"], p_vendedor: e.p.closerA.id, p_facturacion: 47, p_cash: 47, p_tipo_pago: "completo", p_num_cuotas: null, p_metodo: "stripe", p_nota: null, p_fecha: new Date().toISOString(), p_plazos: [], p_cita: null, p_cita_fecha: null, p_estrellas: null },
      registrar_cobro: { p_proyecto: P, p_venta: e.leads.LeadA, p_importe: 1, p_metodo: "stripe", p_registrado_por: e.p.closerA.id, p_fecha: new Date().toISOString() },
      cambiar_forma_pago: { p_proyecto: P, p_venta: e.leads.LeadA, p_tipo: "completo", p_num_cuotas: null, p_plazos: [], p_fijos: [] },
      recalcular_liquidaciones: { p_proyecto: P, p_mes: "2037-01", p_filas: [] },
    };
    for (const f of RPC_DINERO)
      for (const [quien, c] of [["anon", anon], ["sesión", u]] as const) {
        const { error } = await c.rpc(f, args[f]);
        expect(error?.message, `${f} con ${quien}`).toMatch(/permission denied/);
      }
    // Y nada se escribió: la única venta del proyecto es la sembrada
    const { count } = await db.from("ventas").select("*", { count: "exact", head: true }).eq("proyecto_id", P);
    expect(count).toBe(1);
  });
  it("ningún bucket se puede listar ni descargar sin enlace firmado, aunque tenga archivos (S7-3)", async () => {
    const anon = createClient(URL_DB, PUBLICA, { auth: { persistSession: false } });
    const u = createClient(URL_DB, PUBLICA, { auth: { persistSession: false } });
    expect((await u.auth.signInWithPassword({ email: e.p.callerA.email, password: PASSWORD })).error).toBeNull();
    for (const [b, f] of BUCKETS) {
      // El archivo está (la clave secreta lo ve)…
      expect((await db.storage.from(b).list(carpeta)).data?.map((x) => x.name), b).toContain(f);
      // …pero ni la clave pública ni alguien con sesión lo listan ni lo bajan
      for (const [quien, c] of [["anon", anon], ["sesión", u]] as const) {
        expect((await c.storage.from(b).list(carpeta)).data ?? [], `${b} con ${quien}`).toHaveLength(0);
        const bajada = await c.storage.from(b).download(`${carpeta}/${f}`);
        expect(bajada.data, `${b}/${f} con ${quien}`).toBeNull();
        expect(bajada.error, `${b}/${f} con ${quien}`).not.toBeNull();
      }
    }
  });
});

// Arreglo 4: el límite se cuenta en la base de datos (compartido por todas las copias del servidor)
describe("Límites de intentos", () => {
  it("ventana deslizante: corta al llegar al máximo y se libera al pasar el tiempo", async () => {
    await reiniciarLimites();
    // Horas recientes: la base borra de vez en cuando los intentos de hace más de 1 día
    const t0 = Date.now() - 10 * 60_000;
    for (let i = 0; i < 3; i++) expect(await dentroDelLimite("x", 3, 60_000, t0 + i)).toBe(true);
    expect(await dentroDelLimite("x", 3, 60_000, t0 + 10)).toBe(false);
    expect(await dentroDelLimite("x", 3, 60_000, t0 + 61_000)).toBe(true);
    expect((await db.from("limite_intentos").select("id").eq("clave", "x")).data).toHaveLength(4);
  });
  it("login: solo cuentan los fallos", async () => {
    await reiniciarLimites();
    const t0 = Date.now() - 20 * 60_000;
    for (let i = 0; i < 7; i++) await anotar("login:email:a@b.c", t0 + i);
    expect(await bloqueado("login:email:a@b.c", 8, 900_000, t0 + 1000)).toBe(false);
    await anotar("login:email:a@b.c", t0 + 10);
    expect(await bloqueado("login:email:a@b.c", 8, 900_000, t0 + 1000)).toBe(true);
    expect(await bloqueado("login:email:a@b.c", 8, 900_000, t0 + 10 + 900_001)).toBe(false);
  });
  it("20 peticiones a la vez con hueco para 5: pasan exactamente 5", async () => {
    await reiniciarLimites();
    const r = await Promise.all(Array.from({ length: 20 }, () => dentroDelLimite("a-la-vez", 5, 60_000)));
    expect(r.filter(Boolean)).toHaveLength(5);
  });
  it("con la clave pública no se puede leer la tabla ni llamar a las funciones", async () => {
    const anon = createClient(URL_DB, PUBLICA, { auth: { persistSession: false } });
    expect((await anon.from("limite_intentos").select("*").limit(1)).data ?? []).toHaveLength(0);
    expect((await anon.rpc("limite_dentro", { p_clave: "hack", p_maximo: 1, p_ventana_ms: 1000 })).error).not.toBeNull();
    expect((await anon.rpc("limite_anotar", { p_clave: "hack" })).error).not.toBeNull();
  });
});

describe("Webhook", () => {
  const enviar = (clave: string, cuerpo = "{}", cabeceras: Record<string, string> = {}) =>
    POST(
      new NextRequest(`http://localhost/api/webhooks/ghl/${e.proyecto.id}`, {
        method: "POST",
        body: cuerpo,
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", "x-eternity-secreto": clave, ...cabeceras },
      }),
      { params: Promise.resolve({ proyectoId: e.proyecto.id }) } as never
    );
  it("un cuerpo enorme se rechaza sin leerlo", async () => {
    expect((await enviar("x", "{}", { "content-length": "900000" })).status).toBe(413);
  });
  it("quien prueba claves se bloquea tras 30 fallos", async () => {
    await reiniciarLimites();
    for (let i = 0; i < 30; i++) expect((await enviar("mala")).status).toBe(401);
    expect((await enviar("mala")).status).toBe(429);
  });
  it("D43: sin la clave buena no se gasta el cupo de 300/min del proyecto", async () => {
    await reiniciarLimites();
    for (let i = 0; i < 3; i++) expect((await enviar("mala")).status).toBe(401);
    const { data, error } = await db.from("limite_intentos").select("id").eq("clave", `webhook:${e.proyecto.id}`);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});

describe("PDF falso", () => {
  it("un archivo que dice ser PDF pero no lo es se rechaza y se borra de Storage", async () => {
    como(e, e.p.director);
    const fd = formulario({ titulo: "Falso", tipo: "pdf", para_rol: "todos" });
    fd.set("archivo", new File(["<script>alert(1)</script>"], "falso.pdf", { type: "application/pdf" }));
    await subirDelFormulario(fd, "archivo", "application/pdf", prepararSubidaPdf);
    expect((await crearRecurso(null, fd))?.error).toMatch(/no es un PDF válido/);
    const { data } = await db.storage.from("recursos").list(e.proyecto.id);
    expect(data ?? []).toHaveLength(0);
  });
});

// Arreglo 1 de la auditoría: los archivos van del navegador directos a Supabase (Vercel corta a 4,5 MB)
describe("Subida directa a Supabase", () => {
  const PDF = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n";
  it("un PDF de verdad se sube con el enlace firmado y se guarda el recurso", async () => {
    como(e, e.p.director);
    const fd = formulario({ titulo: "Dossier", tipo: "pdf", para_rol: "todos" });
    fd.set("archivo", new File([PDF], "dossier.pdf", { type: "application/pdf" }));
    await subirDelFormulario(fd, "archivo", "application/pdf", prepararSubidaPdf);
    expect(fd.get("archivo")).toBeNull(); // la petición a la app ya no lleva el archivo
    const ruta = String(fd.get("archivo_ruta"));
    expect((await crearRecurso(null, fd))?.ok).toBeTruthy();
    const { data } = await db.from("recursos").select("archivo_path").eq("proyecto_id", e.proyecto.id).eq("titulo", "Dossier").single();
    expect(data!.archivo_path).toBe(ruta);
    // La misma ruta no se puede guardar dos veces
    expect((await crearRecurso(null, fd))?.error).toMatch(/ya está guardado/);
  });
  it("no se aceptan rutas inventadas ni de otro proyecto", async () => {
    como(e, e.p.director);
    for (const ruta of ["../otro.pdf", `${crypto.randomUUID()}/${crypto.randomUUID()}.pdf`, `${e.proyecto.id}/x.pdf`]) {
      expect((await crearRecurso(null, formulario({ titulo: "X", tipo: "pdf", para_rol: "todos", archivo_ruta: ruta })))?.error).toMatch(/no válido/);
    }
    // Ruta con buena forma pero sin archivo subido
    const sinSubir = `${e.proyecto.id}/${crypto.randomUUID()}.pdf`;
    expect((await crearRecurso(null, formulario({ titulo: "X", tipo: "pdf", para_rol: "todos", archivo_ruta: sinSubir })))?.error).toMatch(/No se encontró/);
  });
  it("el bucket rechaza archivos de más de 15 MB y de otro tipo", async () => {
    como(e, e.p.director);
    const grande = await ok(prepararSubidaPdf());
    const r1 = await fetch(grande.url, { method: "PUT", headers: { "content-type": "application/pdf" }, body: new Uint8Array(15 * 1024 * 1024 + 1) });
    expect(r1.ok).toBe(false);
    const otro = await ok(prepararSubidaPdf());
    const r2 = await fetch(otro.url, { method: "PUT", headers: { "content-type": "text/html" }, body: "<script></script>" });
    expect(r2.ok).toBe(false);
    // En el navegador ni se intenta: se avisa antes de subir
    const fd = new FormData();
    fd.set("archivo", new File([new Uint8Array(15 * 1024 * 1024 + 1)], "g.pdf", { type: "application/pdf" }));
    await expect(subirDelFormulario(fd, "archivo", "application/pdf", prepararSubidaPdf)).rejects.toThrow(/15 MB/);
  });
  it("los PDF subidos y nunca guardados se borran pasado 1 día; los guardados se quedan", async () => {
    como(e, e.p.director);
    const huerfano = await ok(prepararSubidaPdf());
    expect((await fetch(huerfano.url, { method: "PUT", headers: { "content-type": "application/pdf" }, body: PDF })).ok).toBe(true);
    const { data: guardado } = await db.from("recursos").select("archivo_path").eq("proyecto_id", e.proyecto.id).eq("titulo", "Dossier").single();
    const hay = async (ruta: string) => ((await db.storage.from("recursos").list(e.proyecto.id)).data ?? []).some((f) => `${e.proyecto.id}/${f.name}` === ruta);
    expect(await limpiarSubidasHuerfanas("recursos", e.proyecto.id)).toBe(0); // recién subido: no se toca
    expect(await limpiarSubidasHuerfanas("recursos", e.proyecto.id, Date.now() + 2 * 86_400_000)).toBe(1);
    expect(await hay(huerfano.ruta)).toBe(false);
    expect(await hay(guardado!.archivo_path)).toBe(true);
  });
  afterAll(async () => {
    const { data } = await db.storage.from("recursos").list(e.proyecto.id);
    if (data?.length) await db.storage.from("recursos").remove(data.map((f) => `${e.proyecto.id}/${f.name}`));
  });
});

describe("Registro de cuentas", () => {
  it("nadie puede crearse una cuenta por su cuenta (solo desde Administración)", async () => {
    const anon = createClient(URL_DB, PUBLICA, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signUp({ email: `${e.pref}-intruso@eternity.test`, password: "Intruso-12345" });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });
});
