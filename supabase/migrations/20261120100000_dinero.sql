-- Fase 2 · zona a (Dinero). Solo reemplaza y añade funciones (parten de 20261115110000_rpc_venta_cobros.sql);
-- los permisos son los de siempre: solo la clave de servicio (la app).

-- S5-4 · Registrar venta: el lead se bloquea al empezar, así dos ventas del mismo lead van una detrás de otra.
-- Sin cita no había candado: un doble clic creaba 2 ventas, 2 juegos de plazos y comisión doble. Ahora la 2.ª ve la
-- 1.ª (mismo producto e importe, hace menos de 1 minuto) y falla sin guardar nada. Con cita ya frenaba la cita cerrada.
create or replace function public.registrar_venta(
  p_proyecto uuid, p_lead uuid, p_producto uuid, p_vendedor uuid, p_facturacion numeric, p_cash numeric,
  p_tipo_pago text, p_num_cuotas integer, p_metodo text, p_nota text, p_fecha timestamptz, p_plazos jsonb,
  p_cita uuid, p_cita_fecha timestamptz, p_estrellas smallint
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform 1 from leads where id = p_lead and proyecto_id = p_proyecto for update;
  if p_cita is null and exists (
    select 1 from ventas
    where lead_id = p_lead and proyecto_id = p_proyecto and producto_id is not distinct from p_producto
      and facturacion = round(p_facturacion, 2) and creado_en > now() - interval '1 minute'
  ) then
    raise exception 'registrar_venta: duplicada';
  end if;

  if p_cita is not null then
    update citas set
      estado = 'cerrada',
      fecha = coalesce(p_cita_fecha, fecha), -- cita adelantada: se cierra con la hora de ahora
      estrellas_closer = coalesce(p_estrellas, estrellas_closer)
    where id = p_cita and lead_id = p_lead and proyecto_id = p_proyecto and estado <> 'cerrada';
    if not found then
      raise exception 'registrar_venta: cita_cerrada';
    end if;
  end if;

  insert into ventas (proyecto_id, lead_id, producto_id, vendedor_id, facturacion, cash_collected, tipo_pago, num_cuotas, metodo, nota, fecha)
  values (p_proyecto, p_lead, p_producto, p_vendedor, p_facturacion, p_cash, p_tipo_pago, p_num_cuotas, p_metodo, p_nota, p_fecha)
  returning id into v_id;

  insert into vencimientos (proyecto_id, venta_id, lead_id, numero, importe, vence_el)
  select p_proyecto, v_id, p_lead, x.numero, x.importe, x.vence_el
  from jsonb_to_recordset(coalesce(p_plazos, '[]'::jsonb)) as x(numero integer, importe numeric, vence_el date);

  update leads set estado_caller = 'vendido' where id = p_lead and proyecto_id = p_proyecto;
  if not found then
    raise exception 'registrar_venta: lead no encontrado';
  end if;

  return v_id;
end $$;
revoke execute on function public.registrar_venta(uuid, uuid, uuid, uuid, numeric, numeric, text, integer, text, text, timestamptz, jsonb, uuid, timestamptz, smallint) from public, anon, authenticated;
grant execute on function public.registrar_venta(uuid, uuid, uuid, uuid, numeric, numeric, text, integer, text, text, timestamptz, jsonb, uuid, timestamptz, smallint) to service_role;

-- A5-01 · Cobro posterior. En una membresía (tipo_pago 'mensual') la facturación es la de UN mes: el tope era 47 y
-- desde el 2.º mes no se podía cobrar. Ahora el tope es el 1.er mes (lo de la venta) más sus plazos (sin los «no paga»).
-- Como siempre hay creado el plazo del mes siguiente, se puede cobrar también un mes por adelantado, no más.
create or replace function public.registrar_cobro(p_proyecto uuid, p_venta uuid, p_importe numeric, p_metodo text, p_registrado_por uuid, p_fecha timestamptz)
returns void
language plpgsql
set search_path = public
as $$
declare
  v public.ventas;
  cobrado numeric;
  tope numeric;
begin
  select * into v from ventas where id = p_venta and proyecto_id = p_proyecto for update;
  if v.id is null then
    raise exception 'registrar_cobro: venta no encontrada';
  end if;
  tope := v.facturacion;
  if v.tipo_pago = 'mensual' then
    select v.facturacion + coalesce(sum(importe), 0) into tope from vencimientos where venta_id = p_venta and estado <> 'no_paga';
  end if;
  select v.cash_collected + coalesce(sum(importe), 0) into cobrado from pagos where venta_id = p_venta;
  if cobrado + p_importe > tope + 0.001 then
    raise exception 'registrar_cobro: excede_facturacion';
  end if;
  insert into pagos (venta_id, importe, metodo, registrado_por, fecha) values (p_venta, p_importe, p_metodo, p_registrado_por, p_fecha);
end $$;
revoke execute on function public.registrar_cobro(uuid, uuid, numeric, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.registrar_cobro(uuid, uuid, numeric, text, uuid, timestamptz) to service_role;

-- S2-8 · Borrar venta, todo o nada (antes la app borraba y después cambiaba cita y lead; si caía entre medias, el lead
-- quedaba «vendido» sin venta). Lo mismo que hacía la app: sus cobros y plazos se van con ella (on delete cascade);
-- si al lead no le queda otra venta, su última cita cerrada vuelve a «seguimiento» y el lead pasa a «agendado» (si
-- tiene citas) o «nuevo». Devuelve esa cita (o null). Los permisos los mira la app antes de llamarla.
create or replace function public.borrar_venta(p_proyecto uuid, p_venta uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_lead uuid;
  v_cita uuid;
begin
  select lead_id into v_lead from ventas where id = p_venta and proyecto_id = p_proyecto;
  if v_lead is null then
    raise exception 'borrar_venta: venta no encontrada';
  end if;
  perform 1 from leads where id = v_lead for update; -- como registrar_venta: venta y borrado del mismo lead, uno detrás de otro
  delete from ventas where id = p_venta and proyecto_id = p_proyecto;
  if not found then
    raise exception 'borrar_venta: venta no encontrada';
  end if;
  if not exists (select 1 from ventas where lead_id = v_lead) then
    select id into v_cita from citas where lead_id = v_lead and estado = 'cerrada' order by fecha desc limit 1;
    if v_cita is not null then
      update citas set estado = 'seguimiento' where id = v_cita;
    end if;
    update leads set estado_caller = case when exists (select 1 from citas where lead_id = v_lead) then 'agendado' else 'nuevo' end
    where id = v_lead;
  end if;
  return v_cita;
end $$;
revoke execute on function public.borrar_venta(uuid, uuid) from public, anon, authenticated;
grant execute on function public.borrar_venta(uuid, uuid) to service_role;
