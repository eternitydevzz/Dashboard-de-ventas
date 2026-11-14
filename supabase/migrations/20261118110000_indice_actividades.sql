-- Velocidad (Cristian, 14 nov, noche: «KPIs sigue tardando muchísimo, arréglalo»). La base de KPIs, Funnel y Por persona
-- lee las actividades que cuentan (llamadas, WhatsApp, botones de resultado y «Agendado»): hoy recorre el índice de
-- `id` y descarta ~8.500 filas por cada 1.000 que sirven (plan medido el 14 nov). Este índice solo tiene esas filas y
-- las columnas que se leen, así que la base no tiene que ir a la tabla. Solo añade.
create index if not exists actividades_cuentan_idx on public.actividades (proyecto_id, id)
  include (lead_id, perfil_id, tipo, resultado, creado_en)
  where tipo in ('llamada', 'whatsapp') or (tipo = 'cambio_etapa' and resultado is not null) or (tipo = 'cita' and resultado = 'agendada');
