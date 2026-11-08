-- Plan GHL 2.8: el admin ordena las Entradas con ↑ ↓. Las que ya existen quedan con 0 y se siguen ordenando por creado_en.
alter table public.entradas add column orden int not null default 0;
