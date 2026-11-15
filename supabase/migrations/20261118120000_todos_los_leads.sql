-- «Todos los leads» (Cristian, 15 nov: «solo CEO y directores, al día»; regla «por su pipeline»).
-- Hasta hoy era una copia hecha una vez el 10 nov (4.545 tarjetas) que no se ponía al día y que veía todo el equipo.
-- Solo añade: una marca en los pipelines, la columna «Otros», una regla al entrar cada lead y las tarjetas que faltan.
-- Las tarjetas de antes no se mueven.

-- 1) Pipelines solo para CEO y directores (la app lo respeta en el CRM: lib/pipelines.ts)
alter table public.pipelines add column if not exists solo_jefes boolean not null default false;
update public.pipelines set solo_jefes = true where nombre = 'Todos los leads' and tipo = 'normal';

-- 2) Columna «Otros» para los leads de pipelines que no son Biblioteca, Webinar 1, Webinar Ads ni Leads WhatsApp
insert into public.etapas (pipeline_id, nombre, orden)
select p.id, 'Otros', 4 from public.pipelines p
where p.nombre = 'Todos los leads' and p.tipo = 'normal'
  and not exists (select 1 from public.etapas e where e.pipeline_id = p.id and e.nombre = 'Otros');

-- 3) La columna de «Todos los leads» según el pipeline del lead
create or replace function public.columna_todos_los_leads(origen text) returns text
language sql immutable as $$
  select case
    when origen ilike '%biblioteca%' then 'Biblioteca'
    when origen ilike '%webinar ads%' then 'Webinar Ads'
    when origen ilike '%webinar 1%' then 'Webinar 1'
    when origen ilike '%whatsapp%' then 'Leads WhatsApp'
    else 'Otros'
  end
$$;

-- 4) Cada lead que entra (o al que se le pone pipeline) tiene su tarjeta en «Todos los leads», si aún no la tiene
create or replace function public.lead_a_todos_los_leads() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  todos uuid;
  origen text;
  etapa uuid;
begin
  if new.pipeline_id is null then return new; end if;
  select id into todos from pipelines where proyecto_id = new.proyecto_id and nombre = 'Todos los leads' and tipo = 'normal' limit 1;
  if todos is null or new.pipeline_id = todos then return new; end if;
  select nombre into origen from pipelines where id = new.pipeline_id;
  select id into etapa from etapas where pipeline_id = todos and nombre = columna_todos_los_leads(origen) limit 1;
  insert into tarjetas_extra (proyecto_id, lead_id, pipeline_id, etapa_id)
  values (new.proyecto_id, new.id, todos, etapa)
  on conflict (lead_id, pipeline_id) do nothing;
  return new;
end;
$$;

drop trigger if exists leads_a_todos_los_leads on public.leads;
create trigger leads_a_todos_los_leads
  after insert or update of pipeline_id on public.leads
  for each row execute function public.lead_a_todos_los_leads();

-- 5) Los que faltan desde el 10 nov (176 el 15 nov), con la misma regla
insert into public.tarjetas_extra (proyecto_id, lead_id, pipeline_id, etapa_id)
select l.proyecto_id, l.id, t.id,
  (select e.id from public.etapas e where e.pipeline_id = t.id and e.nombre = public.columna_todos_los_leads(o.nombre) limit 1)
from public.leads l
join public.pipelines t on t.proyecto_id = l.proyecto_id and t.nombre = 'Todos los leads' and t.tipo = 'normal'
join public.pipelines o on o.id = l.pipeline_id
where l.pipeline_id <> t.id
on conflict (lead_id, pipeline_id) do nothing;
