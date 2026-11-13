-- Ola 6 (C3): un plazo de una venta no se puede repetir. Dos cargas de Finanzas a la vez creaban el mismo cobro de
-- la membresía dos veces. Se usa (venta_id, numero) y no (venta_id, vence_el): la fecha se puede cambiar a mano y
-- «cambiar forma de pago» puede poner un plazo nuevo el mismo día que uno ya pagado; el número siempre sigue al
-- último. Los deudores puestos a mano (venta_id vacío) no chocan entre sí. En producción, 13 nov: 0 repetidos.
create unique index if not exists vencimientos_venta_numero_unico on public.vencimientos (venta_id, numero);
