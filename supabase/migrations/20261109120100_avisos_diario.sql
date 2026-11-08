-- Plan GHL F2 (Cristian, 8 nov 2026): email diario del CEO a las 8:00 de Madrid (info@eternity.llc).
-- Una fila por proyecto y fecha (de Madrid): si ya está, la segunda llamada del programador no manda otro email.
create table public.avisos_diario (
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  fecha date not null,
  creado_en timestamptz not null default now(),
  primary key (proyecto_id, fecha)
);
alter table public.avisos_diario enable row level security;

-- Solo en la base de la nube (la de Maestria), como la lectura de GHL (20261017120000_leer_ghl_cada_30s.sql).
-- 06:00 y 07:00 UTC = 8:00 en Madrid en verano y en invierno; la ruta solo manda cuando en Madrid son las 8.
do $$
begin
  if exists (select 1 from public.proyectos where ghl_location_id = 'ZGWJLBH58RJtl2iGhykp') then
    perform cron.schedule(
      'avisos-diario',
      '0 6,7 * * *',
      $job$
        select net.http_post(
          url := 'https://dashboard.eternity.llc/api/avisos/diario/' || p.id,
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
