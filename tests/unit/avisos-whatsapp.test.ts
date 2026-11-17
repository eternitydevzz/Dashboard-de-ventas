// Fase D-3 (Jose, 17 nov 2026): aviso por WhatsApp al equipo al agendar una cita y al cerrar una venta.
// Al closer, al caller que la agendó y al grupo de los CEO (según Administración → WhatsApp). Al lead, nunca.
// Base y WhatsApp simulados: la base contesta lo que diga `base["tabla:operación"]`; nada sale a WAHA.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: { message: string } | null };
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let consultas: Consulta[];
let base: Record<string, Resp>;
let reservaInserta: boolean;
const OPS = ["upsert", "update", "insert", "delete"];
const op = (c: Consulta) => OPS.find((o) => c.ops.some(([x]) => x === o)) ?? "select";

vi.mock("@/lib/datos", () => ({
  db: () => ({
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      consultas.push(c);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "neq", "order", "limit", "update", "insert", "upsert", "delete", "maybeSingle", "single"])
        q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
      q.then = (ok: (v: Resp) => unknown, ko?: (e: unknown) => unknown) => {
        const clave = `${tabla}:${op(c)}`;
        if (base[clave]) return Promise.resolve(base[clave]).then(ok, ko);
        // La reserva: devuelve las filas que entraron (todas, o ninguna si ya estaban)
        if (clave === "whatsapp_envios:upsert") {
          const filas = (c.ops.find(([x]) => x === "upsert")![1][0] as { destino: string }[]).map((f) => ({ destino: f.destino }));
          return Promise.resolve({ data: reservaInserta ? filas : [], error: null }).then(ok, ko);
        }
        return Promise.resolve({ data: null, error: null }).then(ok, ko);
      };
      return q;
    },
  }),
}));

const configurado = vi.fn(() => true);
type Envio = (destinos: string[], texto: string) => Promise<{ enviados: string[]; fallos: { destino: string; motivo: string }[] }>;
const enviar = vi.fn<Envio>(async (destinos) => ({ enviados: destinos, fallos: [] }));
vi.mock("@/lib/whatsapp", async (original) => ({
  ...(await original<typeof import("@/lib/whatsapp")>()),
  whatsappConfigurado: () => configurado(),
  enviarWhatsapp: (d: string[], t: string) => enviar(d, t),
}));

const porDefecto = (evento: "cita" | "venta") => ({ evento, activo: true, a_closer: true, a_caller: true, a_grupo: true });
let configs: Record<"cita" | "venta", ReturnType<typeof porDefecto>>;
vi.mock("@/lib/whatsapp-config", () => ({ leerConfigsWhatsapp: async () => configs }));

const { avisarCita, avisarVenta, textoCita, textoVenta, destinosDe } = await import("@/lib/avisos-whatsapp");

const FUTURA = new Date(Date.now() + 3 * 86_400_000).toISOString();
const PASADA = new Date(Date.now() - 3 * 86_400_000).toISOString();
const GRUPO = "120363000000000000@g.us";
const ANA = { id: "ana", nombre: "Ana Closer", whatsapp: "+34 600 111 222" };
const LUIS = { id: "luis", nombre: "Luis Caller", whatsapp: "+1 (305) 555-0101" };

const cita = (extra: Record<string, unknown> = {}) => ({
  data: { id: "c1", proyecto_id: "p1", fecha: FUTURA, estado: "pendiente", closer_id: "ana", agendada_por: "luis", leads: { nombre: "María", apellido: "Gómez" }, ...extra },
  error: null,
});
const de = (tabla: string, o: string) => consultas.filter((c) => c.tabla === tabla && op(c) === o);
const filasReserva = () => de("whatsapp_envios", "upsert").flatMap((c) => c.ops.find(([x]) => x === "upsert")![1][0] as Record<string, unknown>[]);
const actualizaciones = () => de("whatsapp_envios", "update").map((c) => ({ datos: c.ops.find(([x]) => x === "update")![1][0], filtros: c.ops.filter(([x]) => x === "eq" || x === "in").map(([, a]) => a) }));

beforeEach(() => {
  consultas = [];
  reservaInserta = true;
  configs = { cita: porDefecto("cita"), venta: porDefecto("venta") };
  configurado.mockReturnValue(true);
  enviar.mockClear();
  enviar.mockImplementation(async (destinos: string[]) => ({ enviados: destinos, fallos: [] }));
  base = {
    "citas:select": cita(),
    "proyectos:select": { data: { id: "p1", zona_horaria: "Europe/Madrid", moneda: "EUR", whatsapp_grupo: GRUPO }, error: null },
    "perfiles:select": { data: [ANA, LUIS], error: null },
  };
});

describe("textos y destinos (funciones puras)", () => {
  it("texto de la cita: nueva y reagendada, con la hora en la zona del proyecto", () => {
    const fecha = "2026-11-20T16:30:00Z";
    expect(textoCita({ lead: "María Gómez", fecha, zona: "Europe/Madrid", closer: "Ana", agendo: "Luis", motivo: "agendada" })).toBe("📅 Nueva cita · María Gómez · 20 nov, 17:30 · Closer: Ana · Agendó: Luis");
    expect(textoCita({ lead: "María Gómez", fecha, zona: "America/New_York", closer: "Ana", agendo: null, motivo: "reagendada" })).toBe("🔁 Cita reagendada · María Gómez · 20 nov, 11:30 · Closer: Ana · Agendó: GHL");
  });

  it("texto de la venta: producto, importe con moneda y quién vendió", () => {
    expect(textoVenta({ lead: "María Gómez", producto: "VIP", importe: 1500, moneda: "EUR", vendedor: "Ana" })).toBe(`💰 Venta cerrada · María Gómez · VIP · ${new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(1500)} · Vendió: Ana`);
    expect(textoVenta({ lead: "María Gómez", producto: "VIP", importe: 47, moneda: "USD", vendedor: "Ana" })).toContain("$47");
  });

  it("destinos: closer, caller y grupo; sin número → perfil:<id>; la misma persona dos veces, una sola", () => {
    expect(destinosDe(porDefecto("cita"), { closer: ANA, caller: LUIS }, GRUPO)).toEqual([
      { destino: "34600111222@c.us", chatId: "34600111222@c.us" },
      { destino: "13055550101@c.us", chatId: "13055550101@c.us" },
      { destino: GRUPO, chatId: GRUPO },
    ]);
    expect(destinosDe(porDefecto("cita"), { closer: ANA, caller: { ...LUIS, whatsapp: null } }, null)).toEqual([
      { destino: "34600111222@c.us", chatId: "34600111222@c.us" },
      { destino: "perfil:luis", chatId: null },
    ]);
    expect(destinosDe(porDefecto("cita"), { closer: ANA, caller: ANA }, null)).toHaveLength(1);
    expect(destinosDe({ ...porDefecto("cita"), a_caller: false, a_grupo: false }, { closer: ANA, caller: LUIS }, GRUPO)).toEqual([{ destino: "34600111222@c.us", chatId: "34600111222@c.us" }]);
  });
});

describe("avisarCita", () => {
  it("sin WhatsApp configurado no lee ni escribe nada", async () => {
    configurado.mockReturnValue(false);
    await avisarCita("c1");
    expect(consultas).toHaveLength(0);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("cita futura: manda a closer, caller y grupo y apunta 3 filas (reserva y luego «enviado»)", async () => {
    await avisarCita("c1");
    expect(enviar).toHaveBeenCalledTimes(1);
    const [destinos, texto] = enviar.mock.calls[0];
    expect(destinos).toEqual(["34600111222@c.us", "13055550101@c.us", GRUPO]);
    expect(texto).toMatch(/^📅 Nueva cita · María Gómez · .+ · Closer: Ana Closer · Agendó: Luis Caller$/);
    const filas = filasReserva();
    expect(filas).toHaveLength(3);
    for (const f of filas) expect(f).toMatchObject({ proyecto_id: "p1", evento: "cita", origen_id: "c1", estado: "fallo", error: "enviando" });
    const reserva = de("whatsapp_envios", "upsert")[0].ops.find(([x]) => x === "upsert")![1][1];
    expect(reserva).toEqual({ onConflict: "evento,origen_id,destino", ignoreDuplicates: true });
    const enviados = actualizaciones().filter((u) => (u.datos as { estado: string }).estado === "enviado");
    expect(enviados).toHaveLength(1);
    expect(enviados[0].datos).toEqual({ estado: "enviado", error: null });
    expect(enviados[0].filtros).toEqual(expect.arrayContaining([["evento", "cita"], ["origen_id", "c1"], ["destino", ["34600111222@c.us", "13055550101@c.us", GRUPO]]]));
  });

  it("reagendada: el texto empieza por «🔁 Cita reagendada»", async () => {
    await avisarCita("c1", "reagendada");
    expect(enviar.mock.calls[0][1]).toMatch(/^🔁 Cita reagendada · María Gómez · /);
  });

  it("caller sin número: no se le manda y queda «sin_numero» con destino perfil:<id>", async () => {
    base["perfiles:select"] = { data: [ANA, { ...LUIS, whatsapp: null }], error: null };
    await avisarCita("c1");
    expect(enviar.mock.calls[0][0]).toEqual(["34600111222@c.us", GRUPO]);
    expect(filasReserva()).toContainEqual(expect.objectContaining({ destino: "perfil:luis", estado: "sin_numero", error: null }));
  });

  it("config con a_caller apagado: no se manda al caller", async () => {
    configs.cita = { ...porDefecto("cita"), a_caller: false };
    await avisarCita("c1");
    expect(enviar.mock.calls[0][0]).toEqual(["34600111222@c.us", GRUPO]);
    expect(filasReserva().map((f) => f.destino)).not.toContain("13055550101@c.us");
  });

  it("config apagada (activo false): nada", async () => {
    configs.cita = { ...porDefecto("cita"), activo: false };
    await avisarCita("c1");
    expect(enviar).not.toHaveBeenCalled();
    expect(filasReserva()).toHaveLength(0);
  });

  it("cita pasada (p. ej. importada de GHL): nada", async () => {
    base["citas:select"] = cita({ fecha: PASADA });
    await avisarCita("c1");
    expect(enviar).not.toHaveBeenCalled();
    expect(filasReserva()).toHaveLength(0);
  });

  it("cita que ya no está abierta (p. ej. cancelada en GHL): nada", async () => {
    base["citas:select"] = cita({ estado: "cancelada" });
    await avisarCita("c1");
    expect(enviar).not.toHaveBeenCalled();
  });

  it("segunda vez (la reserva no inserta nada): no se manda otra vez", async () => {
    reservaInserta = false;
    await avisarCita("c1");
    expect(enviar).not.toHaveBeenCalled();
    expect(de("whatsapp_envios", "update")).toHaveLength(0);
  });

  it("si WAHA falla con un destino, esa fila queda «fallo» con el motivo", async () => {
    enviar.mockImplementation(async (destinos: string[]) => ({ enviados: destinos.filter((d) => d !== GRUPO), fallos: [{ destino: GRUPO, motivo: "WAHA respondió 500" }] }));
    await avisarCita("c1");
    const fallo = actualizaciones().find((u) => (u.datos as { estado: string }).estado === "fallo");
    expect(fallo?.datos).toEqual({ estado: "fallo", error: "WAHA respondió 500" });
    expect(fallo?.filtros).toEqual(expect.arrayContaining([["destino", GRUPO]]));
  });

  it("un error de la base no lanza: va a console.error con [avisos-whatsapp]", async () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => undefined);
    base["citas:select"] = { data: null, error: { message: "la base no responde" } };
    await expect(avisarCita("c1")).resolves.toBeUndefined();
    expect(espia).toHaveBeenCalledWith("[avisos-whatsapp]", expect.stringContaining("la base no responde"));
    expect(enviar).not.toHaveBeenCalled();
    espia.mockRestore();
  });
});

describe("avisarVenta", () => {
  beforeEach(() => {
    base["ventas:select"] = { data: { id: "v1", proyecto_id: "p1", vendedor_id: "ana", facturacion: 1500, productos: { nombre: "VIP" }, leads: { nombre: "María", apellido: "Gómez", caller_id: "luis" } }, error: null };
  });

  it("manda al vendedor, al caller y al grupo con el texto de la venta", async () => {
    await avisarVenta("v1");
    const [destinos, texto] = enviar.mock.calls[0];
    expect(destinos).toEqual(["34600111222@c.us", "13055550101@c.us", GRUPO]);
    expect(texto).toMatch(/^💰 Venta cerrada · María Gómez · VIP · .*1500.* · Vendió: Ana Closer$/);
    for (const f of filasReserva()) expect(f).toMatchObject({ evento: "venta", origen_id: "v1" });
  });

  it("sin WhatsApp configurado no lee ni escribe nada", async () => {
    configurado.mockReturnValue(false);
    await avisarVenta("v1");
    expect(consultas).toHaveLength(0);
  });

  it("un error de la base no lanza", async () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => undefined);
    base["ventas:select"] = { data: null, error: { message: "sin conexión" } };
    await expect(avisarVenta("v1")).resolves.toBeUndefined();
    expect(espia).toHaveBeenCalledWith("[avisos-whatsapp]", expect.stringContaining("sin conexión"));
    espia.mockRestore();
  });
});

describe("las acciones llaman a los avisos", () => {
  const leer = (r: string) => readFileSync(r, "utf8");
  it("los 4 archivos que crean citas llaman a avisarCita (y la venta a avisarVenta), dentro de after()", () => {
    for (const r of ["src/app/(panel)/closer/acciones.ts", "src/app/(panel)/leads/acciones.ts", "src/app/api/webhooks/ghl/[proyectoId]/route.ts", "src/lib/ghl-sync.ts"]) {
      expect(leer(r), r).toContain("avisarCita(");
      expect(leer(r), r).toMatch(/after\(\(\) => avisarCita\(/);
    }
    // reagendarCita y unirCitaSinLead (importarCitas no: ver abajo)
    const closer = leer("src/app/(panel)/closer/acciones.ts");
    expect(closer.match(/avisarCita\(/g)).toHaveLength(2);
    expect(closer).toMatch(/avisarCita\(nueva\.id, "reagendada"\)/);
    expect(leer("src/app/(panel)/leads/acciones.ts")).toMatch(/after\(\(\) => avisarVenta\(/);
  });

  it("importarCitas (CSV) no avisa por WhatsApp: un CSV puede traer cientos (orquestador, 17 nov)", () => {
    const closer = leer("src/app/(panel)/closer/acciones.ts");
    const inicio = closer.indexOf("export async function importarCitas(");
    const fin = closer.indexOf("\nexport async function", inicio + 1);
    expect(inicio).toBeGreaterThan(-1);
    const funcion = closer.slice(inicio, fin);
    expect(funcion).toContain('db().from("citas").insert('); // es la función de verdad
    expect(funcion).not.toContain("avisarCita(");
    expect(funcion).not.toContain("after(");
  });
});
