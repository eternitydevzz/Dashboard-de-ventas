-- Plan GHL B2b (Cristian, 8 nov 2026): los canales de cada proyecto pasan a la base. Se editan en Administración →
-- «Etiquetas y UTMs» → «Canales»: las claves son fijas (las guardan las citas en `citas.canal`); nombre, alias, páginas
-- y orden se cambian. Un proyecto sin filas usa los de siempre (src/lib/canal.ts, CANALES_POR_DEFECTO).
-- Directo y Otro no son filas: no tienen alias ni páginas. Solo lo usa el servidor (RLS sin políticas, como workflows).
create table public.canales (
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  clave text not null check (clave in ('callers', 'yt', 'ig', 'p1', 'email', 'biblioteca', 'webinar', 'dfy', 'facu')),
  nombre text not null check (char_length(nombre) between 1 and 40),
  alias text[] not null default '{}', -- lo que puede venir en utm_source, sin mayúsculas
  paginas text[] not null default '{}', -- «dominio/ruta» gana al UTM; «dominio» y «ruta» valen sin UTM
  orden integer not null default 0,
  primary key (proyecto_id, clave)
);
alter table public.canales enable row level security;

-- Guarda la tabla entera (la valida antes src/lib/canal.ts, tablaValida; el orden de la lista es el orden).
-- Renombrar: «Canal: <antes>» pasa a «Canal: <nombre>» en la misma transacción en los leads, en las reglas de las
-- Entradas y en los disparadores «se pone una etiqueta» (A3). Todo de una vez, así vale aunque dos canales se cambien
-- el nombre entre sí. `antes` (nombre que se veía) cuenta solo si el proyecto aún no tiene la fila (usaba los de siempre).
create or replace function public.guardar_canales(p_proyecto uuid, p_filas jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_de text[];
  v_a text[];
begin
  select array_agg('Canal: ' || f.antes), array_agg('Canal: ' || f.nombre)
    into v_de, v_a
  from (
    select x.nombre, coalesce(c.nombre, x.antes) as antes
    from jsonb_to_recordset(p_filas) as x(clave text, nombre text, antes text)
    left join canales c on c.proyecto_id = p_proyecto and c.clave = x.clave
  ) f
  where f.antes is not null and f.antes <> f.nombre;

  if v_de is not null then
    -- Leads: cada etiqueta vieja por la nueva, en su sitio y sin repetir
    update leads l
    set etiquetas = array(
      select t.e from (
        select coalesce(m.a, u.e) as e, min(u.n) as n
        from unnest(l.etiquetas) with ordinality as u(e, n)
        left join unnest(v_de, v_a) as m(de, a) on m.de = u.e
        group by 1
      ) t order by t.n
    )
    where l.proyecto_id = p_proyecto and l.etiquetas && v_de;

    -- Reglas de las Entradas ({campo, operador, valor, etiqueta})
    update entradas en
    set reglas = (
      select jsonb_agg(case when m.a is null then r else jsonb_set(r, '{etiqueta}', to_jsonb(m.a)) end order by k)
      from jsonb_array_elements(en.reglas) with ordinality as j(r, k)
      left join unnest(v_de, v_a) as m(de, a) on m.de = r ->> 'etiqueta'
    )
    where en.proyecto_id = p_proyecto
      and jsonb_typeof(en.reglas) = 'array'
      and exists (select 1 from jsonb_array_elements(en.reglas) as j(r) where j.r ->> 'etiqueta' = any (v_de));

    -- Disparadores de A3 (se comparan en minúsculas, src/lib/workflows.ts)
    update workflows w
    set disparador = jsonb_set(w.disparador, '{etiqueta}', to_jsonb(m.a)), actualizado_en = now()
    from unnest(v_de, v_a) as m(de, a)
    where w.proyecto_id = p_proyecto
      and w.disparador ->> 'tipo' = 'etiqueta'
      and lower(w.disparador ->> 'etiqueta') = lower(m.de);
  end if;

  insert into canales (proyecto_id, clave, nombre, alias, paginas, orden)
  select p_proyecto, x.clave, x.nombre, x.alias, x.paginas, (j.k - 1)::integer
  from jsonb_array_elements(p_filas) with ordinality as j(v, k),
       jsonb_to_record(j.v) as x(clave text, nombre text, alias text[], paginas text[])
  on conflict (proyecto_id, clave) do update
    set nombre = excluded.nombre, alias = excluded.alias, paginas = excluded.paginas, orden = excluded.orden;
end;
$$;
revoke execute on function public.guardar_canales(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.guardar_canales(uuid, jsonb) to service_role;

-- Semilla: los canales de hoy, solo en la base de la nube (la de Maestria), como 20261017120000_leer_ghl_cada_30s.sql.
-- En la de los tests no se pone nada: sus proyectos nacen vacíos y usan los de siempre. Mismos datos que
-- CANALES_POR_DEFECTO; en agenda-fc y software-demo gana la página al UTM (dominio/ruta).
do $$
begin
  if exists (select 1 from public.proyectos where ghl_location_id = 'ZGWJLBH58RJtl2iGhykp') then
    insert into public.canales (proyecto_id, clave, nombre, alias, paginas, orden)
    select p.id, v.clave, v.nombre, v.alias, v.paginas, v.orden
    from public.proyectos p
    cross join (values
      ('callers', 'Callers', array['callers', 'caller'], array['agenda-callers'], 0),
      ('yt', 'YouTube', array['yt', 'youtube'], array['agenda-yt'], 1),
      ('ig', 'Instagram', array['ig', 'instagram'], array['agenda-ig'], 2),
      ('p1', 'Píldora 1', array['p1'], array[]::text[], 3),
      ('email', 'Email', array['email', 'mail'], array[]::text[], 4),
      ('biblioteca', 'Biblioteca', array['biblioteca', 'bibliotec', 'agenda-biblioteca'], array['biblioteca.codigomaestria.com'], 5),
      ('webinar', 'Webinar', array['webinar'], array[]::text[], 6),
      ('dfy', 'DFY', array['dfy'], array['services.eternity.llc/software-demo'], 7),
      ('facu', 'Facu', array[]::text[], array['codigomaestria.com/agenda-fc'], 8)
    ) as v(clave, nombre, alias, paginas, orden)
    where p.ghl_location_id = 'ZGWJLBH58RJtl2iGhykp'
    on conflict (proyecto_id, clave) do nothing;
  end if;
end $$;
