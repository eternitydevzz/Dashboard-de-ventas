// Ola 3 · C9: arreglos de la lista del revisor (C6). Base simulada: cada consulta guarda sus pasos y contesta
// lo que diga `contestar` (o `base["tabla:tipo"]`, o vacío).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: { message: string; code?: string } | null; count?: number };
type Consulta = { tabla: string; ops: [string, unknown[]][] };
let consultas: Consulta[];
let base: Record<string, Resp>;
let contestar: (c: Consulta) => Resp | undefined;
const borrarUsuario = vi.fn(async () => ({ error: null }));
const tipo = (c: Consulta) => ["delete", "upsert", "update", "insert"].find((o) => c.ops.some(([x]) => x === o)) ?? "select";
const arg = (c: Consulta, op: string) => c.ops.find(([x]) => x === op)?.[1];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { createUser: async () => ({ data: { user: { id: "nuevo" } }, error: null }), deleteUser: borrarUsuario } },
    rpc: async (fn: string) => base[`rpc:${fn}`] ?? { data: null, error: null },
    from: (tabla: string) => {
      const c: Consulta = { tabla, ops: [] };
      consultas.push(c);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "not", "ilike", "or", "neq", "gte", "lte", "order", "range", "limit", "update", "insert", "upsert", "delete", "maybeSingle", "single"])
        q[m] = (...a: unknown[]) => (c.ops.push([m, a]), q);
      q.then = (r: (v: Resp) => unknown, f?: (e: unknown) => unknown) =>
        Promise.resolve(contestar(c) ?? base[`${c.tabla}:${tipo(c)}`] ?? { data: null, error: null }).then(r, f);
      return q;
    },
  }),
}));
vi.mock("@/lib/permisos", async () => ({ exigirSeccion: async () => (await import("@/lib/sesion")).getSesion(), soloLoSuyo: () => false }));
vi.mock("@/lib/errores-app", () => ({ guardarError: async () => undefined }));
vi.mock("@/lib/datos", async (original) => ({ ...(await original<typeof import("@/lib/datos")>()), equipo: async () => [], conBajas: async (a: unknown) => a, registrarActividad: async () => undefined }));
vi.mock("@/lib/finanzas-datos", () => ({ cargarFinanzas: async () => ({ ventas: [], pagos: [], productos: [] }) }));
vi.mock("@/lib/equipo", () => ({ cargarEquipo: async () => ({ miembros: [], comisionesRol: {} }) }));
vi.mock("@/lib/finanzas", async (original) => ({
  ...(await original<typeof import("@/lib/finanzas")>()),
  liquidacionesMes: () => [{ perfil_id: "ana", base_facturado: 0, base_cobrado: 0, comision_facturado: 0, comision_cobrado: 50, detalle: [] }],
}));

const { getSesion } = await import("@/lib/sesion");
const crm = await import("@/app/(panel)/crm/acciones");
const { herramientaBorrar, herramientaAgendar } = await import("@/lib/mcp/cambiar");
const { registrarVenta, agendarCita } = await import("@/app/(panel)/leads/acciones");
const fin = await import("@/app/(panel)/finanzas/acciones");
const { crearMiembro } = await import("@/app/(panel)/equipo/acciones");
const { registrarDevolucion } = await import("@/app/(panel)/ventas/acciones");

const fallo: Resp = { data: null, error: { message: "la base no responde" } };
const de = (tabla: string, t: string) => consultas.filter((c) => c.tabla === tabla && tipo(c) === t);
// Una tabla con muchas filas: contesta el trozo pedido (`in`) y la página pedida (`range`), como Supabase (máx. 1.000)
const paginada = (filas: { lead_id: string }[]) => (c: Consulta) => {
  const trozo = (arg(c, "in")?.[1] ?? []) as string[];
  const [d, h] = (arg(c, "range") ?? [0, 999]) as number[];
  return { data: filas.filter((f) => trozo.includes(f.lead_id)).slice(d, Math.min(h + 1, d + 1000)), error: null };
};
const leadsPedidos = (c: Consulta) => ({ data: ((arg(c, "in")?.[1] ?? []) as string[]).map((id) => ({ id, nombre: id, apellido: null, pipeline_id: null })), error: null });

beforeEach(() => {
  consultas = [];
  base = {};
  contestar = () => undefined;
  borrarUsuario.mockClear();
  vi.mocked(getSesion).mockResolvedValue({ perfil: { id: "ceo", rol: "ceo" }, proyecto: { id: "p1", nombre: "Eternity", zona_horaria: "Europe/Madrid" } } as never);
});

describe("1 · Borrar en masa (crítico)", () => {
  // 1.100 citas: la del lead «x» está en la fila 1.050 (fuera de la 1.ª página); «y» tiene una venta
  const citas = Array.from({ length: 1100 }, (_, i) => ({ lead_id: i === 1050 ? "x" : "otro", ghl_cita_id: null }));
  const responder = (c: Consulta) => {
    if (c.tabla === "citas" && tipo(c) === "select") return paginada(citas)(c);
    if (c.tabla === "ventas" && tipo(c) === "select") return paginada([{ lead_id: "y" }])(c);
    if (c.tabla === "leads" && tipo(c) === "select") return leadsPedidos(c);
  };

  it("con más de 1.000 citas, el lead con cita en la 2.ª página y el lead con venta no se borran", async () => {
    contestar = responder;
    expect(await crm.borrarLeads(["x", "y", "z", "otro"])).toEqual({ borrados: 1, saltados: 3 });
    expect(de("leads", "delete").map((c) => arg(c, "in")?.[1])).toEqual([["z"]]);
  });

  it("si falla leer las citas o las ventas, no se borra nada y avisa", async () => {
    for (const tabla of ["citas", "ventas"]) {
      consultas = [];
      contestar = (c) => (c.tabla === tabla ? fallo : responder(c));
      expect(await crm.borrarLeads(["x", "z"])).toMatchObject({ error: expect.any(String) });
      expect(de("leads", "delete")).toHaveLength(0);
    }
  });

  it("450 leads: las lecturas y el borrado van en trozos de 200", async () => {
    contestar = responder;
    const ids = Array.from({ length: 450 }, (_, i) => `n${i}`);
    expect(await crm.borrarLeads(ids)).toEqual({ borrados: 450, saltados: 0 });
    const tamanos = (cs: Consulta[]) => cs.map((c) => (arg(c, "in")?.[1] as string[]).length);
    expect(tamanos(de("leads", "delete"))).toEqual([200, 200, 50]);
    expect(tamanos(de("citas", "select"))).toEqual([200, 200, 50]);
  });

  it("MCP: la vista previa cuenta la cita de la 2.ª página; si falla la lectura, error (no dice «borrar todos»)", async () => {
    contestar = responder;
    const v = (await herramientaBorrar({ leadIds: ["x", "y", "z"] })) as { haria: string };
    expect(v.haria).toBe("Borrar 1 de 3 leads.");
    contestar = (c) => (c.tabla === "citas" ? fallo : responder(c));
    await expect(herramientaBorrar({ leadIds: ["x", "z"] })).rejects.toThrow(/la base no responde/);
  });
});

describe("3 · Otras acciones en masa, en trozos de 200", () => {
  const ids = Array.from({ length: 450 }, (_, i) => `n${i}`);
  const tamanos = (cs: Consulta[]) => cs.map((c) => (arg(c, "in")?.[1] as string[]).length);
  it("asignar: el update de leads va en 3 trozos", async () => {
    expect(await crm.asignarLeads(ids, null)).toBeUndefined();
    expect(tamanos(de("leads", "update"))).toEqual([200, 200, 50]);
  });
  it("etiquetas: lee los leads en trozos y cambia cada uno", async () => {
    contestar = (c) => (c.tabla === "leads" && tipo(c) === "select" ? { data: ((arg(c, "in")?.[1] ?? []) as string[]).map((id) => ({ id, etiquetas: [] })), error: null } : undefined);
    expect(await crm.cambiarEtiquetas(ids, ["vip"], [])).toBe(450);
    expect(tamanos(de("leads", "select"))).toEqual([200, 200, 50]);
  });
  it("etiquetas: si falla leer, error (antes «0 cambiados»)", async () => {
    base["leads:select"] = fallo;
    expect(await crm.cambiarEtiquetas(ids, ["vip"], [])).toMatchObject({ error: expect.any(String) });
  });
});

describe("2 · Escrituras que no podían fallar en silencio (altos)", () => {
  const venta = () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ producto: "pr1", facturacion: "1000", cash: "200", tipo_pago: "reserva", metodo: "stripe" })) fd.set(k, v);
    return fd;
  };
  beforeEach(() => {
    base["leads:select"] = { data: { id: "l1", caller_id: null, closer_id: null, pipeline_id: null }, error: null };
    base["productos:select"] = { data: { id: "pr1", nombre: "VIP" }, error: null };
    base["citas:select"] = { data: { id: "c1", closer_id: "luis", fecha: "2026-01-01T10:00:00Z" }, error: null };
  });
  // Ola 6 (C1): venta, plazos y cierre de la cita van juntos en registrar_venta (tests/unit/venta-cobros.test.ts)
  it("venta: si fallan los plazos pendientes o el cierre de la cita, avisa del error", async () => {
    base["rpc:registrar_venta"] = fallo;
    expect(await registrarVenta("l1", venta())).toMatchObject({ error: expect.any(String) });
    delete base["rpc:registrar_venta"];
    expect(await registrarVenta("l1", venta())).toBeUndefined();
  });

  it("comisiones: si falla guardar las nuevas, las pendientes de antes no se borran", async () => {
    base["citas:select"] = { data: [], error: null };
    base["liquidaciones:upsert"] = fallo;
    expect(await fin.calcularLiquidaciones("2026-11")).toMatchObject({ error: expect.any(String) });
    expect(de("liquidaciones", "upsert")).toHaveLength(1); // falló al guardar, no antes
    expect(de("liquidaciones", "delete")).toHaveLength(0);
  });
  it("comisiones: sin fallo, guarda las nuevas y borra solo las pendientes de quien ya no sale", async () => {
    base["citas:select"] = { data: [], error: null }; // citas cerradas del mes (aquí, ninguna)
    expect(await fin.calcularLiquidaciones("2026-11")).toMatchObject({ personas: 1 });
    const borrado = de("liquidaciones", "delete")[0];
    expect(arg(borrado, "not")).toEqual(["perfil_id", "in", "(ana)"]);
    expect(borrado.ops).toContainEqual(["eq", ["estado", "pendiente"]]);
  });

  it("importar movimientos: si falla, no dice «importados N»", async () => {
    base["movimientos:insert"] = fallo;
    expect(await fin.importarMovimientos("fecha,descripcion,importe\n2026-11-01,café,-3", null)).toMatchObject({ error: expect.any(String) });
  });
});

describe("3 · Dobles clics y estados (medios)", () => {
  beforeEach(() => {
    // delProyecto: la fila es del proyecto
    for (const t of ["liquidaciones", "vencimientos", "egresos_programados", "cuentas"]) base[`${t}:select`] = { data: { id: "f1", proyecto_id: "p1" }, error: null };
  });
  it("pagar liquidación: si otro la pagó a la vez (0 filas), «Ya está pagada.» y se borra el gasto creado", async () => {
    base["liquidaciones:select"] = { data: { id: "f1", proyecto_id: "p1", estado: "pendiente", perfil_id: "ana", comision_cobrado: 50, mes: "2026-11", perfiles: { nombre: "Ana" } }, error: null };
    base["movimientos:insert"] = { data: { id: "m1" }, error: null };
    base["liquidaciones:update"] = { data: [], error: null };
    expect(await fin.pagarLiquidacion("f1", null)).toEqual({ error: "Ya está pagada." });
    expect(de("liquidaciones", "update")[0].ops).toContainEqual(["eq", ["estado", "pendiente"]]);
    expect(de("movimientos", "delete").map((c) => arg(c, "eq"))).toEqual([["id", "m1"]]);
  });
  it("pagar liquidación: si falla crear el gasto, no se marca pagada", async () => {
    base["liquidaciones:select"] = { data: { id: "f1", proyecto_id: "p1", estado: "pendiente", perfil_id: "ana", comision_cobrado: 50, mes: "2026-11" }, error: null };
    base["movimientos:insert"] = fallo;
    expect(await fin.pagarLiquidacion("f1", null)).toMatchObject({ error: expect.any(String) });
    expect(de("liquidaciones", "update")).toHaveLength(0);
  });
  it("«Cobrado» de un deudor dos veces: la 2.ª no crea otro ingreso", async () => {
    base["vencimientos:select"] = { data: { id: "f1", proyecto_id: "p1", estado: "pendiente", venta_id: null, importe: 10, nombre: "Juan" }, error: null };
    base["vencimientos:update"] = { data: [], error: null };
    expect(await fin.marcarVencimiento("f1", "pagado")).toMatchObject({ error: expect.stringMatching(/acaba de cambiar/) });
    expect(de("vencimientos", "update")[0].ops).toContainEqual(["eq", ["estado", "pendiente"]]);
    expect(de("movimientos", "insert")).toHaveLength(0);
  });
  it("«Registrar pago» programado dos veces: la 2.ª borra su gasto y avisa", async () => {
    base["egresos_programados:select"] = { data: { id: "f1", proyecto_id: "p1", importe: 5, proxima: "2026-11-01", cada: "mes", descripcion: "Luz" }, error: null };
    base["movimientos:insert"] = { data: { id: "m2" }, error: null };
    base["egresos_programados:update"] = { data: [], error: null };
    expect(await fin.registrarProgramado("f1")).toMatchObject({ error: expect.stringMatching(/ya se registró/) });
    expect(de("egresos_programados", "update")[0].ops).toContainEqual(["eq", ["proxima", "2026-11-01"]]);
    expect(de("movimientos", "delete").map((c) => arg(c, "eq"))).toEqual([["id", "m2"]]);
  });

  it("alta de miembro: si falla algo después de crear el usuario, se borra ese usuario", async () => {
    base["miembros_proyecto:insert"] = fallo;
    const r = await crearMiembro({ nombres: ["Ana"], area_id: null, puesto_id: null, comision: null, lider: false, acceso: { modo: "crear", email: "ana@x.com", password: "12345678", rol: "caller", mercado: "latam", telefono: "+34 600 000 000" } } as never);
    expect(r).toMatchObject({ error: expect.any(String) });
    expect(borrarUsuario).toHaveBeenCalledWith("nuevo");
    borrarUsuario.mockClear();
    delete base["miembros_proyecto:insert"];
    base["miembros_equipo:insert"] = fallo;
    await crearMiembro({ nombres: ["Ana"], area_id: null, puesto_id: null, comision: null, lider: false, acceso: { modo: "crear", email: "ana@x.com", password: "12345678", rol: "caller", mercado: "latam", telefono: "+34 600 000 000" } } as never);
    expect(borrarUsuario).toHaveBeenCalledWith("nuevo");
  });
});

describe("4 · Bajos", () => {
  it("agendar (jefe y MCP) solo con closers activos", async () => {
    base["leads:select"] = { data: { id: "l1", caller_id: null, closer_id: null, pipeline_id: null }, error: null };
    await agendarCita("l1", "luis", "2026-11-20T10:00", "");
    expect(de("miembros_proyecto", "select")[0].ops).toContainEqual(["eq", ["perfiles.activo", true]]);
    consultas = [];
    contestar = (c) => (c.tabla === "leads" ? leadsPedidos(c) : undefined);
    base["miembros_proyecto:select"] = { data: [{ perfil_id: "luis", perfiles: { nombre: "Luis", rol: "closer", tambien_closer: false, activo: false } }], error: null };
    await expect(herramientaAgendar({ leadId: "l1", closer: "Luis", fecha: "2026-11-20T10:00" })).rejects.toThrow();
  });

  it("devolución: fecha que no es AAAA-MM-DD, rechazada", async () => {
    base["ventas:select"] = { data: { id: "v1", lead_id: "l1", vendedor_id: "ceo", cash_collected: 100, devuelto: null }, error: null };
    expect(await registrarDevolucion("v1", "10", "mañana", "")).toEqual({ error: "Fecha no válida." });
  });
});
