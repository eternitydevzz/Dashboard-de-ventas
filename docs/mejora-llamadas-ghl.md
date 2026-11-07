# Mejora · Menos llamadas a GHL por lead

> Creado el 7 nov 2026 a petición de Cristian. **Hecho el 7 nov** (Cristian: «haz tú todo»): una sola búsqueda de oportunidades por contacto cuando tiene 2 o más pipelines, y las columnas de GHL una vez por vuelta (envíos de las Entradas y workflows en real). `MAX_LEADS_POR_LECTURA` sigue en 10: volver a 15 lo decide Cristian.

## Qué pasa hoy
- Cada 60 s, el dashboard manda a GHL los leads cuya espera (5 min) ya terminó. Lo hace `src/lib/ghl-envios.ts`.
- GHL deja hacer como mucho **100 llamadas cada 10 segundos**. Si te pasas, devuelve error y el envío se reintenta.
- Desde B (7 nov), la agenda de la Biblioteca crea oportunidad en 2 pipelines y busca la primera columna en GHL. Por eso un lead hace **hasta 8 llamadas** (antes 4).
- Para no pasar del límite, Claude bajó de **15 a 10** los leads por vuelta (`MAX_LEADS_POR_LECTURA`). 10 × 8 = 80 llamadas. Ese cambio no estaba en el plan; está en «Para decidir» de `docs/plan-GHL.md`.

## Por qué no se puede hacer 1 sola llamada por lead
- **Las etiquetas van aparte.** El upsert de contactos (`POST /contacts/upsert`) tiene un campo `tags`, pero si se usa **borra todas las etiquetas** que ya tiene el contacto (especificación oficial de GHL, ver «Datos que hacen falta» en `docs/plan-GHL.md`). Por eso se ponen con `POST /contacts/{id}/tags`.
- **Las oportunidades van aparte.** Se crean de una en una con `POST /opportunities/`. El upsert de oportunidades no lleva el contacto (`contactId`); por eso Cristian decidió no usarlo (6 nov).

## Lo que sí se puede juntar

| Llamada | Hoy | Juntando |
|---|---|---|
| Crear o actualizar el contacto | 1 | 1 |
| Poner etiquetas (todas a la vez) | 1 | 1 |
| Quitar `-incompleto` (solo si la tiene) | 0–1 | 0–1 |
| Leer las columnas de GHL (`GET /opportunities/pipelines`) | 1 por lead | **1 por vuelta**, para todos los leads |
| Buscar sus oportunidades (`GET /opportunities/search`) | 1 por pipeline (2) | **1 sola**, buscando por contacto sin pipeline. Así lo hace ya `pipelinesAgendanGhl` en `src/lib/ghl.ts` |
| Crear las oportunidades que falten (`POST /opportunities/`) | 0–2 | 0–2 |
| **Total por lead** | **hasta 8** | **3 a 5** (3 si ya tiene las oportunidades) |

Con 5 llamadas por lead, 15 leads por vuelta son 75 llamadas, por debajo de 100: **se podría volver a 15 leads por vuelta**.

## Pendiente de revisar en GHL
- [x] **¿Se pueden crear varias oportunidades en una sola llamada?** **No** (comprobado el 7 nov en `apps/opportunities.json`, rama main): solo hay `POST /opportunities/` (una) y `POST /opportunities/upsert` (una, sin contacto). Tampoco hay acción en bloque.

## Cómo se haría (cuando Cristian lo decida)
1. Tests primero (`tests/integracion/entrada.test.ts`): contar las llamadas al GHL falso por lead (pipelines una vez por vuelta y una sola búsqueda de oportunidades).
2. Código en `src/lib/ghl-envios.ts` y `src/lib/ghl.ts`.
3. Decidir con Cristian si `MAX_LEADS_POR_LECTURA` vuelve a 15.
4. PR, tests de GitHub en verde y publicar.
