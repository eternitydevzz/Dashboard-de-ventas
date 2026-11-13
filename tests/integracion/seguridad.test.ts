// Seguridad: la base de datos no se puede leer «por detrás» con la clave pública,
// límites de intentos, tamaño del webhook y PDF falsos.
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
const TABLAS = ["leads", "ventas", "pagos", "perfiles", "proyectos", "reportes", "webhook_eventos", "citas", "recursos", "productos", "actividades", "miembros_proyecto", "pipelines", "etapas", "objetivos", "lanzamientos", "permisos_persona", "permisos_pipeline"];

let e: Escenario;
beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  if (e) await borrarEscenario(e);
});

describe("Base de datos cerrada (RLS)", () => {
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
  it("los PDF no se pueden listar ni descargar sin enlace firmado", async () => {
    const anon = createClient(URL_DB, PUBLICA, { auth: { persistSession: false } });
    const { data } = await anon.storage.from("recursos").list(e.proyecto.id);
    expect(data ?? []).toHaveLength(0);
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
      new NextRequest(`http://localhost/api/webhooks/ghl/${e.proyecto.id}?secreto=${clave}`, {
        method: "POST",
        body: cuerpo,
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...cabeceras },
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

describe("Mensajes de error", () => {
  it("los errores previstos llegan al usuario; los inesperados no enseñan detalles internos", async () => {
    const { seguro, ErrorUsuario } = await import("@/lib/resultado");
    expect(await seguro(async () => { throw new ErrorUsuario("Pon un nombre."); })).toEqual({ error: "Pon un nombre." });
    const r = (await seguro(async () => { throw new Error('duplicate key value violates unique constraint "leads_pkey"'); })) as { error: string };
    expect(r.error).not.toMatch(/leads_pkey|duplicate/);
    expect(r.error).toMatch(/Algo ha fallado/);
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
