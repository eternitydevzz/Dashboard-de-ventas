// Calendario por closer, 2.ª parte (Jose, 25 nov 2026): el botón «Link de agenda» de quien tiene calendario personal
// copia su enlace propio: el link general del proyecto + `cal=<su calendario>`. Al resto no le cambia nada.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { linkConCalendario } from "@/lib/calendario-personal";

type Fila = Record<string, unknown>;
const base = vi.hoisted(() => ({ miembros: [] as Record<string, unknown>[] }));
vi.mock("@/lib/datos", () => ({
  db: () => ({
    from: () => {
      const filtros: ((f: Fila) => boolean)[] = [];
      let uno = false;
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (c: string, v: unknown) => (filtros.push((f) => f[c] === v), q);
      q.maybeSingle = () => ((uno = true), q);
      q.then = (r: (v: unknown) => unknown) => {
        const filas = base.miembros.filter((f) => filtros.every((x) => x(f)));
        return Promise.resolve({ data: uno ? filas[0] ?? null : filas, error: null }).then(r);
      };
      return q;
    },
  }),
}));
const { miLinkAgenda } = await import("@/lib/mercado-datos");

const proyecto = { id: "p1", link_agenda: "https://web.test/agenda?utm_source=callers", link_agenda_es: "https://web.test/agendas-espana" } as never;
const miembro = (perfil_id: string, mercado: string | null, cal: string | null, o: { rol?: string; tambien_closer?: boolean; activo?: boolean } = {}) => ({
  proyecto_id: "p1",
  perfil_id,
  mercado,
  ghl_calendar_id: cal,
  perfiles: { rol: o.rol ?? "caller", activo: o.activo ?? true, tambien_closer: o.tambien_closer ?? false },
});

describe("linkConCalendario", () => {
  it("añade cal= respetando lo que ya trae el enlace", () => {
    expect(linkConCalendario("https://web.test/agenda?utm_source=callers", "cal-yara")).toBe("https://web.test/agenda?utm_source=callers&cal=cal-yara");
    expect(linkConCalendario("https://web.test/agenda", " cal-yara ")).toBe("https://web.test/agenda?cal=cal-yara");
  });
  it("sin enlace base, nada; con un enlace que no es una URL, el enlace tal cual", () => {
    expect(linkConCalendario(null, "cal-yara")).toBeNull();
    expect(linkConCalendario("no es una url", "cal-yara")).toBe("no es una url");
  });
});

describe("miLinkAgenda", () => {
  beforeEach(() => {
    base.miembros = [
      miembro("yara", "es", "cal-yara", { tambien_closer: true }),
      miembro("paula", "latam", "cal-paula", { tambien_closer: true }),
      miembro("ana", "es", null),
      miembro("luis", "latam", null),
      miembro("thiago", "latam", "cal-principal", { rol: "closer" }),
    ];
  });

  it("caller de España con calendario propio: el general + su calendario (no el de España)", async () => {
    expect(await miLinkAgenda(proyecto, "yara")).toBe("https://web.test/agenda?utm_source=callers&cal=cal-yara");
  });

  it("caller de Latam con calendario propio: el general + su calendario", async () => {
    expect(await miLinkAgenda(proyecto, "paula")).toBe("https://web.test/agenda?utm_source=callers&cal=cal-paula");
  });

  it("sin calendario propio, como hoy: el de su mercado", async () => {
    expect(await miLinkAgenda(proyecto, "ana")).toBe("https://web.test/agendas-espana");
    expect(await miLinkAgenda(proyecto, "luis")).toBe("https://web.test/agenda?utm_source=callers");
  });

  it("un closer puro (el Principal de Thiago) no se considera calendario personal", async () => {
    expect(await miLinkAgenda(proyecto, "thiago")).toBe("https://web.test/agenda?utm_source=callers");
  });

  it("si su calendario lo tiene también otra ficha, como hoy", async () => {
    base.miembros.push(miembro("otra", "es", "cal-yara", { tambien_closer: true }));
    expect(await miLinkAgenda(proyecto, "yara")).toBe("https://web.test/agendas-espana");
  });
});
