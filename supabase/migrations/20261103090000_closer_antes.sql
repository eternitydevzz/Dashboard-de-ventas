-- Cristian, 3 nov 2026: al borrar a un closer, sus citas se quedan sin closer (on delete set null) y no se sabía
-- quién las llevaba. Aquí se guarda su nombre para seguir enseñándolo («Felipe (ya no está)»).
-- Vacío y sin closer = la cita nunca tuvo closer del equipo («Sin llamar»).
alter table public.citas add column closer_antes text;
