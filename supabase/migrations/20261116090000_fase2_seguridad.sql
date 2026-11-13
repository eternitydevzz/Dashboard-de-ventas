-- Fase 2 · D43 (carril «seguridad»). Solo añade funciones e índices, quita un índice repetido y cierra un permiso.
-- No cambia ni borra datos. Las funciones nuevas las llama la app con la clave de servicio.

-- 1) crear_pipelines_equipo solo la usa el trigger de proyectos nuevos (proyecto_nuevo_pipelines), que corre con
-- el rol que inserta el proyecto: la app y los scripts, con la clave de servicio. Nadie más la necesita.
revoke execute on function public.crear_pipelines_equipo(uuid) from public, anon, authenticated;
grant execute on function public.crear_pipelines_equipo(uuid) to service_role;

-- 2) Comisiones del mes en un solo paso y con candado (cabo suelto del 13 nov). Los cálculos siguen en la app
-- (lib/finanzas.ts, liquidacionesMes): las cifras son las mismas; aquí solo se guarda, todo o nada.
-- - candado por proyecto y mes: dos recalculos a la vez van uno detrás de otro
-- - una pagada nunca vuelve a «pendiente» (tampoco si la pagan mientras se recalcula)
-- - se rehacen las pendientes, se crean las que faltan y se borran las pendientes de quien ya no sale
-- Devuelve quién tiene ya pagado ese mes (la app lo enseña como «ya pagadas»).
create or replace function public.recalcular_liquidaciones(p_proyecto uuid, p_mes text, p_filas jsonb)
returns uuid[]
language plpgsql
set search_path = public
as $$
declare
  pagadas uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended('liquidaciones:' || p_proyecto::text || ':' || p_mes, 0));
  select coalesce(array_agg(perfil_id), '{}') into pagadas
  from liquidaciones where proyecto_id = p_proyecto and mes = p_mes and estado = 'pagada';

  insert into liquidaciones (proyecto_id, perfil_id, mes, base_facturado, base_cobrado, comision_facturado, comision_cobrado, tramo, detalle, estado, calculada_en)
  select p_proyecto, x.perfil_id, p_mes, x.base_facturado, x.base_cobrado, x.comision_facturado, x.comision_cobrado,
         nullif(x.tramo, 'null'::jsonb), coalesce(x.detalle, '[]'::jsonb), 'pendiente', now()
  from jsonb_to_recordset(coalesce(p_filas, '[]'::jsonb))
    as x(perfil_id uuid, base_facturado numeric, base_cobrado numeric, comision_facturado numeric, comision_cobrado numeric, tramo jsonb, detalle jsonb)
  where x.perfil_id <> all (pagadas)
  on conflict (proyecto_id, perfil_id, mes) do update set
    base_facturado = excluded.base_facturado,
    base_cobrado = excluded.base_cobrado,
    comision_facturado = excluded.comision_facturado,
    comision_cobrado = excluded.comision_cobrado,
    tramo = excluded.tramo,
    detalle = excluded.detalle,
    calculada_en = excluded.calculada_en
  where liquidaciones.estado = 'pendiente';

  delete from liquidaciones l
  where l.proyecto_id = p_proyecto and l.mes = p_mes and l.estado = 'pendiente'
    and not exists (
      select 1 from jsonb_to_recordset(coalesce(p_filas, '[]'::jsonb)) as x(perfil_id uuid) where x.perfil_id = l.perfil_id
    );

  return pagadas;
end $$;
revoke execute on function public.recalcular_liquidaciones(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.recalcular_liquidaciones(uuid, text, jsonb) to service_role;

-- 3) Cambiar la forma de pago y marcar un plazo a la vez no se pisan (cabo suelto del 13 nov). La app lee los
-- plazos que se quedan (pagados o «no paga») y calcula los nuevos con ellos; aquí, con la venta y sus plazos
-- bloqueados, se comprueba que siguen siendo los mismos. Si alguien marcó o desmarcó uno mientras tanto, no se
-- cambia nada («plazos_cambiados») y la app pide recargar. Va con un parámetro más (p_fijos): es otra función,
-- así la de 5 parámetros (20261115110000_rpc_venta_cobros.sql) no la pisa, sea cual sea el orden.
create or replace function public.cambiar_forma_pago(p_proyecto uuid, p_venta uuid, p_tipo text, p_num_cuotas integer, p_plazos jsonb, p_fijos uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  v public.ventas;
  ahora uuid[];
begin
  select * into v from ventas where id = p_venta and proyecto_id = p_proyecto for update;
  if v.id is null then
    raise exception 'cambiar_forma_pago: venta no encontrada';
  end if;
  perform 1 from vencimientos where venta_id = p_venta for update; -- marcar un plazo espera a que esto acabe
  select coalesce(array_agg(id order by id), '{}') into ahora from vencimientos where venta_id = p_venta and estado <> 'pendiente';
  if ahora <> coalesce((select array_agg(x order by x) from unnest(p_fijos) as x), '{}') then
    raise exception 'cambiar_forma_pago: plazos_cambiados';
  end if;
  delete from vencimientos where venta_id = p_venta and estado = 'pendiente';
  insert into vencimientos (proyecto_id, venta_id, lead_id, numero, importe, vence_el)
  select p_proyecto, p_venta, v.lead_id, x.numero, x.importe, x.vence_el
  from jsonb_to_recordset(p_plazos) as x(numero integer, importe numeric, vence_el date);
  update ventas set tipo_pago = p_tipo, num_cuotas = p_num_cuotas where id = p_venta;
end $$;
revoke execute on function public.cambiar_forma_pago(uuid, uuid, text, integer, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.cambiar_forma_pago(uuid, uuid, text, integer, jsonb, uuid[]) to service_role;

-- 4) Índices. vencimientos_venta_idx (venta_id) sobra: el único (venta_id, numero) empieza por venta_id y sirve
-- para lo mismo. Se asegura antes el único (es el mismo de 20261115100000_vencimientos_unico.sql, con
-- «if not exists»), para no quedarse nunca sin índice por venta.
create unique index if not exists vencimientos_venta_numero_unico on public.vencimientos (venta_id, numero);
drop index if exists public.vencimientos_venta_idx;

-- Agendas por caller (quién agendó y cuándo) y tarjetas extra del CRM por proyecto
create index if not exists citas_proyecto_agendada_por_idx on public.citas (proyecto_id, agendada_por, creado_en);
create index if not exists tarjetas_extra_proyecto_idx on public.tarjetas_extra (proyecto_id);
