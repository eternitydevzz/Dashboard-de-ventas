-- Cristian, 10 nov 2026: fuera el estado «Llamado» y vuelve «Link enviado» (botón «Link de agenda»), justo antes
-- de «Agendado». Los leads que están en «Llamado» vuelven a «Leads». Las 12 columnas de «Callers» quedan:
--   Leads (nuevo) → Wsp enviado → No responde → No interesa → Seguimiento → Llamar luego → Link enviado → Agendado →
--   Confirma Agenda → Reagendado → Descartado → Cerrados (vendido)
-- El historial con «llamado» se queda como está (la app lo sigue leyendo como «Llamado»).

alter table public.leads drop constraint leads_estado_caller_check;
alter table public.etapas drop constraint etapas_estado_caller_check;

-- 1) Los leads en «Llamado» → «Leads» (el trigger leads_columna_callers los mueve a la columna «Leads»)
update public.leads set estado_caller = 'nuevo' where estado_caller = 'llamado';

-- 2) En «Callers», la columna «Llamado» pasa a ser «Link enviado»; en otros pipelines, si alguna estaba unida, queda libre
update public.etapas e set estado_caller = 'link_enviado', nombre = 'Link enviado'
from public.pipelines p where p.id = e.pipeline_id and p.tipo = 'callers' and e.estado_caller = 'llamado';
update public.etapas e set estado_caller = null
from public.pipelines p where p.id = e.pipeline_id and p.tipo <> 'callers' and e.estado_caller = 'llamado';

-- 3) La que falte en algún «Callers», y nombre, orden y color de las 12
insert into public.etapas (pipeline_id, nombre, orden, color, estado_caller)
select p.id, x.nombre, x.orden, x.color, x.estado
from public.pipelines p
cross join (values
  ('nuevo', 'Leads', 0, '#64748b'), ('wsp_enviado', 'Wsp enviado', 1, '#15924a'), ('no_responde', 'No responde', 2, '#7c8aa3'),
  ('no_interesa', 'No interesa', 3, '#d0303f'), ('seguimiento', 'Seguimiento', 4, '#c98a12'), ('llamar_luego', 'Llamar luego', 5, '#c46a08'),
  ('link_enviado', 'Link enviado', 6, '#0d9488'), ('agendado', 'Agendado', 7, '#3f6ee6'), ('confirma_agenda', 'Confirma Agenda', 8, '#0891b2'),
  ('reagendado', 'Reagendado', 9, '#7c4ddb'), ('descartado', 'Descartado', 10, '#7b1a22'), ('vendido', 'Cerrados', 11, '#16a34a')
) as x (estado, nombre, orden, color)
where p.tipo = 'callers'
  and not exists (select 1 from public.etapas e where e.pipeline_id = p.id and e.estado_caller = x.estado);

update public.etapas e set nombre = x.nombre, orden = x.orden, color = x.color
from public.pipelines p,
  (values
    ('nuevo', 'Leads', 0, '#64748b'), ('wsp_enviado', 'Wsp enviado', 1, '#15924a'), ('no_responde', 'No responde', 2, '#7c8aa3'),
    ('no_interesa', 'No interesa', 3, '#d0303f'), ('seguimiento', 'Seguimiento', 4, '#c98a12'), ('llamar_luego', 'Llamar luego', 5, '#c46a08'),
    ('link_enviado', 'Link enviado', 6, '#0d9488'), ('agendado', 'Agendado', 7, '#3f6ee6'), ('confirma_agenda', 'Confirma Agenda', 8, '#0891b2'),
    ('reagendado', 'Reagendado', 9, '#7c4ddb'), ('descartado', 'Descartado', 10, '#7b1a22'), ('vendido', 'Cerrados', 11, '#16a34a')
  ) as x (estado, nombre, orden, color)
where p.id = e.pipeline_id and p.tipo = 'callers' and e.estado_caller = x.estado;

-- 4) La base solo acepta los 12 estados nuevos
alter table public.leads add constraint leads_estado_caller_check check (estado_caller in (
  'nuevo', 'wsp_enviado', 'no_responde', 'no_interesa', 'seguimiento', 'llamar_luego', 'link_enviado', 'agendado',
  'confirma_agenda', 'reagendado', 'descartado', 'vendido'));
alter table public.etapas add constraint etapas_estado_caller_check check (estado_caller in (
  'nuevo', 'wsp_enviado', 'no_responde', 'no_interesa', 'seguimiento', 'llamar_luego', 'link_enviado', 'agendado',
  'confirma_agenda', 'reagendado', 'descartado', 'vendido'));

-- 5) Los proyectos nuevos nacen con las 12 columnas nuevas («Closers», igual que en 20261107150200)
create or replace function public.crear_pipelines_equipo(p_proyecto uuid) returns void
language plpgsql set search_path = public as $$
declare
  pc uuid;
begin
  if not exists (select 1 from pipelines where proyecto_id = p_proyecto and tipo = 'callers') then
    insert into pipelines (proyecto_id, nombre, orden, tipo) values (p_proyecto, 'Callers', 1000, 'callers') returning id into pc;
    insert into etapas (pipeline_id, nombre, orden, color, estado_caller) values
      (pc, 'Leads', 0, '#64748b', 'nuevo'),
      (pc, 'Wsp enviado', 1, '#15924a', 'wsp_enviado'),
      (pc, 'No responde', 2, '#7c8aa3', 'no_responde'),
      (pc, 'No interesa', 3, '#d0303f', 'no_interesa'),
      (pc, 'Seguimiento', 4, '#c98a12', 'seguimiento'),
      (pc, 'Llamar luego', 5, '#c46a08', 'llamar_luego'),
      (pc, 'Link enviado', 6, '#0d9488', 'link_enviado'),
      (pc, 'Agendado', 7, '#3f6ee6', 'agendado'),
      (pc, 'Confirma Agenda', 8, '#0891b2', 'confirma_agenda'),
      (pc, 'Reagendado', 9, '#7c4ddb', 'reagendado'),
      (pc, 'Descartado', 10, '#7b1a22', 'descartado'),
      (pc, 'Cerrados', 11, '#16a34a', 'vendido');
  end if;
  if not exists (select 1 from pipelines where proyecto_id = p_proyecto and tipo = 'closers') then
    insert into pipelines (proyecto_id, nombre, orden, tipo) values (p_proyecto, 'Closers', 1001, 'closers') returning id into pc;
    insert into etapas (pipeline_id, nombre, orden, color, columna_cita) values
      (pc, 'Pendiente', 0, 'var(--aviso)', 'pendiente'),
      (pc, 'Confirmación pendiente', 1, 'var(--oro)', 'confirmacion_pendiente'),
      (pc, 'Confirmado', 2, 'var(--ok)', 'confirmada'),
      (pc, 'No califica', 3, 'var(--mal)', 'no_califica'),
      (pc, 'Pendientes (ya pasaron)', 4, 'var(--aviso)', 'pendientes'),
      (pc, 'Reagendadas', 5, 'var(--oro)', 'reagendadas'),
      (pc, 'Reserva', 6, 'var(--primario)', 'reserva'),
      (pc, 'Cuotas', 7, 'var(--morado)', 'cuotas'),
      (pc, 'Cerradas', 8, 'var(--ok)', 'cerradas'),
      (pc, 'En seguimiento', 9, 'var(--oro)', 'seguimiento'),
      (pc, 'No-show', 10, 'var(--mal)', 'no_show'),
      (pc, 'Canceladas', 11, 'var(--texto-3)', 'cancelada'),
      (pc, 'Perdidas', 12, 'var(--mal)', 'perdida');
  end if;
end $$;
