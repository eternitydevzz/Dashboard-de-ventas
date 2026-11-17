-- Fase C (Cristian, 17 nov 2026): reporte automático diario. 2 reportes: España a las 21:00 de Madrid y USA a las
-- 21:00 de Nueva York, cada uno con el día de su zona. Se manda por email (y por WhatsApp cuando esté la Fase D).
-- Solo añade: 2 tablas nuevas y un programa del cron. La tabla `reportes` (los rellenados a mano) no se toca.

-- La configuración de cada reporte (Administración → Reporte). Sin fila = la de por defecto (la app la conoce).
create table if not exists public.reporte_config (
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  mercado text not null check (mercado in ('es', 'latam')),
  activo boolean not null default true,
  hora text not null default '21:00' check (hora ~ '^([01][0-9]|2[0-3]):(00|15|30|45)$'),
  emails text[] not null default array['info@eternity.llc'],
  whatsapps text[] not null default '{}',
  partes text[] not null default array['por_persona', 'totales_dia', 'totales_mes', 'va_mal', 'objetivos'],
  actualizado_en timestamptz not null default now(),
  primary key (proyecto_id, mercado)
);
alter table public.reporte_config enable row level security;

-- Una fila por proyecto, reporte y fecha (de su zona): si ya está, la siguiente llamada del cron no manda otro.
create table if not exists public.reporte_envios (
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  mercado text not null check (mercado in ('es', 'latam')),
  fecha date not null,
  creado_en timestamptz not null default now(),
  primary key (proyecto_id, mercado, fecha)
);
alter table public.reporte_envios enable row level security;
-- Sin políticas: solo las lee y escribe el servidor (service_role), como avisos_diario.

-- Solo en la base de la nube (la de Maestria), como el email de las 8:00 (20261109120100_avisos_diario.sql).
-- Cada 15 min, todo el día: la ruta solo manda si el reporte está encendido y en su zona ya es su hora; la fecha
-- guardada evita repetir. Si un intento falla, el siguiente reintenta.
do $$
begin
  if exists (select 1 from public.proyectos where ghl_location_id = 'ZGWJLBH58RJtl2iGhykp') then
    perform cron.schedule(
      'reporte-diario',
      '*/15 * * * *',
      $job$
        select net.http_post(
          url := 'https://dashboard.eternity.llc/api/avisos/reporte/' || p.id,
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-eternity-secreto', p.webhook_secreto),
          body := '{}'::jsonb,
          timeout_milliseconds := 60000
        )
        from public.proyectos p
        where p.ghl_location_id = 'ZGWJLBH58RJtl2iGhykp'
      $job$
    );
  end if;
end $$;
