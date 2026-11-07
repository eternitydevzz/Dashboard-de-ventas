-- Plan GHL, B (Cristian, 7 nov 2026): una Entrada puede crear oportunidad en VARIOS pipelines de GHL (la agenda de la
-- Biblioteca: «0. Agendas Biblioteca» y «0. Agendas General») y poner etiquetas fijas (las viejas: `agenda biblioteca`,
-- `biblioteca recursos`). Solo AÑADE columnas con valor por defecto: no cambia ni borra nada.
-- Lista vacía = se usa `ghl_pipeline_id` / `ghl_etapa_id` como hasta ahora (compatible con las Entradas que ya hay).
alter table public.entradas
  add column ghl_oportunidades jsonb not null default '[]'::jsonb,   -- [{ pipeline_id, etapa_id }]; etapa_id null = la primera columna de GHL
  add column ghl_etiquetas_extra text[] not null default '{}';        -- se añaden siempre en GHL y en el lead; nunca se quitan

alter table public.entradas
  add constraint entradas_ghl_oportunidades_lista check (jsonb_typeof(ghl_oportunidades) = 'array');
