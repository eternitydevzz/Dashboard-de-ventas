-- Plan GHL, sección 1.7 (detalles pequeños; decisiones de Cristian del 9 nov 2026). Solo cambia 3 funciones.
--
-- 1) unir_leads: las etiquetas se juntan sin distinguir mayúsculas (como las guarda GHL) y, si el lead acaba en el
--    pipeline de una de sus tarjetas extra, esa tarjeta se borra (salía 2 veces). Sigue sin `security definer` a propósito:
--    solo la puede llamar service_role (revoke/grant de 20261109100100_unir_leads.sql), que ya salta RLS; con
--    `security definer` no ganaría nada y cualquiera con permiso de ejecutarla actuaría como su dueño.
create or replace function public.unir_leads(p_proyecto uuid, p_queda uuid, p_sobra uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  q public.leads;
  s public.leads;
  r record;
begin
  select * into q from leads where id = p_queda and proyecto_id = p_proyecto for update;
  select * into s from leads where id = p_sobra and proyecto_id = p_proyecto for update;
  if q.id is null or s.id is null or q.id = s.id then
    raise exception 'unir_leads: hacen falta dos leads distintos de este proyecto';
  end if;
  if q.creado_en > s.creado_en then
    raise exception 'unir_leads: se queda el más antiguo';
  end if;

  -- Choques de «no repetir»: se borra la fila del otro y se queda la del antiguo
  delete from clientes c where c.lead_id = s.id
    and exists (select 1 from clientes x where x.proyecto_id = c.proyecto_id and x.lead_id = q.id);
  delete from cualificaciones where lead_id = s.id and exists (select 1 from cualificaciones where lead_id = q.id);
  delete from tarjetas_extra t where t.lead_id = s.id
    and exists (select 1 from tarjetas_extra x where x.lead_id = q.id and x.pipeline_id = t.pipeline_id);
  -- Citas repetidas (citas_app_unica): lo que apunta a la del otro pasa a la del antiguo antes de borrarla
  for r in
    select c.id as otra, x.id as suya from citas c
    join citas x on x.lead_id = q.id and x.closer_id = c.closer_id and x.fecha = c.fecha
      and x.ghl_cita_id is null and x.estado not in ('cancelada', 'reagendada')
    where c.lead_id = s.id and c.ghl_cita_id is null and c.estado not in ('cancelada', 'reagendada')
  loop
    update analisis_llamadas set cita_id = r.suya where cita_id = r.otra;
    update grabaciones set cita_id = r.suya where cita_id = r.otra;
    delete from citas where id = r.otra;
  end loop;

  -- Las 14 tablas (los pagos van con su venta)
  update actividades set lead_id = q.id where lead_id = s.id;
  update citas set lead_id = q.id where lead_id = s.id;
  update ventas set lead_id = q.id where lead_id = s.id;
  update clientes set lead_id = q.id where lead_id = s.id;
  update seguimientos_cliente set lead_id = q.id where lead_id = s.id;
  update guion_marcas set lead_id = q.id where lead_id = s.id;
  update cualificaciones set lead_id = q.id where lead_id = s.id;
  update tarjetas_extra set lead_id = q.id where lead_id = s.id;
  update workflow_ejecuciones set lead_id = q.id where lead_id = s.id;
  update webhook_eventos set lead_id = q.id where lead_id = s.id;
  update llamadas_ghl set lead_id = q.id where lead_id = s.id;
  update grabaciones_caller set lead_id = q.id where lead_id = s.id;
  update analisis_llamadas set lead_id = q.id where lead_id = s.id;
  update vencimientos set lead_id = q.id where lead_id = s.id;

  -- Primero se borra el otro y después se copian email o contacto (reglas únicas, esquema.sql:74,79)
  delete from leads where id = s.id;
  update leads set
    ghl_contact_id = coalesce(nullif(ghl_contact_id, ''), s.ghl_contact_id),
    nombre = coalesce(nullif(nombre, ''), s.nombre),
    apellido = coalesce(nullif(apellido, ''), s.apellido),
    email = coalesce(nullif(email, ''), s.email),
    telefono = coalesce(nullif(telefono, ''), s.telefono),
    -- el país va con el teléfono del que salió (trigger lead_pais_del_telefono)
    pais = case when nullif(telefono, '') is null then s.pais else pais end,
    pais_de = case when nullif(telefono, '') is null then s.pais_de else pais_de end,
    etiquetas = q.etiquetas || array(select x from unnest(s.etiquetas) x where lower(btrim(x)) <> all (select lower(btrim(y)) from unnest(q.etiquetas) y)),
    respuestas = q.respuestas || coalesce(
      (select jsonb_agg(x) from jsonb_array_elements(s.respuestas) x where not q.respuestas @> jsonb_build_array(x)), '[]'::jsonb),
    seguimiento = s.seguimiento || q.seguimiento, -- en una misma clave, la del antiguo
    datos = coalesce(nullif(datos, '{}'::jsonb), s.datos),
    -- columna y pipeline van juntos
    pipeline_id = coalesce(pipeline_id, s.pipeline_id),
    etapa_id = case when pipeline_id is null then s.etapa_id else etapa_id end,
    caller_id = coalesce(caller_id, s.caller_id),
    closer_id = coalesce(closer_id, s.closer_id),
    llamar_en = coalesce(llamar_en, s.llamar_en),
    ultima_actividad = greatest(ultima_actividad, s.ultima_actividad),
    fuente = coalesce(fuente, s.fuente),
    evento = coalesce(evento, s.evento),
    quiz_score = coalesce(quiz_score, s.quiz_score),
    estrellas_caller = coalesce(estrellas_caller, s.estrellas_caller),
    oferta = coalesce(oferta, s.oferta),
    link_enviado_por = coalesce(link_enviado_por, s.link_enviado_por),
    link_enviado_en = coalesce(link_enviado_en, s.link_enviado_en)
  where id = q.id;

  -- Una tarjeta extra en el pipeline donde ya está el lead saldría 2 veces
  delete from tarjetas_extra t using leads l where l.id = q.id and t.lead_id = q.id and t.pipeline_id = l.pipeline_id;

  return case when nullif(q.ghl_contact_id, '') is null then null else s.ghl_contact_id end;
end $$;
revoke execute on function public.unir_leads(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.unir_leads(uuid, uuid, uuid) to service_role;

-- 2) guardar_canales: renombrar un canal cambia también «Canal: X» en la etiqueta base y las fijas de las Entradas y en
--    los pasos de los workflows (etiquetas, quitar etiqueta y ramas), con las funciones de 20261109130000_etiquetas.sql.
--    En dos vueltas (antes → marca → nuevo) para que valga aunque dos canales se cambien el nombre entre sí.
create or replace function public.guardar_canales(p_proyecto uuid, p_filas jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_de text[];
  v_a text[];
  i integer;
  v_marca text;
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

    -- Entradas (etiqueta base y fijas) y pasos de los workflows: primero cada nombre viejo a una marca, luego al nuevo
    for i in 1 .. array_length(v_de, 1) loop
      v_marca := chr(1) || i;
      perform cambiar_etiqueta_en_entradas_y_pasos(p_proyecto, v_de[i], v_marca);
    end loop;
    for i in 1 .. array_length(v_de, 1) loop
      perform cambiar_etiqueta_en_entradas_y_pasos(p_proyecto, chr(1) || i, v_a[i]);
    end loop;
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

-- Etiqueta `de` → `a` (sin distinguir mayúsculas) en la base y las fijas de las Entradas y en los pasos de los workflows
-- (si cambian, sube la versión, como al guardar desde el editor). La usa guardar_canales.
create or replace function public.cambiar_etiqueta_en_entradas_y_pasos(p_proyecto uuid, p_de text, p_a text)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_de text := lower(btrim(p_de));
begin
  update entradas en
  set ghl_etiqueta_base = case when lower(btrim(en.ghl_etiqueta_base)) = v_de then p_a else en.ghl_etiqueta_base end,
      ghl_etiquetas_extra = etiquetas_cambiadas(en.ghl_etiquetas_extra, v_de, p_a)
  where en.proyecto_id = p_proyecto
    and (lower(btrim(en.ghl_etiqueta_base)) = v_de or exists (select 1 from unnest(en.ghl_etiquetas_extra) as e where lower(btrim(e)) = v_de));

  update workflows w
  set pasos = pasos_con_etiqueta(w.pasos, v_de, p_a), version = w.version + 1, actualizado_en = now()
  where w.proyecto_id = p_proyecto and pasos_con_etiqueta(w.pasos, v_de, p_a) is distinct from w.pasos;
end;
$$;
revoke execute on function public.cambiar_etiqueta_en_entradas_y_pasos(uuid, text, text) from public, anon, authenticated;

-- 3) errores_app: cada vez que se guarda un error se borran los de más de 30 días (Cristian, 9 nov)
create or replace function public.registrar_error_app(p_proyecto uuid, p_sitio text, p_texto text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from errores_app where ultimo_en < now() - interval '30 days';
  insert into errores_app (proyecto_id, sitio, texto)
  values (p_proyecto, left(p_sitio, 100), left(p_texto, 500))
  on conflict (proyecto_id, sitio, texto) do update set veces = errores_app.veces + 1, ultimo_en = now();
$$;
revoke execute on function public.registrar_error_app(uuid, text, text) from public, anon, authenticated;
grant execute on function public.registrar_error_app(uuid, text, text) to service_role;
