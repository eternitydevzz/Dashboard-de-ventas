-- Cristian, 16 nov 2026 (N1): fuera el estado «No responde» y todo lo unido a su botón. Su proceso: día 1 se llama y,
-- si no responde, se manda WhatsApp; al día siguiente se vuelve a llamar y, si sigue sin responder, «No interesa» o
-- «Descartado». Los leads que están en «No responde» vuelven a «Leads». Las 11 columnas de «Callers» quedan:
--   Leads (nuevo) → Wsp enviado → No interesa → Seguimiento → Llamar luego → Link enviado → Agendado →
--   Confirma Agenda → Reagendado → Descartado → Cerrados (vendido)
-- El historial con «no_responde» (actividades) se queda como está (la app lo sigue leyendo como «No responde»).
-- Mismo patrón que 20261110120000_link_enviado_sin_llamado.sql (sin begin/commit, como todas las migraciones).

alter table public.leads drop constraint leads_estado_caller_check;
alter table public.etapas drop constraint etapas_estado_caller_check;

-- 1) Los leads en «No responde» → «Leads» (el trigger leads_columna_callers los mueve a la columna «Leads»)
update public.leads set estado_caller = 'nuevo' where estado_caller = 'no_responde';

-- 2) Lo que aún apunte a una columna «No responde» de «Callers» pasa a la columna «Leads» de ese pipeline
--    (las FK son «on delete set null»: sin esto, la tarjeta se quedaría sin columna)
update public.leads l set etapa_callers_id = n.id
from public.etapas v join public.pipelines p on p.id = v.pipeline_id and p.tipo = 'callers'
  join public.etapas n on n.pipeline_id = v.pipeline_id and n.estado_caller = 'nuevo'
where v.estado_caller = 'no_responde' and l.etapa_callers_id = v.id;
update public.leads l set etapa_id = n.id
from public.etapas v join public.pipelines p on p.id = v.pipeline_id and p.tipo = 'callers'
  join public.etapas n on n.pipeline_id = v.pipeline_id and n.estado_caller = 'nuevo'
where v.estado_caller = 'no_responde' and l.etapa_id = v.id;
update public.tarjetas_extra t set etapa_id = n.id
from public.etapas v join public.pipelines p on p.id = v.pipeline_id and p.tipo = 'callers'
  join public.etapas n on n.pipeline_id = v.pipeline_id and n.estado_caller = 'nuevo'
where v.estado_caller = 'no_responde' and t.etapa_id = v.id;
update public.entradas x set etapa_id = n.id
from public.etapas v join public.pipelines p on p.id = v.pipeline_id and p.tipo = 'callers'
  join public.etapas n on n.pipeline_id = v.pipeline_id and n.estado_caller = 'nuevo'
where v.estado_caller = 'no_responde' and x.etapa_id = v.id;

-- 3) En otros pipelines, si alguna columna estaba unida a «No responde», queda libre (no se borra)
update public.etapas e set estado_caller = null
from public.pipelines p where p.id = e.pipeline_id and p.tipo <> 'callers' and e.estado_caller = 'no_responde';

-- 4) Fuera la columna «No responde» de «Callers» (proyectos.etapa_citas_ghl y citas.etapa_closers_id: set null)
delete from public.etapas e
using public.pipelines p where p.id = e.pipeline_id and p.tipo = 'callers' and e.estado_caller = 'no_responde';

-- 5) Orden de las 11 que quedan
update public.etapas e set orden = x.orden
from public.pipelines p,
  (values
    ('nuevo', 0), ('wsp_enviado', 1), ('no_interesa', 2), ('seguimiento', 3), ('llamar_luego', 4), ('link_enviado', 5),
    ('agendado', 6), ('confirma_agenda', 7), ('reagendado', 8), ('descartado', 9), ('vendido', 10)
  ) as x (estado, orden)
where p.id = e.pipeline_id and p.tipo = 'callers' and e.estado_caller = x.estado;

-- 6) La base solo acepta los 11 estados
alter table public.leads add constraint leads_estado_caller_check check (estado_caller in (
  'nuevo', 'wsp_enviado', 'no_interesa', 'seguimiento', 'llamar_luego', 'link_enviado', 'agendado',
  'confirma_agenda', 'reagendado', 'descartado', 'vendido'));
alter table public.etapas add constraint etapas_estado_caller_check check (estado_caller in (
  'nuevo', 'wsp_enviado', 'no_interesa', 'seguimiento', 'llamar_luego', 'link_enviado', 'agendado',
  'confirma_agenda', 'reagendado', 'descartado', 'vendido'));

-- 7) Los proyectos nuevos nacen con las 11 columnas (última versión: 20261110120000; «Closers» igual)
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
      (pc, 'No interesa', 2, '#d0303f', 'no_interesa'),
      (pc, 'Seguimiento', 3, '#c98a12', 'seguimiento'),
      (pc, 'Llamar luego', 4, '#c46a08', 'llamar_luego'),
      (pc, 'Link enviado', 5, '#0d9488', 'link_enviado'),
      (pc, 'Agendado', 6, '#3f6ee6', 'agendado'),
      (pc, 'Confirma Agenda', 7, '#0891b2', 'confirma_agenda'),
      (pc, 'Reagendado', 8, '#7c4ddb', 'reagendado'),
      (pc, 'Descartado', 9, '#7b1a22', 'descartado'),
      (pc, 'Cerrados', 10, '#16a34a', 'vendido');
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

-- Permisos de 20261116090000_fase2_seguridad.sql: solo la clave de servicio
revoke execute on function public.crear_pipelines_equipo(uuid) from public, anon, authenticated;
grant execute on function public.crear_pipelines_equipo(uuid) to service_role;
