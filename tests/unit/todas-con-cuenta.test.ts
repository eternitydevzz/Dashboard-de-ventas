// Cristian, 14 nov (noche: «KPIs sigue tardando muchísimo, arréglalo»). Medido en Vercel: las lecturas de KPIs → Leads
// tardaban 844 ms en frío, sobre todo por ir en tandas seguidas (1 página, luego de 2 en 2). Con la cuenta de filas pedida
// a la vez que la primera página, las demás van todas juntas: 2 tandas, las mismas peticiones y ninguna vacía.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
const { todas } = await import("@/lib/datos");

const filas = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));
function base(total: number) {
  const tabla = filas(total);
  const pedidas: [number, number][] = [];
  let tandaActual = 0;
  const tandas: number[] = [];
  const consulta = (a: number, b: number) => {
    pedidas.push([a, b]);
    tandas.push(tandaActual);
    return Promise.resolve().then(() => ({ data: tabla.slice(a, b + 1), error: null }));
  };
  const siguiente = () => tandaActual++;
  return { consulta, pedidas, tandas, siguiente };
}

describe("todas() con la cuenta de filas", () => {
  it("5.540 filas: mismas filas y en orden, 6 peticiones, en 2 tandas", async () => {
    const b = base(5540);
    const cuenta = () => Promise.resolve({ count: 5540, error: null });
    const r = await todas(b.consulta, cuenta);
    expect(r).toEqual(filas(5540));
    expect(b.pedidas).toHaveLength(6);
    expect(b.pedidas[0]).toEqual([0, 999]);
  });
  it("sin la cuenta o si falla, como antes (de 2 en 2, se para en la primera incompleta)", async () => {
    const b = base(2500);
    expect(await todas(b.consulta)).toEqual(filas(2500));
    expect(b.pedidas).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    const c = base(2500);
    expect(await todas(c.consulta, () => Promise.resolve({ count: null, error: { message: "x" } }))).toEqual(filas(2500));
  });
  it("menos de 1.000 filas: 1 sola petición, aunque haya cuenta", async () => {
    const b = base(148);
    expect(await todas(b.consulta, () => Promise.resolve({ count: 148, error: null }))).toEqual(filas(148));
    expect(b.pedidas).toHaveLength(1);
  });
  it("las páginas que faltan van todas a la vez tras la primera (no de 2 en 2)", async () => {
    let enVuelo = 0;
    let maximo = 0;
    const tabla = filas(4694);
    const consulta = async (a: number, z: number) => {
      enVuelo++;
      maximo = Math.max(maximo, enVuelo);
      await new Promise((r) => setTimeout(r, 5));
      enVuelo--;
      return { data: tabla.slice(a, z + 1), error: null };
    };
    expect(await todas(consulta, () => Promise.resolve({ count: 4694, error: null }))).toHaveLength(4694);
    expect(maximo).toBe(4); // páginas 2.ª a 5.ª juntas
  });
});
