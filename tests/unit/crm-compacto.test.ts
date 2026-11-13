// C5 (13 nov 2026): el CRM manda los leads compactos sin perder nada, y el filtro de estado del tablero «Closers».
import { describe, expect, it } from "vitest";
import { compactarCrm, descompactarCrm } from "@/app/(panel)/crm/compacto";
import { pasaFiltroCita } from "@/app/(panel)/crm/estado-cita";
import type { LeadTarjeta } from "@/app/(panel)/crm/tablero";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const lead = (i: number): LeadTarjeta => ({
  id: uuid(i),
  nombre: `Nombre${i}`,
  apellido: `Apellido${i}`,
  email: i % 3 ? `persona${i}@gmail.com` : null,
  telefono: i % 4 ? `+5730012${String(i).padStart(5, "0")}` : null,
  pais: i % 5 ? "CO" : null,
  etapa_id: uuid(100_000 + (i % 6)),
  caller_id: i % 2 ? uuid(200_000 + (i % 4)) : null,
  closer_id: i % 7 ? null : uuid(300_000 + (i % 3)),
  estado_caller: ["nuevo", "no_contesta", "llamar_luego"][i % 3],
  creado_en: new Date(Date.UTC(2026, 9, 1) + i * 3_600_000).toISOString(),
  etiquetas: i % 2 ? ["Canal: Meta", "webinar 1"] : [],
  invertir: i % 9 ? null : "Sí, más de 1.000 $",
  oferta: i % 11 ? null : "biblioteca",
  ...(i % 13 ? {} : { otroPipeline: true }),
});

describe("compactar los leads del CRM", () => {
  it("descompactar devuelve exactamente lo mismo", () => {
    const leads = Array.from({ length: 300 }, (_, i) => lead(i));
    // otroPipeline ausente = false (la tarjeta solo mira si es verdadero)
    const esperado = leads.map((l) => ({ ...l, otroPipeline: !!l.otroPipeline }));
    expect(descompactarCrm(compactarCrm(leads))).toEqual(esperado);
  });

  it("la fecha de alta conserva el día y la hora (hasta milisegundos)", () => {
    const l = { ...lead(1), creado_en: "2026-10-20T23:59:11.123456+00:00" };
    const [vuelta] = descompactarCrm(compactarCrm([l]));
    expect(vuelta.creado_en).toBe("2026-10-20T23:59:11.123Z");
    expect(vuelta.creado_en.slice(0, 10)).toBe(l.creado_en.slice(0, 10));
  });

  it("etiquetas vacías o nulas salen como lista vacía", () => {
    const l = { ...lead(2), etiquetas: null as unknown as string[] };
    expect(descompactarCrm(compactarCrm([l]))[0].etiquetas).toEqual([]);
  });

  it("con 4.616 leads inventados pesa mucho menos", () => {
    const leads = Array.from({ length: 4616 }, (_, i) => lead(i));
    const antes = JSON.stringify(leads).length;
    const despues = JSON.stringify(compactarCrm(leads)).length;
    console.log(`CRM 4.616 leads inventados: ${antes} → ${despues} bytes (${Math.round((1 - despues / antes) * 100)} % menos)`);
    expect(despues).toBeLessThan(antes * 0.6);
  });
});

describe("filtro de estado del tablero «Closers»", () => {
  it("«Todos» deja pasar todas", () => {
    for (const e of ["pendiente", "cerrada", "cancelada"]) expect(pasaFiltroCita(e, "")).toBe(true);
  });
  it("«Pendientes» = las abiertas, como en Agendas", () => {
    expect(["pendiente", "confirmacion_pendiente", "confirmada", "no_show"].filter((e) => pasaFiltroCita(e, "abiertas"))).toEqual(["pendiente", "confirmacion_pendiente", "confirmada"]);
  });
  it("un estado concreto deja pasar solo ese", () => {
    expect(pasaFiltroCita("no_show", "no_show")).toBe(true);
    expect(pasaFiltroCita("perdida", "no_show")).toBe(false);
  });
});
