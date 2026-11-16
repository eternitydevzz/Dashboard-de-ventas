// Fase 2 · zona a (Dinero): la migración 20261120100000 lee bien lo esencial (sin aplicarla en ninguna base;
// el comportamiento real lo prueba tests/integracion/f2a-dinero.test.ts en GitHub).
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RUTA = "supabase/migrations/20261120100000_dinero.sql";
const sql = () => (existsSync(RUTA) ? readFileSync(RUTA, "utf8").replace(/--.*$/gm, "") : "");
const funcion = (nombre: string) => {
  const s = sql();
  const i = s.indexOf(`create or replace function public.${nombre}(`);
  if (i < 0) return "";
  return s.slice(i, s.indexOf("$$;", i));
};

describe("f2a · migración de dinero", () => {
  it("A5-01 · registrar_cobro: en una membresía el tope suma los plazos de la venta (sin los «no paga»)", () => {
    const f = funcion("registrar_cobro");
    expect(f).toContain("for update");
    expect(f).toContain("'mensual'");
    expect(f).toMatch(/from vencimientos where venta_id = p_venta and estado <> 'no_paga'/);
    expect(f).toContain("excede_facturacion");
  });

  it("S5-4 · registrar_venta: bloquea el lead al empezar y rechaza la misma venta sin cita de hace < 1 minuto", () => {
    const f = funcion("registrar_venta");
    const candado = f.indexOf("from leads where id = p_lead and proyecto_id = p_proyecto for update");
    expect(candado).toBeGreaterThan(-1);
    expect(candado).toBeLessThan(f.indexOf("update citas"));
    expect(f).toContain("interval '1 minute'");
    expect(f).toContain("registrar_venta: duplicada");
    expect(f).toContain("cita_cerrada"); // lo de antes sigue
  });

  it("S2-8 · borrar_venta: borra, devuelve la cita a «seguimiento» y el lead deja «vendido», todo en una función", () => {
    const f = funcion("borrar_venta");
    expect(f).toContain("delete from ventas where id = p_venta and proyecto_id = p_proyecto");
    expect(f).toContain("estado = 'cerrada'");
    expect(f).toContain("'seguimiento'");
    expect(f).toMatch(/'agendado' else 'nuevo'/);
    expect(f).toContain("borrar_venta: venta no encontrada");
  });

  it("permisos: solo la clave de servicio, como las de antes", () => {
    const s = sql();
    for (const firma of [
      "registrar_cobro(uuid, uuid, numeric, text, uuid, timestamptz)",
      "registrar_venta(uuid, uuid, uuid, uuid, numeric, numeric, text, integer, text, text, timestamptz, jsonb, uuid, timestamptz, smallint)",
      "borrar_venta(uuid, uuid)",
    ]) {
      expect(s, firma).toContain(`revoke execute on function public.${firma} from public, anon, authenticated;`);
      expect(s, firma).toContain(`grant execute on function public.${firma} to service_role;`);
    }
  });

  it("solo añade: nada de drop ni de tocar tablas", () => {
    expect(sql()).not.toMatch(/\bdrop\b|alter table|create table/i);
  });
});
