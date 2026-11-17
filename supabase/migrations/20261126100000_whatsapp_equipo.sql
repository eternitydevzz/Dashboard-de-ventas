-- Fase D (Jose, 17 nov 2026): avisos por WhatsApp al equipo con WAHA (servidor aparte, en Render).
-- Al agendar una cita y al cerrar una venta: al closer, al caller que la agendó y al grupo de los CEO.
-- Se configura en Administración → WhatsApp. Solo añade: 2 tablas y 1 columna; no toca datos.

-- Qué se manda y a quién, por proyecto y aviso. Sin fila = encendido y a los tres (la app lo sabe).
create table if not exists public.whatsapp_config (
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  evento text not null check (evento in ('cita', 'venta')),
  activo boolean not null default true,
  a_closer boolean not null default true,
  a_caller boolean not null default true,
  a_grupo boolean not null default true,
  actualizado_en timestamptz not null default now(),
  primary key (proyecto_id, evento)
);
alter table public.whatsapp_config enable row level security;

-- El grupo de WhatsApp de los CEO (id que da WAHA, «…@g.us»); null = sin grupo.
alter table public.proyectos
  add column if not exists whatsapp_grupo text check (whatsapp_grupo is null or whatsapp_grupo ~ '^[0-9-]+@g\.us$');

-- Registro de cada envío: evita mandar dos veces el mismo aviso a la misma persona y deja rastro de los fallos.
-- origen_id: id de la cita o de la venta, o «<mercado>:<fecha>» para el reporte.
create table if not exists public.whatsapp_envios (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  evento text not null check (evento in ('cita', 'venta', 'reporte')),
  origen_id text not null,
  destino text not null,
  estado text not null check (estado in ('enviado', 'fallo', 'sin_numero')),
  error text,
  creado_en timestamptz not null default now(),
  unique (evento, origen_id, destino)
);
create index if not exists whatsapp_envios_proyecto_idx on public.whatsapp_envios (proyecto_id, creado_en desc);
alter table public.whatsapp_envios enable row level security;
-- Sin políticas: solo las lee y escribe el servidor (service_role), como reporte_envios.
