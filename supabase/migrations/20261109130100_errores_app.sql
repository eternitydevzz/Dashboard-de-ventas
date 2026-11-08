-- Plan GHL F3 (Cristian, 8 nov 2026): «otros errores» de la app para los avisos del CEO. Solo de los 3 sitios que hoy
-- solo hacen console.error (src/lib/errores-app.ts). Mismo sitio y texto = una fila con contador. Solo AÑADE.
-- `proyecto_id` vacío = error sin proyecto (las acciones, resultado.ts); sale en los avisos de todos.
create table public.errores_app (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid references public.proyectos (id) on delete cascade,
  sitio text not null,
  texto text not null,
  veces integer not null default 1,
  primero_en timestamptz not null default now(),
  ultimo_en timestamptz not null default now(),
  unique nulls not distinct (proyecto_id, sitio, texto)
);
alter table public.errores_app enable row level security;

-- Guarda un error o, si ya está (mismo proyecto, sitio y texto), le suma 1 y apunta cuándo fue la última vez
create or replace function public.registrar_error_app(p_proyecto uuid, p_sitio text, p_texto text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into errores_app (proyecto_id, sitio, texto)
  values (p_proyecto, left(p_sitio, 100), left(p_texto, 500))
  on conflict (proyecto_id, sitio, texto) do update set veces = errores_app.veces + 1, ultimo_en = now();
$$;
revoke execute on function public.registrar_error_app(uuid, text, text) from public, anon, authenticated;
grant execute on function public.registrar_error_app(uuid, text, text) to service_role;
