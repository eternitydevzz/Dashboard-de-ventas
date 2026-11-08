-- Plan GHL, A2 (Cristian, 8 nov 2026): se vacía el cuerpo de los envíos «ok» de más de 12 meses (el lead se queda),
-- salvo si ese lead tiene algún envío a la misma Entrada en los últimos 12 meses.
create or replace function public.limpiar_payload_envios()
returns void
language sql
security definer
set search_path = public
as $$
  update webhook_eventos w
  set payload = '{}'::jsonb -- la columna es not null
  where w.ghl_estado = 'ok'
    and w.recibido_en < now() - interval '12 months'
    and w.payload <> '{}'::jsonb
    and not exists (
      select 1 from webhook_eventos r
      where r.lead_id = w.lead_id and r.entrada_id = w.entrada_id and r.recibido_en >= now() - interval '12 months'
    );
$$;
revoke execute on function public.limpiar_payload_envios() from public, anon, authenticated;
grant execute on function public.limpiar_payload_envios() to service_role;

-- Una vez al día, solo en la base de la nube (la de Maestria), como 'limpiar-historial-cron'
do $$
begin
  if exists (select 1 from public.proyectos where ghl_location_id = 'ZGWJLBH58RJtl2iGhykp') then
    perform cron.schedule('limpiar-payload-envios', '23 4 * * *', $job$ select public.limpiar_payload_envios() $job$);
  end if;
end $$;
