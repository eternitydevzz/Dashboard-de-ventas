-- Pendiente de docs/PENDIENTES-JOSE.md, sección 7 (límites conocidos): «faltan índices de lead_id en 4 tablas».
-- Comprobado en producción el 18 nov 2026 (solo lectura, pg_indexes): en estas 4 tablas lead_id solo va en segunda
-- posición de un índice ((proyecto_id, lead_id), (workflow_id, lead_id)…), que no sirve para buscar por lead_id solo
-- (p. ej. al borrar un lead, por las claves ajenas). Las demás tablas con lead_id ya lo tienen.
-- Sufijo _lead_id_idx: workflow_ejecuciones_lead_idx ya existe (workflow_id, lead_id) y con «if not exists» no se creaba.
-- Tablas pequeñas (la mayor, workflow_ejecuciones, ~523 filas). Sin «concurrently»: la CLI va en una transacción.
create index if not exists clientes_lead_id_idx on public.clientes (lead_id) where lead_id is not null;
create index if not exists seguimientos_cliente_lead_id_idx on public.seguimientos_cliente (lead_id) where lead_id is not null;
create index if not exists vencimientos_lead_id_idx on public.vencimientos (lead_id) where lead_id is not null;
create index if not exists workflow_ejecuciones_lead_id_idx on public.workflow_ejecuciones (lead_id) where lead_id is not null;
