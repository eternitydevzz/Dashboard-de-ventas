-- D1 · Unir leads duplicados (plan GHL 4.3; Cristian, 8 nov 2026): botón «Unir» con confirmación, nada automático.
-- Todo o nada (la función entera es una transacción). Se queda el más antiguo (`p_queda`) y pasa a él todo lo del otro
-- (`p_sobra`): las filas de las 14 tablas que apuntan a un lead. En los choques de «no repetir» se queda la fila del
-- antiguo. Se juntan etiquetas, respuestas y seguimiento; un campo vacío del antiguo se rellena con el del otro.
-- Devuelve el contacto de GHL que sobra (null si no tenía o si pasó al antiguo): ese lo une o lo borra Cristian en GHL.
-- Solo añade una función. No la llama nada automático.
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
    etiquetas = q.etiquetas || array(select x from unnest(s.etiquetas) x where x <> all (q.etiquetas)),
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

  return case when nullif(q.ghl_contact_id, '') is null then null else s.ghl_contact_id end;
end $$;
revoke execute on function public.unir_leads(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.unir_leads(uuid, uuid, uuid) to service_role;
