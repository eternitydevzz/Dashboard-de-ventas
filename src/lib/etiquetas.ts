// Etiquetas de un lead (arreglo de la fase 1 del plan GHL, Cristian 6 nov 2026). Visto en la prueba real con GHL:
// GHL guarda las etiquetas en minúsculas y la lectura de 60 s le devolvía al lead la `-incompleto` vieja aunque ya
// tuviera `-completo`. Regla: se suman sin repetir (sin mirar mayúsculas; se queda la forma que ya tenía) y, si hay
// `<base>-completo`, fuera `<base>-incompleto` (un lead completo no vuelve a incompleto). Sin base de datos.
export function unirEtiquetas(antes: string[] | null | undefined, nuevas: string[] | null | undefined): string[] {
  const vistas = new Set<string>();
  const todas: string[] = [];
  for (const t of [...(antes ?? []), ...(nuevas ?? [])]) {
    const limpia = String(t ?? "").trim();
    const k = limpia.toLowerCase();
    if (!limpia || vistas.has(k)) continue;
    vistas.add(k);
    todas.push(limpia);
  }
  return todas.filter((t) => {
    const m = t.toLowerCase().match(/^(.+)-incompleto$/);
    return !m || !vistas.has(`${m[1]}-completo`);
  });
}
