// Nuevo orden de ids al mover una Entrada una posición; null si no se puede (fuera de rango, id o dirección desconocidos)
export function reordenar(ids: string[], id: string, direccion: "arriba" | "abajo"): string[] | null {
  const i = ids.indexOf(id);
  const j = direccion === "arriba" ? i - 1 : direccion === "abajo" ? i + 1 : -1;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const nuevo = [...ids];
  [nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]];
  return nuevo;
}
