-- Plan GHL, punto 0 · Panel de endpoints (Cristian, 7 nov 2026).
-- Solo AÑADE: 4 columnas opcionales en `entradas` (el endpoint no las lee), una función de solo lectura para el
-- resumen de cada Entrada y un índice para buscar los envíos en rojo. No cambia ni borra nada de lo que hay.

-- 1 · De qué landing es cada Entrada (para el panel y el JSON de ejemplo)
alter table public.entradas
  add column landing text check (char_length(landing) <= 80),        -- p. ej. «biblioteca»
  add column formulario text check (char_length(formulario) <= 80),  -- p. ej. «registro»
  add column envia_desde text check (envia_desde in ('navegador', 'servidor')), -- null = «no lo sé»
  add column archivo text check (char_length(archivo) <= 120);       -- p. ej. «api/signup.js» (opcional)

-- Las 2 Entradas reales de la Biblioteca (datos del plan). Solo estas 4 columnas nuevas: su dirección, su clave
-- y todo lo demás se quedan igual. En una base sin ellas (tests) no hace nada.
update public.entradas set landing = 'biblioteca', formulario = 'registro', envia_desde = 'servidor', archivo = 'api/signup.js'
  where id = '087b86d1-72f6-4df1-a6ff-d5e276ca0879';
update public.entradas set landing = 'biblioteca', formulario = 'agenda', envia_desde = 'navegador', archivo = 'web/programa.js'
  where id = 'bc00a154-560c-4ac3-ba4f-0a850116bf73';

-- 2 · Resumen de cada Entrada del proyecto en UNA consulta: envíos, leads distintos, envíos en rojo y el último
create or replace function public.resumen_entradas(p_proyecto uuid)
returns table (entrada_id uuid, envios bigint, leads bigint, rojos bigint, ultimo timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    en.id,
    count(w.id),
    count(distinct w.lead_id),
    count(w.id) filter (where w.ghl_estado = 'error'),
    max(w.recibido_en)
  from entradas en
  left join webhook_eventos w on w.entrada_id = en.id
  where en.proyecto_id = p_proyecto
  group by en.id;
$$;
revoke execute on function public.resumen_entradas(uuid) from public, anon, authenticated;
grant execute on function public.resumen_entradas(uuid) to service_role;

-- 3 · Los envíos en rojo se buscan aparte y sin límite (antes solo se veían entre los 200 últimos)
create index if not exists webhook_eventos_entrada_rojo_idx on public.webhook_eventos (entrada_id, recibido_en desc) where ghl_estado = 'error';
