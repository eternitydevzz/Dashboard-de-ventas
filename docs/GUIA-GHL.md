# Guía · GoHighLevel y el dashboard

> Reescrita el 9 nov 2026 (A4 del plan GHL). Cómo están conectados hoy GHL y el dashboard (dashboard.eternity.llc). Estado y pendientes: [`plan.md`](plan.md) y [`plan-GHL.md`](plan-GHL.md). Otra guía: [`GUIA-PUBLICAR.md`](GUIA-PUBLICAR.md).
> **Conectar una web:** [`../Team/Template-landing.md`](../Team/Template-landing.md) (manual del equipo, JSON v1 y paso de 1 minuto).

## Cómo funciona (en 3 líneas)
1. **Web → dashboard:** cada web manda su formulario a su **Entrada** del dashboard. El lead se guarda al momento. Sin «Inbound Webhook» de GHL (son de pago).
2. **Dashboard → GHL:** el dashboard escribe en GHL **por la API** (contacto, campos, etiquetas y oportunidades), con «Qué hacer en GHL» de la Entrada o con su workflow.
3. **GHL → dashboard:** el dashboard **lee** de GHL por la API las citas de los calendarios, los leads y las llamadas grabadas.

```
Web ──JSON v1──▶ Entrada ──▶ lead en el dashboard ──(lectura de cada minuto)──▶ GHL por la API
                                                    ◀── citas, leads y llamadas de GHL
```

**La lectura de cada minuto:** el programador de Supabase llama cada 60 s a `/api/ghl/leer/<proyecto>` (migración `20261017190000_leer_ghl_cada_60s`). En cada lectura: manda a GHL los envíos que ya esperaron (como mucho 10 leads por lectura, `src/lib/ghl-envios.ts:37`), avanza los workflows, lee las citas de los calendarios y los leads de GHL.

## Lo que hace falta (una vez por proyecto)
| Qué | Dónde | Para qué |
|---|---|---|
| **Token de GHL** (Private Integration «App Eternity (dashboard)», todos los permisos, decisión de Cristian del 8 nov) y **Location ID** | GHL → Settings → Private Integrations · dashboard → Administración → Integraciones GHL → «Probar conexión» | Leer y escribir en GHL. El token se guarda cifrado y no se vuelve a enseñar |
| **`CLAVE_CIFRADO`** | Vercel → variables (GUIA-PUBLICAR, sección 2) | Cifrar el token. Si cambia, hay que volver a pegar el token |
| **Clave del proyecto** (`x-eternity-secreto`) | Administración → Integraciones → «Copiar clave» | La usan la lectura de cada minuto, el email diario y los workflows antiguos de GHL que mandan citas |

**Maestria:** location `ZGWJLBH58RJtl2iGhykp`; API Version `2021-07-28`. Usuarios de GHL de los closers: Andrés `GFc1HiIWJkr1PlTQOSNn`, Renzo `Dyz4qLnUYxbkfyEJ3srG`, Cristian `DubIbjsps2tK1fhLcgcP`, José `J8xk7z0XlRevokd1bsH8`, Facu `X00AtbvZ2MHqgIj5Ijv3`.

## 1 · Entradas (una por web)
Administración → Entradas. Cada Entrada tiene su dirección secreta, su pipeline del dashboard y su «Qué hacer en GHL»: campos (lo que llega → campo de GHL), hasta 5 pipelines de GHL, etiqueta base (sale `<base>-completo` o `<base>-incompleto`), hasta 10 etiquetas fijas y la espera antes de mandar (0 a 3600 s; 60 por defecto, por si llega el cuestionario después). Todo, en el manual [`Team/Template-landing.md`](../Team/Template-landing.md).

- **«Desde un workflow de GHL»:** una Entrada que recibe de un workflow de GHL **no puede mandar a GHL** (sería un círculo sin fin). Si alguien lo intenta, se bloquea y llega un email a info@eternity.llc. Si un lead vuelve desde GHL menos de 10 min después de escribirlo, también avisa.
- **Si GHL falla:** el envío se reintenta solo (hasta 5 veces, 1 por minuto); después sale en rojo con «Reintentar» y llega un email.

## 2 · Workflows del dashboard
Administración → Workflows. Hacen en GHL lo que hacían los workflows de GHL, sin pagar «Inbound Webhook».
- **De una Entrada:** se crean con «Probar como workflow» en la tarjeta de la Entrada (solo sale con «Mandar a GHL» encendido). Nacen **en prueba**: no tocan GHL, calculan lo mismo que «Qué hacer en GHL» y dicen si coinciden. «Editar» deja añadir ramas (p. ej. por `utm_source`) y pasos.
- **De cita** (agendada o cancelada) **y de etiqueta** («cuando se pone la etiqueta…»): se crean en esta pantalla, en prueba y apagados.
- **Pasar a real:** el workflow manda a GHL y la app apaga sola «Mandar a GHL» de su Entrada. **«Volver a lo de hoy»:** la Entrada vuelve a mandar con «Qué hacer en GHL» y el workflow se para.

## 3 · Etiquetas
Administración → Etiquetas y UTMs → Etiquetas: crear, renombrar, unir o borrar una etiqueta en el dashboard la cambia también en GHL (probado el 9 nov). La casilla «usada por GHL» se marca a mano en las que arrancan algún workflow de GHL. **Antes de cambiar una:** leer el aviso (los emails y SMS de las agendas los manda un workflow de GHL que arranca con la etiqueta: cambiarla puede dejar de mandarlos o mandarlos de más).

## 4 · Citas
- **Por la API (lo normal):** la lectura de cada minuto trae las citas de los calendarios elegidos en el proyecto; el closer sale del usuario de GHL de cada cita. Maestria lee «0. Calendar Principal» `X7qpsbS2ChORZkwO4O3f`, «0. Calendar Tatu» `OpfTegXVjj5r1HgNxiO9`, «Funnel DFY Softwares» `CTsw97wT6aXtUYEQoVeA` y «Funnel DFY Clones» `b1C9gLDbl7EQCyJqEl9X`. También el botón «Sincronizar GHL» de Agendas.
- Mientras una cita está abierta, la hora y el closer de GHL mandan; cuando el closer la cierra en el dashboard, GHL ya no la cambia. Si la cita se borra en GHL, en el dashboard pasa a «cancelada».
- **Webhook antiguo** `/api/webhooks/ghl/<proyecto>` (acción «Webhook» normal de un workflow de GHL, cabecera `x-eternity-secreto`, campo `tipo` = `lead_nuevo`, `cita_agendada` o `cambio_etapa`): sigue funcionando para los workflows de GHL que aún lo usan. Lo nuevo va por Entradas y por la API.

## 5 · Llamadas grabadas
Ventas → Llamadas de GHL → «Traer llamadas de GHL»: trae las contestadas de más de 1 minuto, las transcribe (la transcripción de GHL o Deepgram) y Claude las analiza. Cada persona necesita su **usuario de GHL** en su ficha («GHL y Fathom»). La API de GHL no deja lanzar llamadas: se sigue llamando desde GHL.

## 6 · Avisos
- **Email diario** a info@eternity.llc a las 8:00 de Madrid («Eternity · Resumen del día»), lo lanza el programador de Supabase (`/api/avisos/diario`, migración `20261109120100_avisos_diario`).
- **Reportes de fin de día:** el email lo manda la app con Resend. Por WhatsApp, Administración → Proyecto → «Webhook de avisos» espera un «Inbound Webhook» de GHL (de pago): sin montar en Maestria.

## Si algo falla
| Síntoma | Qué mirar |
|---|---|
| Un lead no llega a GHL | Su Entrada: el envío en rojo dice el motivo. Que «Mandar a GHL» esté encendido o su workflow en real. |
| Un workflow «no coincide» en prueba | Administración → Workflows → su línea: qué lead y qué diferencia (etiqueta, pipeline, campo). |
| No se ven citas nuevas | Administración → Integraciones → «Probar conexión»; que el calendario esté elegido en el proyecto. Tardan hasta 1 min. |
| «Hay que volver a pegar el token de GHL» | Ha cambiado `CLAVE_CIFRADO`: pegar otra vez el token. |
| GHL responde 401/403 | El token ya no vale o le falta un permiso: revisar la integración en Private Integrations y, si hace falta, pegar uno nuevo. |

Fuente de la API: [especificación oficial de GHL](https://github.com/GoHighLevel/highlevel-api-docs).
