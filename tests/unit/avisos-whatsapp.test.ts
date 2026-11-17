// Fase D-3 (Jose, 17 nov 2026): aviso por WhatsApp al equipo al agendar una cita y al cerrar una venta.
// Al closer, al caller que la agendó y al grupo de los CEO (según Administración → WhatsApp). Al lead, nunca.
// Revisión de la fase D: un cambio de hora es otro aviso; cada persona ve la hora en su zona (N2); solo personas
// activas y con prefijo de país; el caller de la venta es el de Finanzas; los fallos de WAHA salen en la campana.
// Base y WhatsApp simulados: la base contesta lo que diga `base["tabla:operación"]`; nada sale a WAHA.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: { message: string } | null };
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let consultas: Consulta[];
let base: Record<string, Resp>;
let reservadas: Set<string>; // lo que ya está en whatsapp_envios: unique(evento, origen_id, destino)
const OPS = ["upsert", "update", "insert", "delete"];
const op = (c: Consulta) => OPS.find((o) => c.ops.some(([x]) => x === o)) ?? "select";

vi.mock("@/lib/datos", () => ({
  db: () => ({
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      consultas.push(c);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "not", "neq", "order", "limit", "update", "insert", "upsert", "delete", "maybeSingle", "single"])
        q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
      q.then = (ok: (v: Resp) => unknown, ko?: (e: unknown) => unknown) => {
        const clave = `${tabla}:${op(c)}`;
        if (base[clave]) return Promise.resolve(base[clave]).then(ok, ko);
        // La reserva (ON CONFLICT DO NOTHING): devuelve solo las filas que entraron
        if (clave === "whatsapp_envios:upsert") {
          const filas = c.ops.find(([x]) => x === "upsert")![1][0] as { evento: string; origen_id: string; destino: string }[];
          const entraron = filas.filter((f) => {
            const k = `${f.evento}|${f.origen_id}|${f.destino}`;
            if (reservadas.has(k)) return false;
            reservadas.add(k);
            return true;
          });
          return Promise.resolve({ data: entraron.map((f) => ({ destino: f.destino })), error: null }).then(ok, ko);
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
const guardarError = vi.fn<(sitio: string, texto: string, proyectoId: string | null) => Promise<undefined>>(async () => undefined);
vi.mock("@/lib/errores-app", () => ({ guardarError: (s: string, t: string, p: string | null) => guardarError(s, t, p) }));

const { avisarCita, avisarVenta, textoCita, textoVenta, destinosDe } = await import("@/lib/avisos-whatsapp");

const FUTURA = "2099-11-20T16:30:00.000Z";
const OTRA_HORA = "2099-11-21T18:00:00.000Z";
const PASADA = new Date(Date.now() - 3 * 86_400_000).toISOString();
const GRUPO = "120363000000000000@g.us";
const CHAT_ANA = "34600111222@c.us";
const CHAT_LUIS = "13055550101@c.us";
const ANA = { id: "ana", nombre: "Ana Closer", whatsapp: "+34 600 111 222", rol: "closer", zona_horaria: "Europe/Madrid", activo: true };
const LUIS = { id: "luis", nombre: "Luis Caller", whatsapp: "+1 (305) 555-0101", rol: "caller", zona_horaria: "America/Bogota", activo: true };
const PEPE = { id: "pepe", nombre: "Pepe Caller", whatsapp: "+34 611 000 333", rol: "caller", zona_horaria: "Europe/Madrid", activo: true };
const ZONA_NY = "America/New_York";

const cita = (extra: Record<string, unknown> = {}) => ({
  data: { id: "c1", proyecto_id: "p1", fecha: FUTURA, estado: "pendiente", closer_id: "ana", agendada_por: "luis", leads: { nombre: "María", apellido: "Gómez" }, ...extra },
  error: null,
});
const personas = (...p: Record<string, unknown>[]) => ({ data: p, error: null });
const de = (tabla: string, o: string) => consultas.filter((c) => c.tabla === tabla && op(c) === o);
const filasReserva = () => de("whatsapp_envios", "upsert").flatMap((c) => c.ops.find(([x]) => x === "upsert")![1][0] as Record<string, unknown>[]);
const actualizaciones = () => de("whatsapp_envios", "update").map((c) => ({ datos: c.ops.find(([x]) => x === "update")![1][0], filtros: c.ops.filter(([x]) => x === "eq" || x === "in").map(([, a]) => a) }));
// Lo que recibió cada chat (enviarWhatsapp puede llamarse una vez por texto distinto)
const recibido = () => new Map(enviar.mock.calls.flatMap(([ds, t]) => ds.map((d) => [d, t] as const)));
const mandadosA = () => enviar.mock.calls.flatMap(([ds]) => ds);

beforeEach(() => {
  consultas = [];
  reservadas = new Set();
  configs = { cita: porDefecto("cita"), venta: porDefecto("venta") };
  configurado.mockReturnValue(true);
  enviar.mockClear();
  enviar.mockImplementation(async (destinos: string[]) => ({ enviados: destinos, fallos: [] }));
  guardarError.mockClear();
  base = {
    "citas:select": cita(),
    "proyectos:select": { data: { id: "p1", zona_horaria: ZONA_NY, moneda: "EUR", whatsapp_grupo: GRUPO }, error: null },
    "perfiles:select": personas(ANA, LUIS),
  };
});

describe("textos (funciones puras)", () => {
  const fecha = "2026-11-20T16:30:00Z";
  it("cita: varias líneas, la hora de la persona («tu hora») o la del grupo con su nombre", () => {
    expect(textoCita({ motivo: "agendada", lead: "María Gómez", fecha, zona: "Europe/Madrid", para: "persona", closer: "Ana", agendo: "Luis" })).toBe(
      "📅 Nueva cita\nLead: María Gómez\nCuándo: 20 nov, 17:30 (tu hora)\nCloser: Ana\nLa consiguió: Luis"
    );
    expect(textoCita({ motivo: "agendada", lead: "María Gómez", fecha, zona: ZONA_NY, para: "grupo", closer: "Ana", agendo: "Luis" })).toBe(
      "📅 Nueva cita\nLead: María Gómez\nCuándo: 20 nov, 11:30 (hora de Nueva York)\nCloser: Ana\nLa consiguió: Luis"
    );
  });

  it("cita sin caller (de GHL) y cita cambiada de hora", () => {
    expect(textoCita({ motivo: "reagendada", lead: "María Gómez", fecha, zona: "America/Bogota", para: "persona", closer: null, agendo: null })).toBe(
      "🔁 Cita cambiada de hora\nLead: María Gómez\nCuándo: 20 nov, 11:30 (tu hora)\nCloser: sin asignar\nLa reservó el lead en el calendario"
    );
  });

  it("venta: programa con importe (2 decimales si no es entero), vendedor y caller", () => {
    const eur = (n: number, d: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
    expect(textoVenta({ lead: "María Gómez", producto: "VIP", importe: 1500, moneda: "EUR", vendedor: "Ana", caller: "Luis" })).toBe(`💰 Venta cerrada\nLead: María Gómez\nPrograma: VIP · ${eur(1500, 0)}\nVendió: Ana · Caller: Luis`);
    expect(textoVenta({ lead: "María Gómez", producto: "VIP", importe: 47.5, moneda: "USD", vendedor: "Ana", caller: null })).toBe("💰 Venta cerrada\nLead: María Gómez\nPrograma: VIP · $47.50\nVendió: Ana · Caller: —");
  });
});

describe("destinos (función pura)", () => {
  it("closer, caller y grupo, cada uno con su zona; la misma persona dos veces, una sola", () => {
    expect(destinosDe(porDefecto("cita"), { closer: ANA, caller: LUIS }, GRUPO, ZONA_NY)).toEqual([
      { destino: CHAT_ANA, chatId: CHAT_ANA, error: null, para: "persona", zona: "Europe/Madrid" },
      { destino: CHAT_LUIS, chatId: CHAT_LUIS, error: null, para: "persona", zona: "America/Bogota" },
      { destino: GRUPO, chatId: GRUPO, error: null, para: "grupo", zona: ZONA_NY },
    ]);
    expect(destinosDe(porDefecto("cita"), { closer: ANA, caller: ANA }, null, ZONA_NY)).toHaveLength(1);
    expect(destinosDe({ ...porDefecto("cita"), a_caller: false, a_grupo: false }, { closer: ANA, caller: LUIS }, GRUPO, ZONA_NY).map((d) => d.destino)).toEqual([CHAT_ANA]);
  });

  it("sin número, sin «+» o con un id @c.us/@g.us → sin_numero con perfil:<id>; de baja → fuera", () => {
    const [sin] = destinosDe(porDefecto("cita"), { closer: { ...ANA, whatsapp: null }, caller: null }, null, ZONA_NY);
    expect(sin).toMatchObject({ destino: "perfil:ana", chatId: null, error: null });
    const [sinMas] = destinosDe(porDefecto("cita"), { closer: { ...ANA, whatsapp: "34 600 111 222" }, caller: null }, null, ZONA_NY);
    expect(sinMas).toMatchObject({ destino: "perfil:ana", chatId: null, error: "Sin prefijo de país (+)" });
    for (const id of ["34600111222@c.us", GRUPO]) {
      const [d] = destinosDe(porDefecto("cita"), { closer: { ...ANA, whatsapp: id }, caller: null }, null, ZONA_NY);
      expect(d, id).toMatchObject({ destino: "perfil:ana", chatId: null });
      expect(d.error, id).toBeTruthy();
    }
    expect(destinosDe(porDefecto("cita"), { closer: { ...ANA, activo: false }, caller: LUIS }, null, ZONA_NY).map((d) => d.destino)).toEqual([CHAT_LUIS]);
  });
});

describe("avisarCita", () => {
  it("sin WhatsApp configurado no lee ni escribe nada", async () => {
    configurado.mockReturnValue(false);
    await avisarCita("c1");
    expect(consultas).toHaveLength(0);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("cita futura: closer, caller y grupo, cada uno con la hora en su zona; 3 filas con origen «cita:fecha»", async () => {
    await avisarCita("c1");
    const r = recibido();
    expect([...r.keys()].sort()).toEqual([CHAT_LUIS, CHAT_ANA, GRUPO].sort());
    expect(r.get(CHAT_ANA)).toBe("📅 Nueva cita\nLead: María Gómez\nCuándo: 20 nov, 17:30 (tu hora)\nCloser: Ana Closer\nLa consiguió: Luis Caller");
    expect(r.get(CHAT_LUIS)).toContain("Cuándo: 20 nov, 11:30 (tu hora)");
    expect(r.get(GRUPO)).toContain("Cuándo: 20 nov, 11:30 (hora de Nueva York)");
    const filas = filasReserva();
    expect(filas).toHaveLength(3);
    for (const f of filas) expect(f).toMatchObject({ proyecto_id: "p1", evento: "cita", origen_id: `c1:${FUTURA}`, estado: "fallo", error: "enviando" });
    const reserva = de("whatsapp_envios", "upsert")[0].ops.find(([x]) => x === "upsert")![1][1];
    expect(reserva).toEqual({ onConflict: "evento,origen_id,destino", ignoreDuplicates: true });
    const enviados = actualizaciones().filter((u) => (u.datos as { estado: string }).estado === "enviado");
    expect(enviados.flatMap((u) => (u.filtros.find((f) => f[0] === "destino")?.[1] as string[]) ?? []).sort()).toEqual([CHAT_LUIS, CHAT_ANA, GRUPO].sort());
    for (const u of enviados) {
      expect(u.datos).toEqual({ estado: "enviado", error: null });
      expect(u.filtros).toEqual(expect.arrayContaining([["evento", "cita"], ["origen_id", `c1:${FUTURA}`]]));
    }
  });

  it("la misma cita con otra hora (reagendada o juntada) avisa otra vez; con la misma hora, no", async () => {
    await avisarCita("c1");
    expect(mandadosA()).toHaveLength(3);
    enviar.mockClear();
    await avisarCita("c1", "reagendada"); // misma hora
    expect(enviar).not.toHaveBeenCalled();
    base["citas:select"] = cita({ fecha: OTRA_HORA });
    await avisarCita("c1", "reagendada");
    expect(mandadosA()).toHaveLength(3);
    expect(enviar.mock.calls[0][1]).toMatch(/^🔁 Cita cambiada de hora\n/);
  });

  it("caller sin número o sin prefijo de país: no se le manda y queda «sin_numero»", async () => {
    base["perfiles:select"] = personas(ANA, { ...LUIS, whatsapp: "305 555 0101" });
    await avisarCita("c1");
    expect(mandadosA().sort()).toEqual([CHAT_ANA, GRUPO].sort());
    expect(filasReserva()).toContainEqual(expect.objectContaining({ destino: "perfil:luis", estado: "sin_numero", error: "Sin prefijo de país (+)" }));
    expect(guardarError).not.toHaveBeenCalled(); // sin número no es un fallo de WAHA
  });

  it("persona de baja: ni se reserva ni se le manda", async () => {
    base["perfiles:select"] = personas(ANA, { ...LUIS, activo: false });
    await avisarCita("c1");
    expect(mandadosA().sort()).toEqual([CHAT_ANA, GRUPO].sort());
    expect(filasReserva().map((f) => f.destino)).not.toContain("perfil:luis");
    expect(filasReserva().map((f) => f.destino)).not.toContain(CHAT_LUIS);
  });

  it("config con a_caller apagado: no se manda al caller", async () => {
    configs.cita = { ...porDefecto("cita"), a_caller: false };
    await avisarCita("c1");
    expect(mandadosA().sort()).toEqual([CHAT_ANA, GRUPO].sort());
  });

  it("config apagada, cita pasada o cita ya no abierta: nada", async () => {
    configs.cita = { ...porDefecto("cita"), activo: false };
    await avisarCita("c1");
    configs.cita = porDefecto("cita");
    base["citas:select"] = cita({ fecha: PASADA });
    await avisarCita("c1");
    base["citas:select"] = cita({ estado: "cancelada" });
    await avisarCita("c1");
    expect(enviar).not.toHaveBeenCalled();
    expect(filasReserva()).toHaveLength(0);
  });

  it("WAHA falla con un destino: fila «fallo» con el motivo y aviso en la campana del CEO (sin datos del lead)", async () => {
    enviar.mockImplementation(async (destinos: string[]) => ({ enviados: destinos.filter((d) => d !== GRUPO), fallos: destinos.includes(GRUPO) ? [{ destino: GRUPO, motivo: "WAHA respondió 500" }] : [] }));
    await avisarCita("c1");
    const fallo = actualizaciones().find((u) => (u.datos as { estado: string }).estado === "fallo");
    expect(fallo?.datos).toEqual({ estado: "fallo", error: "WAHA respondió 500" });
    expect(fallo?.filtros).toEqual(expect.arrayContaining([["destino", GRUPO]]));
    expect(guardarError).toHaveBeenCalledTimes(1);
    const [sitio, texto, proyecto] = guardarError.mock.calls[0];
    expect(sitio).toBe("whatsapp");
    expect(proyecto).toBe("p1");
    expect(texto).toContain("WAHA respondió 500");
    expect(texto).not.toContain("María");
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
    base["ventas:select"] = { data: { id: "v1", proyecto_id: "p1", lead_id: "l1", vendedor_id: "ana", facturacion: 1500, productos: { nombre: "VIP" }, leads: { nombre: "María", apellido: "Gómez", caller_id: "pepe" } }, error: null };
    base["citas:select"] = { data: { agendada_por: "luis" }, error: null }; // la cita cerrada de esa venta
    base["perfiles:select"] = personas(ANA, LUIS, PEPE);
  });

  it("caller = quien agendó la cita que cerró la venta (como Finanzas), no el caller del lead", async () => {
    await avisarVenta("v1");
    expect(mandadosA()).toEqual([CHAT_ANA, CHAT_LUIS, GRUPO]);
    expect(enviar.mock.calls[0][1]).toMatch(/^💰 Venta cerrada\nLead: María Gómez\nPrograma: VIP · .*1500.*\nVendió: Ana Closer · Caller: Luis Caller$/);
    for (const f of filasReserva()) expect(f).toMatchObject({ evento: "venta", origen_id: "v1" });
    const cerrada = de("citas", "select")[0].ops;
    expect(cerrada).toEqual(expect.arrayContaining([["eq", ["lead_id", "l1"]], ["eq", ["estado", "cerrada"]], ["eq", ["closer_id", "ana"]]]));
  });

  it("sin cita cerrada: el caller del lead, como hasta ahora", async () => {
    base["citas:select"] = { data: null, error: null };
    await avisarVenta("v1");
    expect(mandadosA()).toEqual([CHAT_ANA, "34611000333@c.us", GRUPO]);
    expect(enviar.mock.calls[0][1]).toContain("Caller: Pepe Caller");
  });

  it("si quien agendó la cita no es caller, la venta no tiene caller (regla de Finanzas)", async () => {
    base["citas:select"] = { data: { agendada_por: "ana" }, error: null };
    await avisarVenta("v1");
    expect(mandadosA()).toEqual([CHAT_ANA, GRUPO]);
    expect(enviar.mock.calls[0][1]).toContain("Caller: —");
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

  it("webhook de GHL: si la cita ya existía y cambia de hora, avisa «reagendada»", () => {
    const ruta = leer("src/app/api/webhooks/ghl/[proyectoId]/route.ts");
    expect(ruta).toMatch(/after\(\(\) => avisarCita\(yaExiste\.id, "reagendada"\)\)/);
    const bloque = ruta.slice(ruta.indexOf("const { data: yaExiste }"), ruta.indexOf("avisarCita(yaExiste.id"));
    expect(bloque).toMatch(/select\("id, fecha"\)/); // lee la hora de antes para saber si cambió
  });

  it("lectura de GHL: el WhatsApp va antes del email al closer (un fallo del email no se lo come)", () => {
    const sync = leer("src/lib/ghl-sync.ts");
    const nuevo = sync.indexOf('after(() => avisarCita(citaId, junta ? "reagendada" : "agendada"))');
    expect(nuevo).toBeGreaterThan(-1);
    expect(nuevo).toBeLessThan(sync.indexOf('await avisarCloserAgenda({ proyectoId: proyecto.id, closerId: closerFinal, citaId'));
  });
});

// La lectura de cada minuto con una base en memoria (como tests/unit/ghl-sync-agenda-unica.test.ts) y avisarCita
// simulado: se mira que un cambio de hora de una cita que ya está en la app avise «reagendada».
describe("lectura de GHL (ghl-sync): una cita que ya estaba y cambia de hora", () => {
  type Fila = Record<string, unknown>;
  const tablas: Record<string, Fila[]> = {};
  const eventos: Fila[] = [];
  const avisoCita = vi.fn<(citaId: string, motivo?: string) => Promise<undefined>>(async () => undefined);

  const preparar = async () => {
    vi.resetModules();
    vi.doMock("@/lib/datos", async () => await vi.importActual<typeof import("@/lib/datos")>("@/lib/datos"));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: (tabla: string) => {
          const filtros: ((f: Fila) => boolean)[] = [];
          let cambio: Fila | null = null;
          let uno = false;
          const q: Record<string, unknown> = {};
          for (const m of ["select", "order", "limit", "not", "gte", "lt", "upsert", "insert"]) q[m] = () => q;
          q.eq = (c: string, v: unknown) => (filtros.push((f) => f[c] === v), q);
          q.in = (c: string, v: unknown[]) => (filtros.push((f) => v.includes(f[c])), q);
          q.update = (c: Fila) => ((cambio = c), q);
          q.maybeSingle = q.single = () => ((uno = true), q);
          q.then = (r: (v: unknown) => unknown) => {
            const elegidas = (tablas[tabla] ??= []).filter((f) => filtros.every((x) => x(f)));
            if (cambio) for (const f of elegidas) Object.assign(f, cambio);
            const copias = elegidas.map((f) => ({ ...f }));
            return Promise.resolve({ data: uno ? copias[0] ?? null : copias, error: null }).then(r);
          };
          return q;
        },
      }),
    }));
    vi.doMock("@/lib/cifrado", () => ({ descifrar: () => "token" }));
    vi.doMock("@/lib/rotacion", () => ({ closerDeLaRotacion: async () => null }));
    vi.doMock("@/lib/ghl", async () => ({
      ...(await vi.importActual<typeof import("@/lib/ghl")>("@/lib/ghl")),
      eventosGhl: async () => eventos,
      nombreCalendarioGhl: async () => "General",
      estadoCitaGhl: async () => "sigue",
    }));
    vi.doMock("@/lib/workflows-motor", () => ({ dispararWorkflows: async () => 1, dispararEtiquetas: async () => 1 }));
    vi.doMock("@/lib/aviso-closer", () => ({ avisarCloserAgenda: async () => undefined }));
    vi.doMock("@/lib/avisos-whatsapp", () => ({ avisarCita: avisoCita, avisarVenta: async () => undefined }));
    return (await import("@/lib/ghl-sync")).sincronizarCalendarios;
  };
  const ahora = new Date("2099-11-20T10:00:00Z");
  const citaApp = { id: "c1", proyecto_id: "p1", lead_id: "l1", estado: "pendiente", fecha: "2099-11-21T16:00:00.000Z", closer_id: null, agendada_por: null, ghl_cita_id: "g1", origen: "ghl", canal: null, ghl_calendario: "General", creado_en: "2099-11-19T09:00:00Z" };

  beforeEach(() => {
    avisoCita.mockClear();
    for (const k of Object.keys(tablas)) delete tablas[k];
    Object.assign(tablas, {
      proyectos: [{ id: "p1", zona_horaria: "Europe/Madrid", ghl_token: "x", ghl_location_id: "loc", ghl_calendarios: ["cal1"] }],
      leads: [{ id: "l1", proyecto_id: "p1", ghl_contact_id: "ct1", estado_caller: "agendado", etiquetas: [] }],
      citas: [{ ...citaApp }],
    });
    eventos.length = 0;
  });

  it("GHL la mueve a otra hora futura → avisarCita(id, «reagendada»)", async () => {
    eventos.push({ id: "g1", startTime: "2099-11-22T18:00:00.000Z", calendarId: "cal1", contactId: "ct1" });
    const sync = await preparar();
    await sync("p1", { ahora });
    expect(tablas.citas[0].fecha).toBe("2099-11-22T18:00:00.000Z");
    expect(avisoCita).toHaveBeenCalledWith("c1", "reagendada");
  });

  it("misma hora (o solo cambia el estado): no avisa", async () => {
    eventos.push({ id: "g1", startTime: citaApp.fecha, calendarId: "cal1", contactId: "ct1", appointmentStatus: "confirmed" });
    const sync = await preparar();
    await sync("p1", { ahora });
    expect(avisoCita).not.toHaveBeenCalled();
  });
});
