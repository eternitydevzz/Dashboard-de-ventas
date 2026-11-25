// Calendario por closer (Jose, 25 nov 2026): un calendario de GHL es «personal» de una persona si solo lo tiene puesto
// ella en su ficha, está activa y es closer, caller «También closer» o CEO «También closer». Datos inventados.
import { describe, expect, it } from "vitest";
import { duenaDeCalendario, type MiembroCalendario } from "@/lib/calendario-personal";

const m = (perfil_id: string, cal: string | null, rol = "caller", o: { activo?: boolean; tambien_closer?: boolean } = {}): MiembroCalendario => ({
  perfil_id,
  ghl_calendar_id: cal,
  perfiles: { rol, activo: o.activo ?? true, tambien_closer: o.tambien_closer ?? true },
});

describe("duenaDeCalendario", () => {
  it("la caller «También closer» que lo tiene sola es su dueña", () => {
    expect(duenaDeCalendario([m("yara", "cal-yara"), m("facu", "cal-facu", "closer")], "cal-yara")).toBe("yara");
  });

  it("un closer también puede ser dueño", () => {
    expect(duenaDeCalendario([m("facu", "cal-facu", "closer", { tambien_closer: false })], "cal-facu")).toBe("facu");
  });

  it("un calendario puesto en dos fichas no es de nadie (p. ej. el Principal)", () => {
    expect(duenaDeCalendario([m("ana", "cal-x", "closer"), m("luis", "cal-x", "closer")], "cal-x")).toBeNull();
  });

  it("de una persona dada de baja, no es de nadie", () => {
    expect(duenaDeCalendario([m("yara", "cal-yara", "caller", { activo: false })], "cal-yara")).toBeNull();
  });

  it("de una caller sin «También closer», no es de nadie", () => {
    expect(duenaDeCalendario([m("yara", "cal-yara", "caller", { tambien_closer: false })], "cal-yara")).toBeNull();
  });

  it("sin calendario (null o vacío), nadie", () => {
    const todos = [m("yara", "cal-yara")];
    expect(duenaDeCalendario(todos, null)).toBeNull();
    expect(duenaDeCalendario(todos, "")).toBeNull();
    expect(duenaDeCalendario([m("yara", "")], "")).toBeNull();
  });

  it("compara sin espacios", () => {
    expect(duenaDeCalendario([m("yara", " cal-yara ")], "cal-yara")).toBe("yara");
    expect(duenaDeCalendario([m("yara", "cal-yara")], " cal-yara")).toBe("yara");
  });

  it("una ficha de prueba repetida pero de baja no le quita el calendario a la activa", () => {
    expect(duenaDeCalendario([m("yara", "cal-yara"), m("vieja", "cal-yara", "caller", { activo: false })], "cal-yara")).toBe("yara");
  });
});
