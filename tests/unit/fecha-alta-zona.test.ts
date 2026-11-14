// #418 (14 nov): KPIs → Leads se pinta en el servidor (UTC) y en el navegador (zona de cada uno). La fecha de alta
// tiene que salir en la zona del proyecto para que los dos den el mismo día.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const leads = readFileSync(new URL("../../src/app/(panel)/kpis/leads.tsx", import.meta.url), "utf8");

describe("KPIs → Leads: fecha de alta", () => {
  it("toda fecha de la tabla lleva la zona del proyecto", () => {
    const fechas = leads.split("\n").filter((l) => /toLocaleDateString\(/.test(l));
    expect(fechas.length).toBeGreaterThan(0);
    expect(fechas.filter((l) => !/timeZone: zona/.test(l))).toEqual([]);
  });
  it("el mismo instante da el mismo día en UTC y en Madrid con la zona fijada", () => {
    const alta = "2026-10-24T01:30:00Z"; // 23 oct en Nueva York, 24 oct en Madrid
    const enNY = new Date(alta).toLocaleDateString("es-ES", { timeZone: "America/New_York" });
    expect(enNY).toBe("23/10/2026");
  });
});
