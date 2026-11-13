import { refresh, revalidatePath } from "next/cache";

// Al guardar desde la app (acción del servidor) se recarga solo la pantalla actual (Cristian, 13 nov).
// Desde una ruta (el MCP, /api/mcp) `refresh()` lanza un error DESPUÉS de guardar: ahí se recarga todo como antes.
export function refrescarPantalla() {
  try {
    refresh();
  } catch {
    revalidatePath("/", "layout");
  }
}
