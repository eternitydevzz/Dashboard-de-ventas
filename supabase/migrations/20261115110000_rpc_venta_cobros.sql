-- Ola 6 · 6V (auditoría final C1 y C6): venta, cobros y forma de pago, cada uno todo o nada (la función entera es una
-- transacción). Los cálculos (importe, plazos, comisión, estrellas…) siguen en la app; estas funciones solo escriben.
-- Solo añade funciones: la app de antes sigue funcionando con ellas puestas. Las llama la app con la clave de servicio.

-- C1 · Registrar venta: cierra la cita, crea la venta y sus plazos y marca el lead «vendido».
-- La cita va primero: si dos ventas llegan a la vez con la misma cita, la 2.ª espera al candado de la fila, la encuentra
-- cerrada y falla sin guardar nada. Si falla cualquier paso (p. ej. un plazo), no queda nada y se puede reintentar.
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

-- C6 · Cobro posterior: con la venta bloqueada (for update), dos cobros a la vez se suman uno detrás de otro
-- y ninguno pasa de lo facturado.
create or replace function public.registrar_cobro(p_proyecto uuid, p_venta uuid, p_importe numeric, p_metodo text, p_registrado_por uuid, p_fecha timestamptz)
returns void
language plpgsql
set search_path = public
as $$
declare
  v public.ventas;
  cobrado numeric;
begin
  select * into v from ventas where id = p_venta and proyecto_id = p_proyecto for update;
  if v.id is null then
    raise exception 'registrar_cobro: venta no encontrada';
  end if;
  select v.cash_collected + coalesce(sum(importe), 0) into cobrado from pagos where venta_id = p_venta;
  if cobrado + p_importe > v.facturacion + 0.001 then
    raise exception 'registrar_cobro: excede_facturacion';
  end if;
  insert into pagos (venta_id, importe, metodo, registrado_por, fecha) values (p_venta, p_importe, p_metodo, p_registrado_por, p_fecha);
end $$;
revoke execute on function public.registrar_cobro(uuid, uuid, numeric, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.registrar_cobro(uuid, uuid, numeric, text, uuid, timestamptz) to service_role;

-- C6 · Reserva ↔ cuotas: quitar los plazos pendientes, crear los nuevos y cambiar la venta, todo o nada
-- (antes, si fallaba crear los nuevos, la venta se quedaba sin plazos).
create or replace function public.cambiar_forma_pago(p_proyecto uuid, p_venta uuid, p_tipo text, p_num_cuotas integer, p_plazos jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v public.ventas;
begin
  select * into v from ventas where id = p_venta and proyecto_id = p_proyecto for update;
  if v.id is null then
    raise exception 'cambiar_forma_pago: venta no encontrada';
  end if;
  delete from vencimientos where venta_id = p_venta and estado = 'pendiente';
  insert into vencimientos (proyecto_id, venta_id, lead_id, numero, importe, vence_el)
  select p_proyecto, p_venta, v.lead_id, x.numero, x.importe, x.vence_el
  from jsonb_to_recordset(p_plazos) as x(numero integer, importe numeric, vence_el date);
  update ventas set tipo_pago = p_tipo, num_cuotas = p_num_cuotas where id = p_venta;
end $$;
revoke execute on function public.cambiar_forma_pago(uuid, uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.cambiar_forma_pago(uuid, uuid, text, integer, jsonb) to service_role;
