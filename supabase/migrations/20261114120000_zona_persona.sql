-- N2 (Cristian, 13 nov 2026): cada caller y closer elige en qué zona ve las horas. El proyecto sigue en su zona
-- (Nueva York): cifras y KPIs no cambian. Solo añade una columna; null = sin elegir (la app nueva lo pregunta).
alter table public.perfiles add column zona_horaria text check (zona_horaria in (
  'America/Bogota', 'America/Mexico_City', 'America/Chicago', 'America/New_York',
  'America/Argentina/Buenos_Aires', 'Europe/Madrid'
));
