// Calendario por closer (Jose, 25 nov 2026; docs/superpowers/specs/2026-11-25-calendario-por-closer-design.md):
// cada closer tiene su calendario de GHL y la cita que entra en él es suya (closer y «agendó»), sin pasar por el
// reparto. Un calendario es «personal» solo si lo tiene puesto en su ficha UNA persona activa que puede ser closer
// (closer o «También closer»). Si lo tienen dos (p. ej. el Calendar Principal), no es de nadie y todo sigue como antes.
// Sin base de datos: se prueba en tests/unit/calendario-personal.test.ts.

export type MiembroCalendario = {
  perfil_id: string;
  ghl_calendar_id: string | null;
  perfiles: { rol: string; activo: boolean; tambien_closer: boolean | null };
};

export function duenaDeCalendario(miembros: MiembroCalendario[], calendarioId: string | null): string | null {
  const id = (calendarioId ?? "").trim();
  if (!id) return null;
  const conEse = miembros.filter(
    (m) => (m.ghl_calendar_id ?? "").trim() === id && m.perfiles.activo && (m.perfiles.rol === "closer" || !!m.perfiles.tambien_closer)
  );
  return conEse.length === 1 ? conEse[0].perfil_id : null;
}
