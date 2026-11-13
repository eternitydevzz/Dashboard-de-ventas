// Bloque A (Cristian, 11 oct 2026): «Repartir leads» a mano entre callers. Sin base de datos.
// Formas (como las herramientas de reparto de Salesforce): equitativo (N leads por turnos), aleatorio (N leads,
// cada uno a un caller al azar), fijo por persona (N a cada uno) y con tope (nadie pasa de X leads sin trabajar).
export type ModoReparto = "equitativo" | "aleatorio" | "fijo" | "tope";
export const MODOS_REPARTO: { v: ModoReparto; t: string; d: string }[] = [
  { v: "equitativo", t: "Equitativo", d: "Eliges cuántos leads y se reparten por turnos, a partes iguales" },
  { v: "aleatorio", t: "Aleatorio", d: "Eliges cuántos leads y cada uno va a un caller al azar" },
  { v: "fijo", t: "Fijo por persona", d: "Eliges cuántos a cada caller (p. ej. 20 a cada uno)" },
  { v: "tope", t: "Con tope", d: "Nadie pasa de X leads sin trabajar (nuevos, no contesta y llamar luego)" },
];
// Estados que cuentan como «sin trabajar» para el tope (criterio de Claude, apuntado en el plan)
// C11 (7 nov): los que aún hay que trabajar (llamar o escribir); criterio de Claude, apuntado en el plan
export const SIN_TRABAJAR = ["nuevo", "wsp_enviado", "no_responde", "seguimiento", "llamar_luego", "link_enviado"]; // 10 nov: sin «Llamado»; «Link enviado» sigue siendo del caller

type OpcionesReparto = { modo: ModoReparto; n?: number; porPersona?: number; tope?: number };

// Devuelve a quién va cada lead (en el orden en que vienen). `carga`: leads sin trabajar que ya tiene cada caller.
export function planReparto(leads: string[], callers: string[], o: OpcionesReparto, carga: Record<string, number> = {}, azar: () => number = Math.random) {
  const plan = new Map<string, string>();
  if (!callers.length || !leads.length) return plan;
  const entero = (x: number | undefined) => Math.max(0, Math.floor(Number(x) || 0));
  if (o.modo === "equitativo" || o.modo === "aleatorio") {
    const cuantos = Math.min(entero(o.n), leads.length);
    leads.slice(0, cuantos).forEach((l, i) => plan.set(l, o.modo === "equitativo" ? callers[i % callers.length] : callers[Math.min(callers.length - 1, Math.floor(azar() * callers.length))]));
  } else if (o.modo === "fijo") {
    const k = entero(o.porPersona);
    let i = 0;
    for (let ronda = 0; ronda < k; ronda++) for (const c of callers) if (i < leads.length) plan.set(leads[i++], c);
  } else {
    const tope = entero(o.tope);
    const hueco = new Map(callers.map((c) => [c, Math.max(0, tope - (carga[c] ?? 0))]));
    let i = 0;
    // Por turnos, a quien aún tenga hueco, hasta llenar a todos o acabar los leads
    while (i < leads.length && [...hueco.values()].some((h) => h > 0)) {
      for (const c of callers) {
        if (i >= leads.length) break;
        if ((hueco.get(c) ?? 0) > 0) {
          plan.set(leads[i++], c);
          hueco.set(c, (hueco.get(c) ?? 0) - 1);
        }
      }
    }
  }
  return plan;
}

// Cuántos le tocan a cada caller (para la vista previa)
export function resumenPlan(plan: Map<string, string>, callers: string[]) {
  const n = Object.fromEntries(callers.map((c) => [c, 0])) as Record<string, number>;
  for (const c of plan.values()) n[c] = (n[c] ?? 0) + 1;
  return n;
}
