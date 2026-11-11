-- MCP del dashboard, Fase 2 (Cristian, 11 nov 2026; plan en VENTAS/API-DASHBOARD): claves personales para que
-- Claude Code hable con la app como esa persona y con sus permisos. La clave nunca se guarda: solo su huella
-- SHA-256 (hex). Una clave se anula poniendo `anulada_en`; al borrar a la persona, se borran sus claves.
create table public.claves_mcp (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  huella text not null unique check (huella ~ '^[0-9a-f]{64}$'),
  nombre text not null,
  creada_en timestamptz not null default now(),
  anulada_en timestamptz,
  ultimo_uso timestamptz
);
create index claves_mcp_perfil on public.claves_mcp (perfil_id);

-- Sin políticas: solo el servidor (clave secreta) puede leerla o escribirla
alter table public.claves_mcp enable row level security;
