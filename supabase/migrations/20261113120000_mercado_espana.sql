-- Cristian (13 nov 2026): equipo de España dentro del mismo proyecto. Cada persona es de «Latam» o de «España»
-- (mismo CRM, leads y KPIs). Los de España ven sus propios links, recursos, guion y manuales; si España no tiene
-- algo puesto, ve lo de siempre (lo de Latam). Solo añade columnas: lo que ya existe queda como Latam.

-- Lo elige cada persona al entrar (null = aún sin elegir; se le pregunta)
alter table public.miembros_proyecto add column mercado text check (mercado in ('latam', 'es'));

-- La versión de España de los links del proyecto y de los links de pago de cada programa (vacío = usa la de Latam)
alter table public.proyectos add column link_agenda_es text check (link_agenda_es is null or link_agenda_es ~ '^https://');
alter table public.proyectos add column link_reserva_es text check (link_reserva_es is null or link_reserva_es ~ '^https://');
alter table public.productos add column links_pago_es jsonb not null default '[]'::jsonb;

-- Recursos y manuales: cada fila es de un mercado. Lo de hoy pasa a 'latam'.
-- España ve los suyos si tiene alguno; si no, los de Latam.
alter table public.recursos add column mercado text not null default 'latam' check (mercado in ('latam', 'es'));
alter table public.manuales add column mercado text not null default 'latam' check (mercado in ('latam', 'es'));

-- Guiones: uno por proyecto, rol y mercado (el de hoy pasa a 'latam')
alter table public.guiones add column mercado text not null default 'latam' check (mercado in ('latam', 'es'));
alter table public.guiones drop constraint guiones_pkey;
alter table public.guiones add primary key (proyecto_id, rol, mercado);
