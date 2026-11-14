-- Fase 3 · «Unir» deja la app y GHL iguales (Cristian, 13 nov 2026: «que la app se encargue de que se vea igual en la
-- app y en GHL»).
-- 1) Tabla nueva ghl_contactos_unidos: el contacto de GHL del lead que sobró → el lead que se quedó. La lectura de GHL
--    la mira para no volver a crear el que sobra (por si en GHL no se pudo borrar o tarda en desaparecer).
-- 2) unir_leads devuelve jsonb { ghl_sobra, ghl_citas_sobran, citas_juntadas, cita_en_sobra }:
--    · si los dos tenían citas abiertas, queda una sola: manda la última (su hora y su closer, como
--      juntarConCitaAbierta); se conservan la fecha de alta de la primera y el crédito de caller si la última no lo trae.
--      `ghl_citas_sobran` son los eventos de GHL de las que se quitan, para borrarlos allí (borrarCitaGhl).
--    · `cita_en_sobra`: la cita abierta que queda es un evento del contacto que sobra. La API no deja pasar un evento a
--      otro contacto, así que ese contacto no se borra (se avisa para unirlo a mano).
--    Cambia lo que devuelve (antes text): hay que borrarla y crearla otra vez, con sus mismos permisos.
-- Solo añade una tabla y reemplaza la función.

create table if not exists public.ghl_contactos_unidos (
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  contact_id text not null,
  lead_id uuid not null references public.leads (id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (proyecto_id, contact_id)
);
create index if not exists ghl_contactos_unidos_lead_idx on public.ghl_contactos_unidos (lead_id);
-- Sin políticas: solo la usa el servidor (service_role)
alter table public.ghl_contactos_unidos enable row level security;

drop function if exists public.unir_leads(uuid, uuid, uuid);
create function public.unir_leads(p_proyecto uuid, p_queda uuid, p_sobra uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  q public.leads;
  s public.leads;
  r record;
  v_abiertas text[] := array['pendiente', 'confirmacion_pendiente', 'confirmada']; -- ABIERTAS de src/lib/llamadas.ts
  v_gana public.citas;
  v_credito record;
  v_alta timestamptz;
  v_eventos text[] := '{}';
  v_juntadas integer := 0;
  v_cita_en_sobra boolean := false;
begin
  select * into q from leads where id = p_queda and proyecto_id = p_proyecto for update;
  select * into s from leads where id = p_sobra and proyecto_id = p_proyecto for update;
  if q.id is null or s.id is null or q.id = s.id then
    raise exception 'unir_leads: hacen falta dos leads distintos de este proyecto';
  end if;
  if q.creado_en > s.creado_en then
    raise exception 'unir_leads: se queda el más antiguo';
  end if;

  -- Una sola cita abierta (Fase 3, «manda la última»), solo si los dos tenían alguna
  if exists (select 1 from citas where lead_id = q.id and estado = any (v_abiertas))
     and exists (select 1 from citas where lead_id = s.id and estado = any (v_abiertas)) then
    select * into v_gana from citas where lead_id in (q.id, s.id) and estado = any (v_abiertas)
      order by creado_en desc, id desc limit 1 for update;
    select min(creado_en) into v_alta from citas where lead_id in (q.id, s.id) and estado = any (v_abiertas);
    select agendada_por, estrellas_caller into v_credito from citas
      where lead_id in (q.id, s.id) and estado = any (v_abiertas) and agendada_por is not null
      order by (id = v_gana.id) desc, creado_en desc limit 1;
    for r in select id, ghl_cita_id from citas where lead_id in (q.id, s.id) and estado = any (v_abiertas) and id <> v_gana.id loop
      update analisis_llamadas set cita_id = v_gana.id where cita_id = r.id;
      update grabaciones set cita_id = v_gana.id where cita_id = r.id;
      delete from citas where id = r.id;
      v_juntadas := v_juntadas + 1;
      if r.ghl_cita_id is not null and r.ghl_cita_id is distinct from v_gana.ghl_cita_id then
        v_eventos := v_eventos || r.ghl_cita_id;
      end if;
    end loop;
    update citas set
      creado_en = v_alta,
      agendada_por = coalesce(v_credito.agendada_por, agendada_por),
      estrellas_caller = case when v_credito.agendada_por is null then estrellas_caller else v_credito.estrellas_caller end
    where id = v_gana.id;
  end if;
  -- Antes de mover las citas: ¿queda abierta una del contacto que sobra?
  v_cita_en_sobra := exists (select 1 from citas where lead_id = s.id and estado = any (v_abiertas) and ghl_cita_id is not null);

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
  -- Contactos que ya se habían unido al que sobra pasan al que se queda (si no, el borrado en cascada los olvidaría)
  update ghl_contactos_unidos set lead_id = q.id where lead_id = s.id;

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

  -- El contacto que sobra apunta al que se queda: la lectura de GHL ya no lo vuelve a crear
  if nullif(q.ghl_contact_id, '') is not null and nullif(s.ghl_contact_id, '') is not null then
    insert into ghl_contactos_unidos (proyecto_id, contact_id, lead_id) values (p_proyecto, s.ghl_contact_id, q.id)
    on conflict (proyecto_id, contact_id) do update set lead_id = excluded.lead_id;
  end if;

  return jsonb_build_object(
    'ghl_sobra', case when nullif(q.ghl_contact_id, '') is null then null else nullif(s.ghl_contact_id, '') end,
    'ghl_citas_sobran', to_jsonb(v_eventos),
    'citas_juntadas', v_juntadas,
    'cita_en_sobra', v_cita_en_sobra
  );
end $$;
revoke execute on function public.unir_leads(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.unir_leads(uuid, uuid, uuid) to service_role;
