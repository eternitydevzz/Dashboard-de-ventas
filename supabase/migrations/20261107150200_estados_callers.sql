-- C11 · Columnas nuevas del pipeline «Callers» (plan Callers, 7 nov 2026, decisiones de Cristian):
-- 12 columnas, una por estado del caller, en este orden:
--   Leads (nuevo) → Llamado → Wsp enviado → No responde → No interesa → Seguimiento → Llamar luego → Agendado →
--   Confirma Agenda → Reagendado → Descartado → Cerrados (vendido)
-- Desaparecen «No contesta» y «Link enviado». Los leads que están hoy en esos dos estados pasan a «Seguimiento»
-- (Cristian, 7 nov: «para llamarlos a todos»). Fuera las fechas: `llamar_en`, `link_enviado_por` y `link_enviado_en`
-- se quedan en la tabla (historial) pero la app deja de usarlos.

alter table public.leads drop constraint leads_estado_caller_check;
alter table public.etapas drop constraint etapas_estado_caller_check;

-- 1) En «Callers», las columnas de los estados que se van se reutilizan (sus tarjetas se mueven solas después)
update public.etapas e set estado_caller = 'llamado', nombre = 'Llamado'
from public.pipelines p where p.id = e.pipeline_id and p.tipo = 'callers' and e.estado_caller = 'no_contesta';
update public.etapas e set estado_caller = 'seguimiento', nombre = 'Seguimiento'
from public.pipelines p where p.id = e.pipeline_id and p.tipo = 'callers' and e.estado_caller = 'link_enviado';
-- En los demás pipelines, una columna unida a un estado que desaparece queda libre (como cualquier otra)
update public.etapas e set estado_caller = null
from public.pipelines p where p.id = e.pipeline_id and p.tipo <> 'callers' and e.estado_caller in ('no_contesta', 'link_enviado');

-- 2) Las columnas que faltan en cada «Callers», y nombre, orden y color de las 12
insert into public.etapas (pipeline_id, nombre, orden, color, estado_caller)
select p.id, x.nombre, x.orden, x.color, x.estado
from public.pipelines p
cross join (values
  ('nuevo', 'Leads', 0, '#64748b'), ('llamado', 'Llamado', 1, '#2b59d1'), ('wsp_enviado', 'Wsp enviado', 2, '#15924a'),
  ('no_responde', 'No responde', 3, '#7c8aa3'), ('no_interesa', 'No interesa', 4, '#d0303f'), ('seguimiento', 'Seguimiento', 5, '#c98a12'),
  ('llamar_luego', 'Llamar luego', 6, '#c46a08'), ('agendado', 'Agendado', 7, '#3f6ee6'), ('confirma_agenda', 'Confirma Agenda', 8, '#0891b2'),
  ('reagendado', 'Reagendado', 9, '#7c4ddb'), ('descartado', 'Descartado', 10, '#7b1a22'), ('vendido', 'Cerrados', 11, '#16a34a')
) as x (estado, nombre, orden, color)
where p.tipo = 'callers'
  and not exists (select 1 from public.etapas e where e.pipeline_id = p.id and e.estado_caller = x.estado);

update public.etapas e set nombre = x.nombre, orden = x.orden, color = x.color
from public.pipelines p,
  (values
    ('nuevo', 'Leads', 0, '#64748b'), ('llamado', 'Llamado', 1, '#2b59d1'), ('wsp_enviado', 'Wsp enviado', 2, '#15924a'),
    ('no_responde', 'No responde', 3, '#7c8aa3'), ('no_interesa', 'No interesa', 4, '#d0303f'), ('seguimiento', 'Seguimiento', 5, '#c98a12'),
    ('llamar_luego', 'Llamar luego', 6, '#c46a08'), ('agendado', 'Agendado', 7, '#3f6ee6'), ('confirma_agenda', 'Confirma Agenda', 8, '#0891b2'),
    ('reagendado', 'Reagendado', 9, '#7c4ddb'), ('descartado', 'Descartado', 10, '#7b1a22'), ('vendido', 'Cerrados', 11, '#16a34a')
  ) as x (estado, nombre, orden, color)
where p.id = e.pipeline_id and p.tipo = 'callers' and e.estado_caller = x.estado;
-- Las columnas libres que alguien añadiera a «Callers», detrás de las 12
update public.etapas e set orden = 100 + e.orden
from public.pipelines p where p.id = e.pipeline_id and p.tipo = 'callers' and e.estado_caller is null and e.orden < 100;

-- 3) Los leads en «No contesta» o «Link enviado» → «Seguimiento» (el trigger los mueve de columna en «Callers»)
update public.leads set estado_caller = 'seguimiento' where estado_caller in ('no_contesta', 'link_enviado');

-- 4) La base solo acepta los 12 estados nuevos
alter table public.leads add constraint leads_estado_caller_check check (estado_caller in (
  'nuevo', 'llamado', 'wsp_enviado', 'no_responde', 'no_interesa', 'seguimiento', 'llamar_luego', 'agendado',
  'confirma_agenda', 'reagendado', 'descartado', 'vendido'));
alter table public.etapas add constraint etapas_estado_caller_check check (estado_caller in (
  'nuevo', 'llamado', 'wsp_enviado', 'no_responde', 'no_interesa', 'seguimiento', 'llamar_luego', 'agendado',
  'confirma_agenda', 'reagendado', 'descartado', 'vendido'));

-- 5) Los proyectos nuevos nacen con las 12 columnas
create or replace function public.crear_pipelines_equipo(p_proyecto uuid) returns void
language plpgsql set search_path = public as $$
declare
  pc uuid;
begin
  if not exists (select 1 from pipelines where proyecto_id = p_proyecto and tipo = 'callers') then
    insert into pipelines (proyecto_id, nombre, orden, tipo) values (p_proyecto, 'Callers', 1000, 'callers') returning id into pc;
    insert into etapas (pipeline_id, nombre, orden, color, estado_caller) values
      (pc, 'Leads', 0, '#64748b', 'nuevo'),
      (pc, 'Llamado', 1, '#2b59d1', 'llamado'),
      (pc, 'Wsp enviado', 2, '#15924a', 'wsp_enviado'),
      (pc, 'No responde', 3, '#7c8aa3', 'no_responde'),
      (pc, 'No interesa', 4, '#d0303f', 'no_interesa'),
      (pc, 'Seguimiento', 5, '#c98a12', 'seguimiento'),
      (pc, 'Llamar luego', 6, '#c46a08', 'llamar_luego'),
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
