-- Cristian (11 nov 2026): cada closer puede llevar unos países. Una agenda (del caller o de GHL) de un lead de esos
-- países va a ese closer; el resto, a la rotación por %. Vacío = ningún país propio.
alter table public.miembros_proyecto add column paises_closer text[] not null default '{}';
