-- Plan GHL E1 (Cristian, 8 nov): interruptor «También closer» en la ficha de un caller (Facu).
-- Closer = rol 'closer' o tambien_closer. Se deshace con: alter table public.perfiles drop column tambien_closer;
alter table public.perfiles add column tambien_closer boolean not null default false;
