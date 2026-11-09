# Guía · Publicar y mantener Eternity

> Recortada el 9 nov 2026 (A4 del plan GHL): la puesta en marcha desde cero ya está hecha (oct 2026); aquí queda lo que sigue sirviendo. La versión larga, en `git log -- docs/GUIA-PUBLICAR.md`. Estado y pendientes: [`plan.md`](plan.md). Otra guía: [`GUIA-GHL.md`](GUIA-GHL.md).

## 1 · Dónde está cada cosa
| Servicio | Para qué | Cuenta |
|---|---|---|
| GitHub | El código (`eternitydevzz/Dashboard-de-ventas`, privado). Cada PR pasa los tests (`.github/workflows/tests.yml`) | `eternitydevzz` |
| Vercel | La web: **https://dashboard.eternity.llc**. Cada commit a `main` se publica solo | «Eternity Group» (`info-79696548s-projects`), de pago desde el 6 nov 2026 |
| Supabase | Base de datos, login y el programador (lectura de GHL cada minuto, email diario) | — |
| Resend | Emails desde `no-reply@eternity.llc` (dominio verificado, región North Virginia) | — |
| API de Claude y Deepgram | Analizar y transcribir llamadas (pago por uso) | — |

**Se revisa siempre en dashboard.eternity.llc**, nunca en los previews de Vercel.

## 2 · Variables de entorno (Vercel)
Los nombres están en `.env.example`. Para leer producción desde el Mac: `.env.produccion` (fuera de GitHub; nunca imprimir las claves).

| Variable | Qué es | Si falta |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Dirección de Supabase. Tiene que estar **al compilar** | No se suben PDF ni CSV |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública de Supabase | La app no arranca |
| `SUPABASE_SECRET_KEY` | Clave secreta de Supabase. **Nunca se comparte** | La app no arranca |
| `CLAVE_CIFRADO` | Cifra el token de GHL y las claves de Fathom (`openssl rand -base64 32`). **Guardarla en el gestor de contraseñas** | No se puede guardar el token. Si cambia, hay que volver a pegar el token de GHL y las claves de Fathom |
| `RESEND_API_KEY`, `APP_URL`, `EMAIL_REMITENTE` | Emails (avisos, enlace mágico, email diario) y la dirección de la app en los enlaces | No salen emails |
| `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY` | Análisis y transcripción de llamadas | La app funciona, pero no analiza (avisa en amarillo) |

Después de cambiar una variable: Vercel → Deployments → Redeploy.

## 3 · Cambios en la base de datos
Cada cambio es una migración en `supabase/migrations/`. Para aplicarla en producción (desde la carpeta del repo, con el proyecto enlazado):

```bash
supabase db push --dry-run
```

```bash
supabase db push
```

`--dry-run` enseña qué va a aplicar sin tocar nada. Sin Docker en el Mac: los tests de integración van en GitHub.

## 4 · Scripts útiles (`scripts/`)
Todos simulan primero; con `--confirmar` lo hacen de verdad. Se lanzan con `node --env-file=.env.produccion scripts/<script>`.
- `preparar-proyecto.mjs`: crea un proyecto con sus pipelines, columnas y productos (`proyecto-base.json`).
- `crear-usuarios.mjs <csv>`: crea el equipo desde un CSV (`nombre,email,rol,proyecto` y, opcionales, `telefono`, `admin`). Las contraseñas quedan en `scripts/salida/` (fuera de GitHub): se mandan y se borra el archivo.
- `limpiar-pruebas.mjs`: borra los proyectos de prueba y sus datos. **Leer su cabecera antes**: es para el final y borra mucho.

Subir leads de GHL: CRM → «Subir CSV» (los que ya están se ponen al día sin duplicar).

## 5 · Por persona
- **Fathom de cada closer:** Agendas → Llamadas → 04 Grabaciones → Cuentas → Añadir cuenta (su API key de Fathom y el formato de título) → Probar → Sincronizar.
- **IA:** Agendas → Análisis → Configurar IA (contexto del negocio y agentes).
- **Dar de baja:** solo el CEO desactiva (ficha → «Acceso» → Desactivar); un director puede quitarlo de su proyecto (sus leads quedan sin asignar).

## 6 · Seguridad (lo que depende de nosotros)
- «Allow new users to sign up» **apagado** en Supabase: solo entra quien crea el CEO o un director.
- No compartir nunca `SUPABASE_SECRET_KEY`, `CLAVE_CIFRADO`, el token de GHL ni la clave del proyecto (`x-eternity-secreto`).
- Las direcciones de las Entradas son secretas: si una se filtra, «Cambiar la dirección» en su tarjeta.

Ya hecho en la app: RLS en todas las tablas, permisos por rol, persona y pipeline, límite de intentos en el login y en los webhooks, cabeceras de seguridad, claves cifradas y nunca en el navegador, CSV protegidos contra fórmulas.

## Si algo falla
| Síntoma | Qué mirar |
|---|---|
| La web da error al entrar | Vercel → Deployments → Logs. Suele ser una variable mal copiada. |
| «Email o contraseña incorrectos» con la buena | Que el usuario exista. Un administrador le pone otra en su ficha → «Acceso». |
| No llegan emails | `RESEND_API_KEY` en Vercel y el dominio «Verified» en Resend; cada envío sale en Resend → Logs. |
| Llamadas «En cola» que no avanzan | `ANTHROPIC_API_KEY` (y `DEEPGRAM_API_KEY`) en Vercel; después «Analizar pendientes» o «Reintentar». |
| «Falta la variable CLAVE_CIFRADO» / «Hay que volver a pegar el token» | Ponerla (o pegar otra vez el token o la API key de Fathom) y Redeploy. |
| No se suben PDF o CSV | `NEXT_PUBLIC_SUPABASE_URL` en Vercel al compilar: comprobarla y Redeploy. |
| Algo de GHL | [`GUIA-GHL.md`](GUIA-GHL.md), «Si algo falla». |
