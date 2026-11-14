import { resumenLead, SIN_PERMISO } from "@/app/(panel)/leads/resumen";
import { esError } from "@/lib/resultado";

// Cristian, 14 nov (Ola 2): los datos del popup del lead, por GET. Con una acción del servidor el popup esperaba en la
// fila de las acciones (Next las manda de una en una) si había un movimiento guardándose. Mismos permisos que antes
// (resumenLead: el jefe, o su caller o su closer); sin permiso, 403. Va sin el id (el popup ya lo tiene).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await resumenLead((await params).id);
  if (esError(r)) return Response.json(r, { status: r.error === SIN_PERMISO ? 403 : 500 });
  const { id: _id, ...datos } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
  return Response.json(datos, { headers: { "Cache-Control": "private, no-store" } });
}
