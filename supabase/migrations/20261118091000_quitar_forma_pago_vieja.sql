-- Fase 8 (Cristian, 14 nov: aprobado quitarla). Quita SOLO la versión vieja de cambiar_forma_pago, la de 5 parámetros
-- (20261115110000_rpc_venta_cobros.sql). La de 6 (con p_fijos, 20261116090000_fase2_seguridad.sql) se queda: es la
-- única que llama la app (ventas/acciones.ts). Comprobado en la base el 14 nov: había las 2.
drop function if exists public.cambiar_forma_pago(uuid, uuid, text, integer, jsonb);
