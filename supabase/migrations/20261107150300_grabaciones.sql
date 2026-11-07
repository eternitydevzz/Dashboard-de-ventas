-- C10 · Sección «Grabaciones» (plan Callers, 7 nov 2026): el caller graba la llamada con el micrófono de su ordenador
-- desde el guion. Cada grabación queda unida al lead con el que empezó. Se guardan siempre (no se borran solas).
-- El caller escucha las suyas y los jefes todas; la transcripción la suben Cristian y Claude a mano (texto o .txt).
-- No comparte nada con «Llamadas de GHL» (llamadas_ghl) ni con las de Fathom de los closers (tabla `grabaciones`).
-- Solo añade cosas.

create table public.grabaciones_caller (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  perfil_id uuid references public.perfiles (id) on delete set null,
  archivo_path text not null,
  tipo text not null default 'audio/webm',
  duracion_seg integer not null default 0 check (duracion_seg >= 0),
  transcripcion text check (transcripcion is null or char_length(transcripcion) <= 200000),
  transcrita_en timestamptz,
  creado_en timestamptz not null default now()
);
create index grabaciones_caller_proyecto on public.grabaciones_caller (proyecto_id, creado_en desc);
create index grabaciones_caller_perfil on public.grabaciones_caller (perfil_id, creado_en desc);

alter table public.grabaciones_caller enable row level security;

-- Espacio privado para el audio (50 MB por archivo, el máximo del plan gratis de Supabase)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('grabaciones', 'grabaciones', false, 52428800, array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'video/webm'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
