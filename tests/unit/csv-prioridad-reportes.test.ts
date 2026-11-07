import { describe, expect, it } from "vitest";
import { filaALead, mapaValido, proponerCampo } from "@/lib/csv";
import { nivel, puntuacion } from "@/lib/prioridad";
import { tasasCloser } from "@/lib/reportes";
import { cuentaPorEstado } from "@/lib/cola";
import { recursosVisibles } from "@/lib/recursos";

describe("CSV: propuesta de columnas", () => {
  it("reconoce las columnas de GHL en inglés", () => {
    expect(proponerCampo("Contact Id")).toBe("ghl_contact_id");
    expect(proponerCampo("First Name")).toBe("nombre");
    expect(proponerCampo("Phone")).toBe("telefono");
    expect(proponerCampo("Tags")).toBe("etiquetas");
    expect(proponerCampo("Business Name")).toBe("ignorar");
  });
  it("reconoce nombres en español y lo demás es respuesta del formulario", () => {
    expect(proponerCampo("Correo")).toBe("email");
    expect(proponerCampo("Móvil")).toBe("telefono");
    expect(proponerCampo("¿Cuándo quieres empezar?")).toBe("respuesta");
  });
  it("mapaValido ignora valores inventados y usa la propuesta", () => {
    const m = mapaValido({ Correo: "hackeo", Ciudad: "ignorar" }, ["Correo", "Ciudad"]);
    expect(m).toEqual({ Correo: "email", Ciudad: "ignorar" });
  });
});

describe("CSV: fila → lead", () => {
  it("una fila de exportación de GHL", () => {
    const l = filaALead({
      "Contact Id": "abc",
      "First Name": "Ana",
      "Last Name": "Pérez",
      Phone: "+1555",
      Email: "ANA@Mail.com",
      "Business Name": "",
      Created: "2026-10-02T11:52:54-04:00",
      Tags: "biblioteca recursos, webinar1",
      "¿Cuándo quieres empezar?": "Ya mismo",
    });
    expect(l).toMatchObject({ ghl_contact_id: "abc", nombre: "Ana", apellido: "Pérez", telefono: "+1555", email: "ana@mail.com" });
    expect(l.etiquetas).toEqual(["biblioteca recursos", "webinar1"]);
    expect(l.creado_en).toBe("2026-10-02T15:52:54.000Z");
    expect(l.respuestas).toEqual([{ pregunta: "¿Cuándo quieres empezar?", respuesta: "Ya mismo" }]);
  });
  it("respeta el mapa elegido: nombre completo y columnas ignoradas", () => {
    const l = filaALead({ "Nombre completo": "Juan Carlos Ruiz", Ciudad: "Miami" }, { "Nombre completo": "nombre_completo", Ciudad: "ignorar" });
    expect(l.nombre).toBe("Juan");
    expect(l.apellido).toBe("Carlos Ruiz");
    expect(l.respuestas).toEqual([]);
  });
  it("una fecha rota no rompe la importación", () => {
    expect(filaALead({ Created: "ayer" }).creado_en).toBeNull();
  });
});

describe("Prioridad A/B/C", () => {
  const r = (pares: [string, string][]) => pares.map(([pregunta, respuesta]) => ({ pregunta, respuesta }));
  it("el lead más caliente es A", () => {
    const p = puntuacion(r([
      ["Si encuentras el programa correcto, ¿estás en condiciones de invertir en tu formación?", "Sí, ahora"],
      ["¿Cuándo quieres empezar?", "Ya mismo"],
      ["¿Cuánto tiempo por semana le puedes dedicar?", "5 a 10 h"],
    ]));
    expect(p).toBe(73);
    expect(nivel(p).texto).toBe("Prioridad A");
  });
  it("sin respuestas es C", () => {
    expect(puntuacion([])).toBe(0);
    expect(nivel(0).texto).toBe("Prioridad C");
  });
});

describe("Reporte del closer: tasas", () => {
  it("igual que el formulario antiguo", () => {
    expect(tasasCloser({ llamadas_realizadas: 8, llamadas_agendadas: 6, ventas: 2 })).toEqual({ agendamiento: "75\u00a0%", cierre: "33\u00a0%" });
  });
  it("sin llamadas no divide entre cero", () => {
    expect(tasasCloser({ llamadas_realizadas: 0, llamadas_agendadas: 0, ventas: 0 })).toEqual({ agendamiento: "—", cierre: "—" });
  });
});

describe("Cola del caller", () => {
  const lead = (id: string, estado: string) => ({ id, estado_caller: estado as never, respuestas: [], creado_en: "2026-10-01T00:00:00Z" });
  const leads = [lead("nuevo", "nuevo"), lead("luego", "llamar_luego"), lead("agendado", "agendado"), lead("seguimiento", "seguimiento")];
  it("C11 (7 nov): cuenta cuántos hay en cada columna; «todos» = toda la cola", () => {
    expect(cuentaPorEstado(leads)).toEqual({ todos: 4, nuevo: 1, llamar_luego: 1, agendado: 1, seguimiento: 1 });
  });
});

describe("Recursos visibles por rol", () => {
  const recursos = [
    { id: "a", para_rol: "todos" as const, tipo: "pdf" as const },
    { id: "b", para_rol: "caller" as const, tipo: "guion" as const },
    { id: "c", para_rol: "closer" as const, tipo: "video" as const },
  ];
  it("el closer no ve lo de solo callers", () => {
    expect(recursosVisibles(recursos, { rol: "closer" }).map((r) => r.id)).toEqual(["a", "c"]);
    expect(recursosVisibles(recursos, { rol: "caller" }).map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("el director lo ve todo y el filtro por tipo funciona", () => {
    expect(recursosVisibles(recursos, { rol: "director" })).toHaveLength(3);
    expect(recursosVisibles(recursos, { rol: "director" }, "guion").map((r) => r.id)).toEqual(["b"]);
  });
});
