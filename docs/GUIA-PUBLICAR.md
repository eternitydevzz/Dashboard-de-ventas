# Guía · Publicar Eternity

> **Estado y pendientes:** [`plan.md`](plan.md) (1 dónde estamos · 2 plan por fases · 3 decisiones · 4 riesgos). Otra guía: [`GUIA-GHL.md`](GUIA-GHL.md).

> **6 nov 2026:** la app está en la cuenta de pago de Vercel **«Eternity Group»** (`info-79696548s-projects`). La cuenta gratis la pausó por pasarse del límite y se transfirió el proyecto entero (variables, dominio y GitHub incluidos). Donde esta guía dice «Vercel», es esa cuenta.

> Para Cristian (o el director). Paso a paso, de tu ordenador a una web a la que entra todo el equipo.
> Escrita el 9 oct 2026; puesta al día el 11 oct 2026 con todo el 1.0 hecho (Biblioteca, horarios, reparto, agendar por link de GHL, comisiones por tramos, ficha de cada persona, reporte editable, onboarding de closers). Puesta al día otra vez el 12 oct 2026: **la app ya está publicada** (https://dashboard-de-ventas-iota.vercel.app), Resend verificado y probado (paso 4 bis), equipo y closers creados, leads de la Biblioteca subidos y GHL conectado (GUIA-GHL.md, sección «Cómo está montado en Maestria»). Lo marcado con **⚠ comprobar** no lo he podido ver con tus cuentas: el nombre exacto del botón puede cambiar un poco.

---

## Antes de empezar

**Necesitas:**
- Un email para crear 3 cuentas gratuitas: **GitHub**, **Supabase** y **Vercel**.
- Para la v2 (opcional, se puede añadir después): una cuenta en la **API de Claude** (Anthropic) y otra en **Deepgram**. Son de pago por uso.
- Docker Desktop abierto (para el paso 3 y para pasar los tests de integración en tu Mac; ⚠ desde el 12 oct no se usa: los tests irán en GitHub, ver el plan, Fase 7). **Docker no hace falta para que la app funcione**: la app usa Supabase en la nube. Si `supabase start` falla por `pg_meta`/`studio`, arrancar sin ellos: `supabase start -x studio,postgres-meta,logflare,vector,imgproxy,supavisor`. El 12 oct Docker Desktop se quedó abierto sin responder: se arregló reiniciándolo y, después, `supabase stop` y volver a arrancar.
- El CSV del equipo (paso 6) y una exportación nueva de contactos de GHL (paso 7).

**Qué es cada cosa:**
| Servicio | Para qué | Qué guarda |
|---|---|---|
| GitHub | Guardar el código | El código de la app (sin claves) |
| Supabase | Base de datos y login | Leads, ventas, usuarios… |
| Vercel | Poner la web en internet | Nada propio: lee de Supabase |
| API de Claude (v2) | Analizar llamadas, coach, scoring | Nada: solo procesa lo que se le manda |
| Deepgram (v2) | Pasar a texto las llamadas de GHL que GHL no transcribe | Nada: solo procesa el audio |

**Idea clave:** la versión publicada **empieza limpia**. Los datos de prueba de tu ordenador **no se suben**: en la nube se crea la base de datos vacía, el proyecto Maestria, el equipo real y se suben los leads reales.

---

## Paso 1 · GitHub (guardar el código)

1. Crea una cuenta en github.com.
2. Crea un repositorio **privado** llamado `eternity` (sin README).
3. Pásame la dirección del repositorio y yo subo el código desde tu ordenador (con tu permiso). No se sube ninguna clave: `.env.local` está excluido.

## Paso 2 · Supabase (base de datos)

1. Crea una cuenta en supabase.com y un proyecto nuevo:
   - Nombre: `eternity`
   - Contraseña de la base de datos: una larga; **guárdala en tu gestor de contraseñas**.
   - Región: **East US** (cerca de Nueva York y del equipo). ⚠ comprobar el nombre exacto de la región.
2. **Cierra el registro libre** (muy importante): Authentication → Providers / Sign In → desactiva **«Allow new users to sign up»**. Así solo entra quien crea el CEO o un director desde la app. ⚠ comprobar dónde está el interruptor en tu panel; el nombre sí es ese (documentación oficial de Supabase).
3. Copia estas 3 cosas (Project Settings → API Keys / General) y guárdalas en tu gestor de contraseñas:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **Publishable key** (`sb_publishable_…`)
   - **Secret key** (`sb_secret_…`) → **nunca la compartas**.
   - Y el **Project ref** (el código `xxxx` de la URL).

## Paso 3 · Crear las tablas en la nube

Esto lo hago yo contigo delante (necesita tu contraseña de la base de datos, que escribes tú):

```bash
cd "Proyecto dashboard/app"
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase db push --dry-run
supabase db push
```

- `--dry-run` enseña qué va a crear sin tocar nada; luego `db push` lo crea de verdad (tablas, permisos cerrados y el espacio para los PDF).
- ⚠ comprobar: la Supabase CLI de tu Mac es la 2.90.0; si algún comando cambia, se actualiza con `brew upgrade supabase`.

## Paso 4 · Vercel (poner la web en internet)

1. Crea una cuenta en vercel.com entrando **con tu cuenta de GitHub**.
2. «Add New → Project» → elige el repositorio `eternity`.
3. **Root Directory:** déjalo **vacío** (el repositorio ya empieza en la carpeta `app`; corregido el 11 oct).
4. **Environment Variables:** añade las 3 del paso 2 (los nombres están en `app/.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `CLAVE_CIFRADO`: **nueva y obligatoria** para conectar GHL y Fathom. Genérala en la terminal con `openssl rand -base64 32`, pégala aquí y **guárdala también en tu gestor de contraseñas**: si se pierde o se cambia, hay que volver a pegar el token de GHL y las claves de Fathom. (Con ella se guardan cifrados en la base de datos.)
   - Importante: `NEXT_PUBLIC_SUPABASE_URL` tiene que estar puesta **antes** de pulsar Deploy (la regla de seguridad que deja subir PDF y CSV a Supabase se escribe al compilar).
   - (v2) `ANTHROPIC_API_KEY`: la clave de la API de Claude. Sin ella, la app funciona pero no analiza llamadas ni responde el coach (avisa en amarillo).
   - (v2) `DEEPGRAM_API_KEY`: la clave de Deepgram. Sin ella, solo se analizan las llamadas de GHL que GHL ya haya transcrito.
5. Pulsa **Deploy**. En unos minutos tendrás una dirección tipo `eternity-xxxx.vercel.app`.
6. Recomendado: en Settings → Functions, región **Washington, D.C. (iad1)** para que esté junto a Supabase. ⚠ comprobar.

## Paso 4 bis · Emails con Resend (bloque 6, 11 oct 2026)

La app manda 2 emails: el **aviso de cada reporte** (al CEO y a los directores) y el **enlace mágico** que un administrador manda desde la ficha de una persona (para entrar sin contraseña; caduca en 1 hora). Los manda la propia app con Resend, desde `Eternity <no-reply@eternity.llc>`; no se toca el correo de Supabase.

1. **Dominio en Resend:** resend.com → Domains → Add domain → `eternity.llc`, región **North Virginia**. «Auto configure» con GoDaddy añade 3 registros: `send` y `rsend` (CNAME) y `resend._domainkey` (TXT, DKIM). El correo de Google Workspace (MX y SPF de la raíz) no se toca. Después, «Verify DNS Records» y esperar a «Verified» (puede tardar de minutos a horas).
2. **Clave:** Resend → API Keys → Create → permiso «Sending access» y dominio `eternity.llc`. Se copia una sola vez.
3. **Vercel → Environment Variables:** `RESEND_API_KEY` (tipo Secret, la clave) y `APP_URL` = `https://dashboard-de-ventas-iota.vercel.app` (tipo Config). Después, volver a publicar (Deployments → Redeploy, o subir un cambio).
4. **Probar:** en la app, Equipo → ficha de alguien → «Enviar enlace mágico»; y mandar un reporte de prueba (le llega el email al CEO y a los directores).

**Si algo falla:** el aviso del botón dice el motivo que da Resend (por ejemplo, dominio sin verificar). En Resend → Logs se ve cada envío.

## Paso 5 · Preparar el proyecto Maestria

Crea el proyecto con sus 4 pipelines de origen, sus columnas y sus productos (los de `app/scripts/proyecto-base.json`); la base añade sola los pipelines del equipo «Callers» y «Closers»:

```bash
cd "Proyecto dashboard/app"
node --env-file=.env.produccion scripts/preparar-proyecto.mjs
node --env-file=.env.produccion scripts/preparar-proyecto.mjs --confirmar
```

- `.env.produccion` es un archivo que creas tú (copia de `.env.example` con las claves de la nube). Está excluido de GitHub.
- La primera orden solo **simula**; la segunda lo crea.
- Las columnas de ahora valen (se cambian luego en el CRM). El producto de empresas va con precio personalizado.

## Paso 6 · Crear el equipo real

1. **El CSV del equipo ya está hecho:** `app/scripts/salida/equipo.csv` (10 personas; excluido de GitHub). Columnas: `nombre,email,rol,proyecto` y, opcionales, `telefono` y `admin` (`si` = director con Administración).

2. Simula y crea:

```bash
node --env-file=.env.produccion scripts/crear-usuarios.mjs scripts/salida/equipo.csv
node --env-file=.env.produccion scripts/crear-usuarios.mjs scripts/salida/equipo.csv --confirmar
```

3. Cada uno recibe una contraseña **«Maestria-» + 8 caracteres al azar**, guardada solo en `app/scripts/salida/usuarios-creados-….csv` (excluido de GitHub). **Cristian se las manda por WhatsApp** y después se borra ese archivo.
4. La primera vez que cada uno entra, hace el onboarding: nombre, teléfono y WhatsApp, y los callers y closers, también su horario (es obligatorio).
5. Juan y Junior quedan como directores **con Administración** (columna `admin`).
6. Los 2 perfiles de prueba (closer-test y caller-test) se crean igual con `scripts/salida/prueba.csv` (columnas `password` y `prueba`): no cuentan en cifras, reparto ni liquidaciones, no salen en Equipo y son los únicos callers y closers que ven «Llamadas de GHL».

## Paso 7 · Subir los leads reales

1. En GHL, exporta los contactos de nuevo (para que estén al día).
2. Entra en la app como CEO → CRM → **Subir CSV** (o KPIs → **Biblioteca** → «Actualizar con CSV») → revisa qué es cada columna → elige el pipeline → Importar. Los que ya están se ponen al día (respuestas nuevas y su «Oferta») sin duplicar; al acabar dice cuántos son nuevos, actualizados y cuántos cambian de oferta.
3. El CSV de la biblioteca del 10 oct (1.005 personas) está en `app/scripts/salida/biblioteca-10oct.csv` (fuera de GitHub: lleva datos personales).
4. **Hecho el 12 oct:** Biblioteca → 1.158 leads en «Biblioteca Recursos» (1.154 con las 6 respuestas). Webinar 1 → solo 8 nuevos.
5. ⚠ **Hoy un lead está en un solo pipeline:** si el CSV trae a alguien que ya existe (mismo email), se pone al día (suma etiquetas y respuestas) pero **se queda en su primer pipeline**. Por eso, de 107 leads con etiqueta de webinar, 100 siguen en Biblioteca. Pendiente (Cristian, 12 oct): que un lead pueda estar en varios pipelines para ver los números de cada fuente (plan, Fase 4: una tarjeta por pipeline). La subida tampoco trae la etapa de GHL: todos entran en la primera columna.

## Paso 8 · Conectar GHL

Sigue **GUIA-GHL.md**: los webhooks de entrada (lead, cita, etapa), las entradas directas de las landings, el calendario de cada closer y las llamadas por API, y el workflow de avisos de los reportes.

## Paso 8 bis · (v2) Fathom de cada closer

Cada closer, en **Agendas → Llamadas → 04 Grabaciones → Cuentas → Añadir cuenta** (o un administrador, en la ficha del closer → «GHL y Fathom»): un nombre, su **API key de Fathom** (en Fathom: Settings → API Access) y el formato de título de sus reuniones (por ejemplo `{nombre cliente}: Sesión…`). Pulsa **Probar** y después **Sincronizar Fathom**.

## Paso 8 ter · (v2) Configurar la IA

Como CEO o director, en **Agendas → Análisis → Configurar IA**: el contexto del negocio (qué vendéis, a quién, objeciones típicas) y los agentes que quieres. Sin esto la IA también funciona, pero analiza peor.

## Paso 9 · Comprobar que todo va

- [ ] Entras como CEO y ves Maestria con sus 4 pipelines, «Callers», «Closers» y sus productos.
- [ ] Un caller entra, hace el onboarding (con su horario: Mañana, Tarde, Todo el día o el suyo) y ve sus leads; un closer pone su horario para recibir llamadas. Los dos lo cambian en «Mi perfil» (tocando su nombre, abajo a la izquierda).
- [ ] Administración → Proyecto y reparto: los directores ponen el % de cada caller (suman 100) y encienden el reparto automático; un lead de prueba de GHL entra asignado y en su historial pone «reparto automático (%)».
- [x] Un lead de GHL llega solo (Administración → Integraciones → «Últimos eventos»): comprobado el 11-12 oct con leads reales de la Biblioteca.
- [x] Un reporte de fin de día manda el aviso por email (comprobado el 11 oct, con el diseño glass). WhatsApp por GHL: sin montar.
- [ ] Desde el móvil se ve bien.
- [ ] (v2) Una grabación de Fathom se une sola a su cita y, al rato, sale analizada en Agendas → Análisis.
- [ ] (v2) «Traer llamadas de GHL» trae llamadas y salen transcritas y analizadas.
- [ ] (v2) El coach responde («Coach IA» en la ficha de un lead).
- [ ] (v2) Finanzas: una venta en cuotas aparece en «Pagos pendientes».
- [x] KPIs → Biblioteca: con los datos reales del 12 oct salen 1.158 personas y la escalera (Membresía 737, Grupal 269, VIP 108, DFY 70).
- [ ] Una venta de Membresía deja en «Pagos pendientes» el cobro del mes siguiente; «Dar de baja» (en Ventas) lo quita.
- [ ] Administración → Proyecto y reparto: el «Link de agenda» (el calendario de GHL). Un caller pulsa «Link enviado» en un lead: pide estrellas, abre WhatsApp con el link y el lead pasa a la columna «Link enviado» de «Callers».
- [ ] La ficha de cada persona (Empresa → Equipo o Administración → Equipo → «Ficha»): datos y comisión, acceso (email, contraseña, rol), permisos de secciones y pipelines, horario y su % de reparto (callers), GHL y Fathom.
- [ ] Administración → Reportes: las preguntas del reporte de callers y closers (o las de siempre). Un closer ve «Onboarding» en su menú con sus clientes; los puntos se cambian en «Onboarding closers».
- [ ] Links y recursos: cada producto con su link de dossier (se pone en Programas) encima del link de pago.
- [ ] Administración → Comisiones: los tramos de callers y closers (en dólares); en Equipo, quién va por tramos y quién con su % propio; en Programas, la Membresía sin «Cuenta para comisión»; Finanzas → Liquidaciones enseña el tramo de cada persona.

## Paso 10 · (Opcional) Dominio propio

En Vercel → Settings → Domains → añade, por ejemplo, `ventas.tudominio.com` y sigue las instrucciones para el DNS de tu dominio. Después, actualiza la URL en los workflows de GHL.

---

## Seguridad: lo que ya está hecho y lo que depende de ti

**Ya hecho en la app:** la base de datos no se puede leer con la clave pública (las 43 tablas con RLS); cada acción comprueba el rol o el permiso de la sección; límite de intentos en el login y en el webhook, contado en la base de datos (exacto aunque Vercel use varias copias del servidor); cabeceras de seguridad, con nonce por petición para los scripts; el token de GHL y las API keys de Fathom se guardan cifrados (`CLAVE_CIFRADO`); los PDF y CSV se suben directos a Supabase (Vercel no deja pasar más de 4,5 MB); los PDF solo se abren con enlace temporal; las claves de GHL, Fathom, Claude y Deepgram nunca llegan al navegador; a Claude no se le mandan emails ni teléfonos de los leads; los CSV que se exportan están protegidos contra fórmulas de Excel; permisos de cada sección por rol y por persona (Administración → Permisos); permisos de cada pipeline del CRM (como GHL); 420+ tests automáticos.

**Depende de ti:**
- Desactivar «Allow new users to sign up» en Supabase (paso 2).
- No compartir nunca la **Secret key** ni la clave del webhook.
- Dar de baja a quien deje el equipo: **solo el CEO** puede desactivar (en su ficha → «Acceso» → Desactivar), porque afecta a todos los proyectos; un director puede quitarlo de su proyecto (sus leads quedan sin asignar).
- Guardar `CLAVE_CIFRADO` en el gestor de contraseñas (paso 4).
- ⚠ comprobar en tu plan de Supabase cómo funcionan las **copias de seguridad** y si el proyecto gratuito se pausa por inactividad; con uso diario no debería pasar, pero no lo he verificado.

**Limitaciones conocidas:**
- (v2) El análisis con IA y las transcripciones se hacen en segundo plano, **4 llamadas por vez** (en Vercel una función dura como mucho 300 s en el plan gratuito; documentación oficial de Vercel, «Configuring Maximum Duration»). Si hay muchas, se van haciendo en las siguientes sincronizaciones o con «Analizar pendientes».
- (v2) Gasto de Claude y Deepgram: lo marca su uso. Mira el consumo en sus paneles los primeros días. ⚠ No medido con llamadas reales.

## Si algo falla

| Síntoma | Qué mirar |
|---|---|
| La web da error al entrar | Vercel → Deployments → Logs. Suele ser una variable mal copiada. |
| «Email o contraseña incorrectos» con la contraseña buena | Que el usuario exista (paso 6). Un administrador puede ponerle otra contraseña en su ficha (Administración → Equipo → «Ficha» → «Acceso»). |
| GHL no crea leads | Administración → Integraciones → «Últimos eventos». Si sale error, el mensaje dice qué falta. Que el workflow de GHL esté **publicado** (en borrador no se dispara). Si en «Execution logs» de GHL sale «not enough funds», es una acción premium («Custom webhook»): usar el «Webhook» normal (GUIA-GHL.md). |
| Una cita sale a otra hora | GHL manda la hora sin zona; la app la lee en la zona del calendario (arreglado el 11 oct). Si vuelve a pasar, mirar `calendar.startTime` y `selectedTimezone` en el evento de «Últimos eventos». |
| No llegan avisos de reportes | Por email (Resend): que `RESEND_API_KEY` esté en Vercel y el dominio siga «Verified» en Resend; mirar «Emails» en el panel de Resend. Por WhatsApp (sin montar en Maestria): Administración → Proyecto → «Webhook de avisos» y el workflow de GHL (GUIA-GHL.md, Parte 2). |
| (v2) Llamadas «En cola» que no avanzan | Que estén `ANTHROPIC_API_KEY` (y `DEEPGRAM_API_KEY`) en Vercel; después «Analizar pendientes» o «Reintentar». El motivo sale en cada llamada. |
| (v2) «Fathom no acepta la API key» | La clave de esa cuenta: Cuentas → Editar → pegarla otra vez. |
| (v2) «GHL no deja leer las llamadas» | Al token de GHL le falta el permiso `conversations/message.readonly` (GUIA-GHL.md, Parte 4). |
| «Falta la variable CLAVE_CIFRADO» al guardar el token de GHL o una cuenta de Fathom | Ponerla en Vercel (paso 4) y volver a desplegar (Deployments → Redeploy). |
| «Hay que volver a pegar el token de GHL / la API key de Fathom» | `CLAVE_CIFRADO` ha cambiado (o la clave se guardó antes de cifrar): pegar otra vez el token o la API key. |
| No se pueden subir PDF (Links y recursos) o CSV (CRM) | `NEXT_PUBLIC_SUPABASE_URL` tiene que estar en Vercel **al compilar**: comprobarla y volver a desplegar. |

Fuentes consultadas: [Supabase · General configuration](https://supabase.com/docs/guides/auth/general-configuration) · [Vercel · Configuring Maximum Duration](https://vercel.com/docs/functions/configuring-functions/duration) · [Fathom · List meetings](https://developers.fathom.ai/api-reference/meetings/list-meetings) · [Deepgram · Pre-recorded audio](https://developers.deepgram.com/docs/pre-recorded-audio).
