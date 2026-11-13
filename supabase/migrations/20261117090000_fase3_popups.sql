-- Fase 3 (Cristian, 13 nov 2026): avisos por persona, popups configurables en Administración y los 2 interruptores del
-- ranking. Solo añade. Solo lo usa el servidor (RLS sin políticas, como el resto: la app usa la clave secreta).

-- 1) Avisos para una sola persona (p. ej. «te entra una agenda nueva», lib/aviso-closer.ts). Salen en la ventana de la
-- bienvenida y se marcan vistos al cerrarla.
create table if not exists public.avisos_persona (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos on delete cascade,
  perfil_id uuid not null references public.perfiles on delete cascade,
  tipo text not null default 'aviso',
  titulo text not null,
  texto text not null,
  enlace text,
  creado_en timestamptz not null default now(),
  visto_en timestamptz
);
create index if not exists avisos_persona_perfil_visto_idx on public.avisos_persona (perfil_id, visto_en);
alter table public.avisos_persona enable row level security;

-- 2) Popups que crea el CEO o un director con Administración. A quién: las personas de `personas` y, además, quien
-- tenga un rol de `roles` y sea de un mercado de `mercados` (vacío = los 2). Cuándo (`frecuencia`): una vez por sesión
-- del navegador, cada `cada_horas` horas, una vez por semana (lunes a domingo) o «ahora» (una vez desde `lanzado_en`).
create table if not exists public.popups (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 120),
  texto text not null check (char_length(texto) between 1 and 2000),
  imagen text check (imagen is null or imagen like 'https://%'),
  boton_texto text,
  boton_enlace text,
  roles text[] not null default '{}',
  personas uuid[] not null default '{}',
  mercados text[] not null default '{}',
  frecuencia text not null default 'sesion' check (frecuencia in ('sesion', 'horas', 'semana', 'ahora')),
  cada_horas integer check (cada_horas is null or cada_horas between 1 and 720),
  lanzado_en timestamptz,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create index if not exists popups_proyecto_idx on public.popups (proyecto_id, activo);
alter table public.popups enable row level security;

-- La última vez que cada persona cerró cada popup
create table if not exists public.popups_vistos (
  popup_id uuid not null references public.popups on delete cascade,
  perfil_id uuid not null references public.perfiles on delete cascade,
  visto_en timestamptz not null default now(),
  primary key (popup_id, perfil_id)
);
create index if not exists popups_vistos_perfil_idx on public.popups_vistos (perfil_id);
alter table public.popups_vistos enable row level security;

-- 3) Textos cambiados de los mensajes de la bienvenida y del reporte del CEO ({clave: {titulo, texto}}).
-- Vacío = los textos de siempre (lib/mensajes-entrada.ts).
alter table public.proyectos add column if not exists textos_entrada jsonb not null default '{}'::jsonb;

-- 4) Ranking (los lee ranking/page.tsx): enseñar a los de baja y que los callers vean el de closers. Apagados.
alter table public.proyectos add column if not exists ranking_mostrar_bajas boolean not null default false;
alter table public.proyectos add column if not exists ranking_closers_para_callers boolean not null default false;
