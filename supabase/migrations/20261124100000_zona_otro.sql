-- A5 (Cristian, 17 nov 2026): zona horaria «Otro». La persona escribe de dónde es (perfiles.pais) y elige su zona
-- en un desplegable. Ya no hay solo 6 zonas: la app valida la zona exacta con Intl; aquí solo se exige el formato.
-- Solo añade y cambia un CHECK; no toca datos.

alter table public.perfiles
  add column if not exists pais text check (pais is null or char_length(pais) between 1 and 80);

-- El CHECK de las 6 zonas (20261114120000_zona_persona.sql) se creó sin nombre; en la base se llama
-- perfiles_zona_horaria_check. Se busca por su definición por si en otra base (la local de los tests) se llamara distinto.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.perfiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%zona_horaria%'
      and conname <> 'perfiles_zona_horaria_formato'
  loop
    execute format('alter table public.perfiles drop constraint %I', c);
  end loop;
end $$;

alter table public.perfiles drop constraint if exists perfiles_zona_horaria_formato;
alter table public.perfiles
  add constraint perfiles_zona_horaria_formato
  check (zona_horaria is null or zona_horaria ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$');
