-- Ola única, carril C (Cristian, 14 nov 2026): cada manual dice qué mercados lo ven (España, Latam o los 2) y se apunta
-- quién lo ha abierto. Solo añade: la columna vieja `mercado` se queda. Sin datos de personas.

-- 1) Mercados que ven cada manual. Se rellena con el de hoy.
alter table public.manuales add column if not exists mercados text[] not null default '{latam}';
update public.manuales set mercados = array[mercado] where mercados is distinct from array[mercado];
alter table public.manuales drop constraint if exists manuales_mercados_validos;
alter table public.manuales add constraint manuales_mercados_validos
  check (cardinality(mercados) >= 1 and mercados <@ array['latam', 'es']::text[]);

-- 2) La última vez que cada persona abrió cada manual (api/manuales/[id]). Solo lo usa el servidor (RLS sin políticas,
-- como el resto: la app usa la clave secreta).
create table if not exists public.manuales_vistos (
  manual_id uuid not null references public.manuales on delete cascade,
  perfil_id uuid not null references public.perfiles on delete cascade,
  visto_en timestamptz not null default now(),
  primary key (manual_id, perfil_id)
);
alter table public.manuales_vistos enable row level security;
