// En el navegador: convierte el { error } que devuelve una acción en un error normal,
// para que los botones muestren el mensaje y deshagan lo que movieron en pantalla.
export async function exigirOk<T>(promesa: Promise<T>): Promise<Exclude<T, { error: string }>> {
  const r = await promesa;
  if (typeof r === "object" && r !== null && "error" in r && typeof (r as { error: unknown }).error === "string") {
    throw new Error((r as { error: string }).error);
  }
  return r as Exclude<T, { error: string }>;
}

// Una acción que salió bien pero con algo que avisar devuelve { aviso } (p. ej. agendarCita: «Agendado en la app,
// pero no en el calendario de GHL…», encargo de Callers C11, 7 nov 2026). Los ejecutores lo enseñan en rojo.
export function avisoDe(r: unknown): string | null {
  return typeof r === "object" && r !== null && "aviso" in r && typeof (r as { aviso: unknown }).aviso === "string" ? (r as { aviso: string }).aviso : null;
}
