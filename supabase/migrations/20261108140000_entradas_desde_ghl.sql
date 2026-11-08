-- Plan GHL, sección 5 · Bloquear el bucle, forma B (Cristian, 8 nov 2026). Sin columnas nuevas.
-- «¿Desde dónde manda los datos?» gana «Desde un workflow de GHL» ('ghl'; null sigue siendo «no lo sé»).
-- Una Entrada que recibe de un workflow de GHL no puede mandar a GHL: el dashboard escribiría en GHL, eso dispara
-- el workflow, que vuelve a mandar el lead aquí… sin fin. La app lo avisa antes; esta regla es la red de la base.
alter table public.entradas drop constraint if exists entradas_envia_desde_check;
alter table public.entradas add constraint entradas_envia_desde_check check (envia_desde in ('navegador', 'servidor', 'ghl'));
alter table public.entradas add constraint entradas_ghl_sin_bucle_check check (envia_desde is distinct from 'ghl' or not ghl_activo);
