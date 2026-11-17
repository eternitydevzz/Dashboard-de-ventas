-- Comisiones pagadas en $ (decisión de Cristian, 17 nov 2026): cada movimiento puede guardar su moneda.
-- null = la moneda del proyecto (así quedan todos los que ya existen y los manuales). Finanzas filtra por moneda
-- (A2-03): un movimiento en USD solo sale en la vista $, igual que las ventas. Solo añade una columna que admite null.
alter table public.movimientos
  add column if not exists moneda text check (moneda in ('USD', 'EUR'));
