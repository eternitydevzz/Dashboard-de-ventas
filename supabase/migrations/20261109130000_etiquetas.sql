-- Plan GHL B3a (Cristian, 8 nov 2026): las etiquetas del proyecto en Administración → «Etiquetas y UTMs» → «Etiquetas».
-- La lista sale de las etiquetas de los leads; esta tabla solo guarda el orden, las creadas a mano (aún sin leads) y la
-- marca «usada por GHL» (de ella cuelgan emails y SMS de workflows de GHL). Siempre en minúsculas, como las guarda GHL.
-- Solo la usa el servidor (RLS sin políticas, como workflows y canales). Nada de esto toca GHL (eso es B3b).
create table public.etiquetas (
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  nombre text not null check (nombre = lower(btrim(nombre)) and char_length(nombre) between 1 and 80 and position(',' in nombre) = 0),
  orden integer not null default 0,
  usada_ghl boolean not null default false,
  primary key (proyecto_id, nombre)
);
alter table public.etiquetas enable row level security;

-- La lista de la pantalla: las de los leads (con cuántos leads la llevan) y las de la tabla, en su orden
create or replace function public.etiquetas_del_proyecto(p_proyecto uuid)
returns table (nombre text, leads bigint, orden integer, usada_ghl boolean)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(t.nombre, l.nombre), coalesce(l.n, 0), t.orden, coalesce(t.usada_ghl, false)
  from (
    select lower(btrim(e)) as nombre, count(distinct ld.id) as n
    from leads ld, unnest(ld.etiquetas) as e
    where ld.proyecto_id = p_proyecto and btrim(e) <> ''
    group by 1
  ) l
  full join (select * from etiquetas where proyecto_id = p_proyecto) t on t.nombre = l.nombre
  order by t.orden nulls last, 1;
$$;

-- Una lista de etiquetas con `de` cambiada por `a` (null = quitada), sin repetir (en minúsculas; se queda la primera)
create or replace function public.etiquetas_cambiadas(p_lista text[], p_de text, p_a text)
returns text[]
language sql
immutable
as $$
  select coalesce(array(
    select x.e from (
      select distinct on (lower(t.e)) t.e, t.n
      from (
        select case when lower(btrim(u.e)) = p_de then p_a else u.e end as e, u.n
        from unnest(p_lista) with ordinality as u(e, n)
      ) t
      where t.e is not null
      order by lower(t.e), t.n
    ) x order by x.n
  ), '{}');
$$;

-- Los pasos de un workflow (también dentro de ramas) con `de` cambiada por `a`. Con `a` null: la base queda vacía, la
-- fija se quita y el paso «Quitar etiqueta» de esa etiqueta desaparece.
create or replace function public.pasos_con_etiqueta(p_pasos jsonb, p_de text, p_a text)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_paso jsonb;
  v_sal jsonb := '[]'::jsonb;
  v_a jsonb := coalesce(to_jsonb(p_a), 'null'::jsonb); -- to_jsonb(null) es null y jsonb_set con null lo borra todo
begin
  if coalesce(jsonb_typeof(p_pasos), '') <> 'array' then
    return p_pasos;
  end if;
  for v_paso in select * from jsonb_array_elements(p_pasos) loop
    if v_paso ->> 'tipo' = 'etiquetas_ghl' then
      if lower(btrim(v_paso ->> 'base')) = p_de then
        v_paso := jsonb_set(v_paso, '{base}', v_a);
      end if;
      if jsonb_typeof(v_paso -> 'fijas') = 'array' then
        v_paso := jsonb_set(v_paso, '{fijas}', to_jsonb(etiquetas_cambiadas(array(select jsonb_array_elements_text(v_paso -> 'fijas')), p_de, p_a)));
      end if;
    elsif v_paso ->> 'tipo' = 'quitar_etiqueta_ghl' and lower(btrim(v_paso ->> 'etiqueta')) = p_de then
      continue when p_a is null;
      v_paso := jsonb_set(v_paso, '{etiqueta}', v_a);
    elsif v_paso ->> 'tipo' = 'rama' then
      v_paso := jsonb_set(v_paso, '{si_no}', pasos_con_etiqueta(coalesce(v_paso -> 'si_no', '[]'::jsonb), p_de, p_a));
      if jsonb_typeof(v_paso -> 'caminos') = 'array' then
        v_paso := jsonb_set(v_paso, '{caminos}', (
          select coalesce(jsonb_agg(jsonb_set(c, '{pasos}', pasos_con_etiqueta(coalesce(c -> 'pasos', '[]'::jsonb), p_de, p_a)) order by k), '[]'::jsonb)
          from jsonb_array_elements(v_paso -> 'caminos') with ordinality as j(c, k)
        ));
      end if;
    end if;
    v_sal := v_sal || jsonb_build_array(v_paso);
  end loop;
  return v_sal;
end;
$$;

-- Renombrar (`a` nueva), unir (`a` ya existe: no se repite) o borrar (`a` null), todo en la misma transacción: leads,
-- etiqueta base y fijas de las Entradas, reglas de las Entradas, pasos de los workflows y disparadores de A3. Con
-- borrar, la regla se queda sin etiqueta (sigue moviendo de columna) y el workflow de esa etiqueta se apaga.
-- Las etiquetas escritas en el código no se tocan: lo comprueba antes el servidor (admin/acciones.ts).
create or replace function public.renombrar_etiqueta(p_proyecto uuid, p_de text, p_a text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_de text := lower(btrim(p_de));
  v_a text := lower(nullif(btrim(p_a), ''));
  v_aj jsonb := coalesce(to_jsonb(v_a), 'null'::jsonb);
begin
  if v_de is null or v_de = '' or v_de = v_a then
    return;
  end if;

  update leads l
  set etiquetas = etiquetas_cambiadas(l.etiquetas, v_de, v_a)
  where l.proyecto_id = p_proyecto and exists (select 1 from unnest(l.etiquetas) as e where lower(btrim(e)) = v_de);

  update entradas en
  set ghl_etiqueta_base = case when lower(btrim(en.ghl_etiqueta_base)) = v_de then v_a else en.ghl_etiqueta_base end,
      ghl_etiquetas_extra = etiquetas_cambiadas(en.ghl_etiquetas_extra, v_de, v_a),
      reglas = case when jsonb_typeof(en.reglas) = 'array' then (
        select coalesce(jsonb_agg(case when lower(btrim(r ->> 'etiqueta')) = v_de then jsonb_set(r, '{etiqueta}', v_aj) else r end order by k), '[]'::jsonb)
        from jsonb_array_elements(en.reglas) with ordinality as j(r, k)
      ) else en.reglas end
  where en.proyecto_id = p_proyecto
    and (lower(btrim(en.ghl_etiqueta_base)) = v_de
      or exists (select 1 from unnest(en.ghl_etiquetas_extra) as e where lower(btrim(e)) = v_de)
      or (jsonb_typeof(en.reglas) = 'array' and exists (select 1 from jsonb_array_elements(en.reglas) as j(r) where lower(btrim(j.r ->> 'etiqueta')) = v_de)));

  -- Pasos: si cambian, sube la versión (como al guardar desde el editor)
  update workflows w
  set pasos = pasos_con_etiqueta(w.pasos, v_de, v_a), version = w.version + 1, actualizado_en = now()
  where w.proyecto_id = p_proyecto and pasos_con_etiqueta(w.pasos, v_de, v_a) is distinct from w.pasos;

  -- Disparadores de A3 (se comparan en minúsculas, src/lib/workflows.ts)
  if v_a is null then
    update workflows w set encendido = false, actualizado_en = now()
    where w.proyecto_id = p_proyecto and w.disparador ->> 'tipo' = 'etiqueta' and lower(btrim(w.disparador ->> 'etiqueta')) = v_de and w.encendido;
  else
    update workflows w
    set disparador = jsonb_set(w.disparador, '{etiqueta}', v_aj),
        nombre = case when lower(w.nombre) = 'etiqueta «' || v_de || '»' then 'Etiqueta «' || v_a || '»' else w.nombre end,
        actualizado_en = now()
    where w.proyecto_id = p_proyecto and w.disparador ->> 'tipo' = 'etiqueta' and lower(btrim(w.disparador ->> 'etiqueta')) = v_de;
  end if;

  -- La fila de la tabla: renombrar la mueve; unir junta la marca «usada por GHL»; borrar la quita
  if v_a is not null then
    insert into etiquetas (proyecto_id, nombre, orden, usada_ghl)
    select proyecto_id, v_a, orden, usada_ghl from etiquetas where proyecto_id = p_proyecto and nombre = v_de
    on conflict (proyecto_id, nombre) do update set usada_ghl = etiquetas.usada_ghl or excluded.usada_ghl;
  end if;
  delete from etiquetas where proyecto_id = p_proyecto and nombre = v_de;
end;
$$;
revoke execute on function public.etiquetas_del_proyecto(uuid) from public, anon, authenticated;
grant execute on function public.etiquetas_del_proyecto(uuid) to service_role;
revoke execute on function public.renombrar_etiqueta(uuid, text, text) from public, anon, authenticated;
grant execute on function public.renombrar_etiqueta(uuid, text, text) to service_role;
revoke execute on function public.etiquetas_cambiadas(text[], text, text) from public, anon, authenticated;
revoke execute on function public.pasos_con_etiqueta(jsonb, text, text) from public, anon, authenticated;

-- Semilla y marca «usada por GHL»: solo en la base de la nube (la de Maestria), como 20261109120000_canales.sql. Son las
-- etiquetas antiguas que ponen los workflows de GHL (docs/plan-GHL.md, sección 7): «form llamada <canal>» por cada rama
-- del workflow «2 . WH - FORM AGENDA GENERAL», «rellena form llamada», «agenda biblioteca» y «agenda llamada».
do $$
begin
  if exists (select 1 from public.proyectos where ghl_location_id = 'ZGWJLBH58RJtl2iGhykp') then
    insert into public.etiquetas (proyecto_id, nombre, orden, usada_ghl)
    select p.id, v.nombre, v.orden, true
    from public.proyectos p
    cross join (values
      -- nombres leídos en los workflows de GHL (C0, 8 nov): «2 . WH - FORM AGENDA GENERAL», «2.1 … FACU» y «2. Agendan llamada»
      ('form llamada youtube', 0), ('form llamada instagram', 1), ('form llamada p1', 2), ('form llamada callers', 3),
      ('agenda biblioteca', 4), ('agenda email', 5), ('webinar agenda', 6), ('agenda dfy', 7),
      ('rellena form llamada', 8), ('agenda llamada', 9), ('agenda callers', 10), ('agenda facu', 11)
    ) as v(nombre, orden)
    where p.ghl_location_id = 'ZGWJLBH58RJtl2iGhykp'
    on conflict (proyecto_id, nombre) do update set usada_ghl = true;
  end if;
end $$;
