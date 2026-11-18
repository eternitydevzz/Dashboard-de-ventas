// Pendiente de la sección 7 (límites conocidos): «faltan índices de lead_id en 4 tablas». Comprobado en producción el
// 18 nov 2026 (solo lectura, pg_index): sin índice en lead_id solo quedaban clientes, seguimientos_cliente,
// vencimientos y workflow_ejecuciones. Mismo estilo que tests/unit/f4c-migracion.test.ts (sin aplicar en ninguna base).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = () => readFileSync("supabase/migrations/20261127100000_indices_lead_id.sql", "utf8").replace(/--.*$/gm, "");

describe("migración 20261127100000_indices_lead_id", () => {
  it("solo añade: nada de drop, ni concurrently (la CLI la corre en una transacción)", () => {
    expect(sql()).not.toMatch(/\bdrop\b/i);
    expect(sql()).not.toMatch(/concurrently/i);
  });

  it("índice en lead_id de las 4 tablas que no lo tenían", () => {
    for (const t of ["clientes", "seguimientos_cliente", "vencimientos", "workflow_ejecuciones"]) {
      expect(sql()).toContain(`create index if not exists ${t}_lead_id_idx on public.${t} (lead_id) where lead_id is not null`);
    }
  });

  // En producción ya existe workflow_ejecuciones_lead_idx = (workflow_id, lead_id): con ese nombre y «if not exists»
  // el índice nuevo no se crearía y nadie se enteraría. Por eso el sufijo es _lead_id_idx.
  it("no reutiliza el nombre *_lead_idx (choca con workflow_ejecuciones_lead_idx)", () => {
    expect(sql()).not.toMatch(/\b\w+_lead_idx\b/);
  });
});
