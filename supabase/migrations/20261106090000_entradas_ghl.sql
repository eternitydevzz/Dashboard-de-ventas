-- Plan GHL, fase 1 (Cristian, 6 nov 2026): el dashboard hace en GHL, por la API, lo que hacía el workflow con
-- «Inbound Webhook» (contacto, campos, etiqueta y oportunidad). Solo AÑADE columnas e índice: no cambia ni borra nada.
-- Para volver atrás sin tocar la base: apagar `ghl_activo` en la Entrada.

-- ---------- Entradas: qué hacer en GHL ----------
alter table public.entradas
  add column ghl_activo boolean not null default false,
  add column ghl_campos jsonb not null default '{}'::jsonb,         -- { campo del envío: id del campo de GHL }
  add column ghl_pipeline_id text,                                  -- pipeline de GHL (sin él, no se crea oportunidad)
  add column ghl_etapa_id text,                                     -- columna de GHL (sin ella, la primera)
  add column ghl_etiqueta_base text,                                -- p. ej. «Biblioteca-form» → -completo / -incompleto
  add column ghl_espera_seg integer not null default 60 check (ghl_espera_seg between 0 and 3600),
  add column ghl_campo_completo text not null default 'quiz_completed'; -- campo que, a true, marca el lead «completo»

-- ---------- Envíos: su paso a GHL ----------
alter table public.webhook_eventos
  add column ghl_estado text check (ghl_estado in ('esperando', 'ok', 'error')), -- null = la Entrada no manda a GHL
  add column ghl_enviar_en timestamptz,
  add column ghl_intentos smallint not null default 0,
  add column ghl_error text;

-- La lectura de cada 60 s busca solo los que esperan
create index webhook_eventos_ghl_esperando_idx on public.webhook_eventos (proyecto_id, ghl_enviar_en) where ghl_estado = 'esperando';
