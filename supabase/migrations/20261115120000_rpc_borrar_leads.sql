-- Ola 6 · C6: borrar leads en masa en un solo paso (todo o nada). Antes la app leía citas y ventas y luego borraba
-- por trozos: si fallaba a mitad quedaba una parte borrada, y una venta registrada entre la lectura y el borrado
-- se borraba en cascada. Se saltan los leads con citas o ventas (como antes). Devuelve cuántos borró.
-- Solo añade una función: la app de antes sigue funcionando con ella puesta.
create or replace function public.borrar_leads(p_proyecto uuid, p_ids uuid[])
returns integer
language plpgsql
set search_path = public
as $$
declare
  n integer;
begin
  -- Candado: mientras dura, nadie puede crear citas ni ventas de estos leads (la FK espera), y el delete,
  -- que es otra sentencia, ya ve las que entraron antes. En orden, para que 2 borrados a la vez no se bloqueen.
  perform 1 from leads x where x.proyecto_id = p_proyecto and x.id = any(p_ids) order by x.id for update;
  delete from leads l
  where l.proyecto_id = p_proyecto
    and l.id = any(p_ids)
    and not exists (select 1 from citas c where c.lead_id = l.id)
    and not exists (select 1 from ventas v where v.lead_id = l.id);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.borrar_leads(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.borrar_leads(uuid, uuid[]) to service_role;
