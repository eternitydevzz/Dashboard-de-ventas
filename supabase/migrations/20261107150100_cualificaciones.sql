-- C6 · Ficha de cualificación (plan Callers, 7 nov 2026, apartado 7c.2): la rellena el caller en el guion.
-- 8 campos + «Nota», texto libre, en un jsonb (una fila por lead). La ven el closer, los jefes y la exportación.
-- Solo añade una tabla. No toca datos que ya existen.

create table public.cualificaciones (
  lead_id uuid primary key references public.leads (id) on delete cascade,
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  campos jsonb not null default '{}'::jsonb check (jsonb_typeof(campos) = 'object'),
  actualizado_por uuid references public.perfiles (id) on delete set null,
  actualizado_en timestamptz not null default now()
);
create index cualificaciones_proyecto on public.cualificaciones (proyecto_id);

alter table public.cualificaciones enable row level security;
