import { beforeAll, vi } from "vitest";

// Variables de Supabase LOCAL
try {
  process.loadEnvFile(".env.local");
} catch {
  // los tests unitarios no necesitan base de datos
}

// La sesión se simula: cada test dice «como quién» actúa
vi.mock("@/lib/sesion", () => ({
  COOKIE_PROYECTO: "eternity_proyecto",
  getSesion: vi.fn(async () => {
    throw new Error("Test sin sesión: llama a como(perfil) antes");
  }),
}));
// Fuera de Next no hay caché que refrescar
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), refresh: vi.fn() }));
// Fuera de Next no hay «después de contestar»: `after` hace su trabajo en el momento
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (tarea: unknown) => (typeof tarea === "function" ? tarea() : tarea),
}));

// Los límites de intentos se guardan en la base (arreglo 4): cada archivo empieza con la cuenta a cero
// para que los envíos fallidos de pasadas anteriores no acaben en «429». Sin base (unitarios), nada.
beforeAll(async () => {
  if (!process.env.SUPABASE_SECRET_KEY) return;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } }).from("limite_intentos").delete().gte("id", 0);
  } catch {
    // sin base de datos local
  }
});
