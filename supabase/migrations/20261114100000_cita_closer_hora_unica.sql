-- Ola 1 · C2 (13 nov 2026): dos callers no pueden agendar al mismo closer a la misma hora (la app lo mira antes de
-- guardar, pero dos a la vez pasan los dos). Solo AÑADE un índice: la app de hoy sigue igual.
-- Solo citas abiertas y hechas en la app (origen distinto de «ghl»): las que llegan de GHL no entran, para que la
-- lectura de GHL nunca deje de traer una cita real (GHL la puede pasar al closer del país ya ocupado).
-- Comprobado el 13 nov en producción: 51 citas abiertas y 0 repetidas por closer y hora.
create unique index if not exists citas_closer_hora_unica on public.citas (closer_id, fecha)
  where closer_id is not null and origen <> 'ghl' and estado in ('pendiente', 'confirmacion_pendiente', 'confirmada');
