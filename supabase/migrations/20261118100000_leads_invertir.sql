-- Velocidad (Cristian, 14 nov, noche: «sí, hazla»): el CRM leía todas las respuestas de cada lead (~1,3 MB por carga)
-- solo para enseñar en la tarjeta la de «invertir». Ahora la base la guarda en una columna calculada, que se pone al
-- día sola al crear o cambiar las respuestas (webhook, Entradas, GHL, CSV o a mano). Solo añade; no toca ningún dato.
-- Misma regla que tenía crm/page.tsx: la primera respuesta cuya pregunta contiene «invertir» (sin mayúsculas).

create or replace function public.invertir_de(r jsonb) returns text
language sql immutable parallel safe as $$
  select e->>'respuesta'
  from jsonb_array_elements(case when jsonb_typeof(r) = 'array' then r else '[]'::jsonb end) with ordinality as x(e, i)
  where lower(e->>'pregunta') like '%invertir%'
  order by i
  limit 1
$$;

alter table public.leads add column if not exists invertir text generated always as (public.invertir_de(respuestas)) stored;
