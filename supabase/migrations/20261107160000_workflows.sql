-- Workflows, 4a-1 (docs/plan-workflows.md, aprobado por Cristian el 7 nov 2026). Solo AÑADE: 2 tablas nuevas y una
-- función de solo lectura. No cambia ni borra nada de lo que hay. Solo las usa el servidor (RLS sin políticas).

-- 1 · Un workflow: disparador + pasos (JSON, ver src/lib/workflows.ts). `modo` = prueba (no llama a GHL, solo compara
-- con lo de hoy) o real. `entrada_id` = la Entrada de su disparador, para buscarlo rápido al llegar un envío.
create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 120),
  disparador jsonb not null check (jsonb_typeof(disparador) = 'object'),
  entrada_id uuid references public.entradas (id) on delete cascade,
  pasos jsonb not null default '[]'::jsonb check (jsonb_typeof(pasos) = 'array'),
  version integer not null default 1,
  encendido boolean not null default true,
  modo text not null default 'prueba' check (modo in ('prueba', 'real')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index workflows_proyecto_idx on public.workflows (proyecto_id);
create index workflows_entrada_idx on public.workflows (entrada_id) where entrada_id is not null;
alter table public.workflows enable row level security;

-- 2 · Una ejecución por lead y workflow. Guarda sus pasos (los de su versión: si el workflow cambia, termina con los
-- suyos), por qué tramo va (los tramos se cortan en cada «esperar»), cuándo toca el siguiente, intentos y su registro.
-- `coincide` (modo prueba): true = el workflow calcula lo mismo que hoy; false = hay diferencias (en `registro`).
create table public.workflow_ejecuciones (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  version integer not null,
  pasos jsonb not null check (jsonb_typeof(pasos) = 'array'),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  entrada_id uuid references public.entradas (id) on delete set null,
  estado text not null default 'esperando' check (estado in ('esperando', 'ok', 'error', 'parada')),
  tramo integer not null default 0,
  siguiente_en timestamptz not null,
  intentos integer not null default 0,
  error text,
  coincide boolean,
  registro jsonb not null default '[]'::jsonb check (jsonb_typeof(registro) = 'array'),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index workflow_ejecuciones_pendientes_idx on public.workflow_ejecuciones (proyecto_id, siguiente_en) where estado = 'esperando';
create index workflow_ejecuciones_lead_idx on public.workflow_ejecuciones (workflow_id, lead_id);
alter table public.workflow_ejecuciones enable row level security;

-- 3 · Resumen de cada workflow del proyecto en una consulta (la línea «Workflow en prueba: 18 de 18 coinciden»)
create or replace function public.resumen_workflows(p_proyecto uuid)
returns table (workflow_id uuid, total bigint, coinciden bigint, no_coinciden bigint, esperando bigint, errores bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id,
    count(e.id),
    count(e.id) filter (where e.estado = 'ok' and e.coincide is true),
    count(e.id) filter (where e.estado = 'ok' and e.coincide is false),
    count(e.id) filter (where e.estado = 'esperando'),
    count(e.id) filter (where e.estado = 'error')
  from workflows w
  left join workflow_ejecuciones e on e.workflow_id = w.id
  where w.proyecto_id = p_proyecto
  group by w.id;
$$;
revoke execute on function public.resumen_workflows(uuid) from public, anon, authenticated;
grant execute on function public.resumen_workflows(uuid) to service_role;
