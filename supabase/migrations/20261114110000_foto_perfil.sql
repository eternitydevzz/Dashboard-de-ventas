-- N3 (Cristian, 13 nov 2026): foto de perfil obligatoria para todos los roles; se ve en todos lados.
-- Solo añade: la app de hoy no lee esta columna. null = sin foto (la app nueva la pide al entrar).

-- La ruta del archivo en el espacio «fotos» (<id de la persona>/<uuid>.jpg)
alter table public.perfiles add column foto text check (foto is null or foto ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$');

-- Espacio privado, como los demás: sin reglas para el navegador, solo la app (clave de servidor) sube y lee.
-- La foto llega ya recortada y reducida (unos 20-40 KB); tope 1 MB y solo JPEG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 1048576, array['image/jpeg'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
