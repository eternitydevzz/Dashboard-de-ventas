-- C9 · Sección «Manuales» (plan Callers, 7 nov 2026): manuales de ventas en .html que se ven dentro de la app.
-- Los ve todo el mundo; los suben o cambian el CEO y los directores (subir uno nuevo sustituye al anterior).
-- Solo añade cosas: una tabla y un espacio de archivos privado. No toca datos que ya existen.

create table public.manuales (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 80),
  archivo_path text not null,
  orden int not null default 0,
  actualizado_por uuid references public.perfiles (id) on delete set null,
  actualizado_en timestamptz not null default now()
);
create index manuales_proyecto on public.manuales (proyecto_id, orden);

-- Como el resto de tablas: la app lee y escribe con la clave del servidor; nadie entra directo desde el navegador
alter table public.manuales enable row level security;

-- Espacio privado para los .html (como «recursos»: el navegador sube directo con un enlace firmado)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('manuales', 'manuales', false, 15728640, array['text/html'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
