# Guía · Conectar GoHighLevel con Eternity

> **Estado y pendientes:** [`plan.md`](plan.md) (1 dónde estamos · 2 plan por fases · 3 decisiones · 4 riesgos). Otra guía: [`GUIA-PUBLICAR.md`](GUIA-PUBLICAR.md).

> Escrita el 9 oct 2026 y puesta al día el 11 oct 2026 (reparto con %, agendar por link de GHL, reporte editable, ficha de cada persona) y el 12 oct 2026 con **cómo quedó montado de verdad en Maestria** (sección siguiente) a partir de la documentación oficial de GHL ([Workflow Action - Custom webhook](https://help.gohighlevel.com/support/solutions/articles/155000003305-workflow-action-webhook)).
> **⚠ comprobar** = cosas que la documentación de GHL no detalla (nombres exactos de algunas variables y disparadores); se eligen en GHL con el selector y se prueban con un lead de prueba.
> Solo funciona **con la app publicada**: GHL no puede llegar a tu ordenador.

---

## Cómo funciona (en 2 líneas)

1. **GHL → Eternity:** cuando pasa algo en GHL (entra un lead, se agenda una cita…), un workflow manda los datos a la app.
2. **Eternity → GHL:** cuando alguien envía su reporte de fin de día, la app manda los datos a GHL y un workflow avisa por email y WhatsApp al director y al CEO.

Todo lo que necesitas copiar está en la app: **Administración → Integraciones GHL** (URL, clave y los 3 cuerpos JSON con botón «Copiar»).

**Desde la v2 hay además:**
3. **Landings → Eternity directo** (Parte 3): cada landing manda su formulario a su propia dirección de la app, sin pasar por un workflow.
4. **Eternity pregunta a GHL por API** (Parte 4): el calendario de cada closer y las llamadas grabadas. Para eso hace falta un **token de integración privada**.

---

## Cómo está montado en Maestria (12 oct 2026, comprobado con GHL real)

**Lo importante:** la acción **«Custom webhook» de GHL es premium** (GHL cobra cada ejecución) y la subcuenta no tiene saldo: GHL la salta con «COMPANY does not have enough funds». Por eso **todo va con la acción «Webhook» normal**, que deja añadir *Custom data* y *Headers* sin ser premium. La app ya entiende lo que manda (todos los campos del contacto por su nombre, y lo de *Custom data* dentro de `customData`).

**Todos los workflows de la app** están en la carpeta **«1. Dashboard ventas»**, numerados, **publicados** (en borrador no se disparan) y acaban con un **Wait de 999 días**:

| Workflow | Disparador | Acción | A dónde va |
|---|---|---|---|
| **0. AP - Biblioteca** | **Opportunity Created · In pipeline is «1. Biblioteca Recursos»** (la crea el workflow de siempre, «AP - Biblioteca de recursos», que no se toca) → **Wait 1 min** (la landing manda primero los datos y después el cuestionario) | Webhook normal con las **6 preguntas en Custom data** (a la izquierda el texto de la pregunta; a la derecha su campo, p. ej. `{{contact.en_qu_situacin_ests_hoy}}`): el Webhook normal no manda los campos personalizados por su cuenta. Sin cabecera. Cambiado el 12 oct | La dirección de la **Entrada «GHL · Biblioteca»** (Administración → Entradas; pipeline Biblioteca Recursos). La dirección ya es secreta: va en la URL. |
| **1. AP - Cita Callers** | Customer booked appointment · In calendar = «#2 Callers - Maestria» | Webhook normal «Cita (app)» | `/api/webhooks/ghl/<id de Maestria>` |
| **2. AP - Cita Closers** | ídem · «#3 Closers - Maestria» | ídem (copia del 1) | ídem |
| **3. AP - Cita Founders** | ídem · «#1 Maestria founders» (el de `codigomaestria.com/agenda`; arreglado el 12 oct: antes vigilaba el de abajo) | ídem (copia del 2) | ídem |
| **4. AP - Cita descubrimiento** | ídem · «#1 Llamada de Descubrimiento \| MaestrIA…» (otro calendario de founders, 12 oct) | ídem (copia del 3) | ídem |

**«Cita (app)»** (Webhook normal, POST): *Custom data* `tipo` = `cita_agendada`, `fecha` = Appointment · Start Date Time, `closer_email` = Appointment · Assigned User · Email; *Headers* `x-eternity-secreto` = la clave de Maestria (Administración → Integraciones → «Copiar clave»; empieza por `704d0dde…`; ojo, la del proyecto «Test» es otra).

**Calendarios (Cristian, 12 oct):** «#2 Callers» y «#3 Closers» = Andrés y Renzo (closers actuales); «#1 Maestria founders» y «#1 Llamada de Descubrimiento | MaestrIA…» = Cristian y José (son **dos calendarios distintos**; la landing de agenda usa «#1 Maestria founders»). En la app, Cristian Ortiz (`cristianortiz@astraire.com`) y José Gómez (`jose@eternity.llc`) son closers de Maestria con su email de GHL.

**La hora de la cita (fallo arreglado el 11 oct, `f16b240`):** GHL manda `calendar.startTime` **sin zona** («2026-10-14T15:30:00», hora de `calendar.selectedTimezone`). La app la lee en esa zona (o en la del proyecto). El `fecha` de *Custom data* llega como texto («Wednesday, October 14, 2026 9:30 PM») y no se usa.

**Lead con cita → «Agendan» del pipeline de su workflow** (13 oct, Cristian): cada workflow de cita de la carpeta «1. Dashboard ventas» («1. AP - Cita Callers», «2. AP - Cita General», «3. AP - Cita IG», «4. AP - Cita YT») manda en el paso «Cita (app)», en **Custom Data**, el campo `pipeline` con el nombre del pipeline de la app: «0. Agendas Callers», «0. Agendas Orgánico», «0. Agendas IG» o «0. Agendas YT». El lead va a la columna «Agendan» de ese pipeline (vale sin el número, sin tildes y sin mayúsculas). Sin ese campo (también en la sincronización de calendarios, el botón), la app pregunta a GHL en qué pipeline tiene el contacto su oportunidad en «Agendan» y la pone en «Agendan» de ese pipeline de la app (necesita el permiso *View Opportunities* de la integración). Si no hay, o GHL falla, va a la columna elegida en el «⋯» de una columna (hoy «0. Agendas Orgánico → Agendan»). Ojo: si el workflow de GHL que mueve la oportunidad a «Agendan» tarda más que el webhook, la app aún no la ve ahí; por eso es mejor poner el campo `pipeline`. Un lead que ya estaba en otro pipeline gana su tarjeta 🔗 allí sin salir del suyo; una cita cancelada no lo mueve.

**Link de agenda de los callers** (`codigomaestria.com/agenda`): lleva a «#1 Maestria founders» (Cristian, 12 oct). La agenda cuenta para quien marcó «Link enviado» (o el caller del lead), sea cual sea el calendario.

**Probado con reservas reales:** «#2 Callers» y «#3 Closers» (hora y closer bien). «#1 founders» sin reserva de prueba: lo cubre la sincronización por API.

**Token (API, 12 oct):** Private Integration **«App Eternity (dashboard)»** (Settings → Private Integrations) (12 oct, con 3 permisos de lectura; hoy tiene todos). Qué usa la app — lectura: calendarios y citas (`calendars.readonly`, `calendars/events.readonly`), contactos (`contacts.readonly`), conversaciones (`conversations/message.readonly`), oportunidades (`opportunities.readonly`), campos (`locations/customFields.readonly`); escritura: `contacts.write`, `opportunities.write`, `calendars/events.write`. La integración «App Eternity (dashboard)» tiene todos los permisos por decisión de Cristian (8 nov 2026). Location ID `ZGWJLBH58RJtl2iGhykp`. El token lo pegó Cristian en Administración → Integraciones GHL, donde están también los ids de GHL de los 4 closers. La sincronización trae las citas de cada closer (30 días atrás y 60 adelante) y la API sí manda la hora con zona. Los callers **no tienen id de GHL** todavía: sin él, «Llamadas de GHL» no les atribuye nada.

**Lo que falta en Maestria** (detalle en el plan, Fase 4): solo la Biblioteca entra sola (Webinar, Orgánico y DFY, sin workflow; se suben con CSV); avisos de reportes por WhatsApp (Parte 2) sin montar; borrar en GHL las citas y contactos de prueba (plan).

---

## Parte 1 · GHL → Eternity (3 workflows)

> Lo de esta parte es el diseño original con «Custom webhook». **En Maestria se usa el Webhook normal** (sección anterior); la tabla de campos y los cuerpos JSON siguen valiendo como referencia de qué entiende la app.

### Configuración común de la acción «Custom Webhook»

En cada workflow, añade la acción **Custom Webhook** con:

| Campo | Valor |
|---|---|
| Event | **CUSTOM** |
| Method | **POST** |
| URL | La de Administración → Integraciones («Copiar URL») |
| Authorization | **No auth** |
| Headers | Nombre `x-eternity-secreto` · Valor: la clave («Copiar clave») |
| Content-Type | `application/json` |
| Raw Body | El JSON del workflow (abajo) |

Por qué la clave va en la cabecera y no en la URL: la propia documentación de GHL recomienda no poner secretos en la dirección.

### Workflow 1 · Lead nuevo

- **Disparador:** «Form Submitted» del formulario de la opt-in (o «Contact Created»). ⚠ comprobar cuál usáis hoy.
- **Raw Body:** el JSON «1 · Lead nuevo» de la app.
- Cambia `"pipeline"` por el pipeline donde debe entrar (como en la app y en GHL: `0. Agendas orgánico`, `1. Biblioteca Recursos`, `2. Webinar 1` o `3. DFY AI Services`; vale también sin el número ni las tildes).
- En `customData` pon **una línea por pregunta del formulario**: a la izquierda el texto de la pregunta (tal cual quieres verlo en la ficha) y a la derecha la variable de ese campo (icono de etiqueta → campo personalizado). Son las respuestas que verán callers y closers.
- **Formulario de la biblioteca** (para que la pestaña KPIs → Biblioteca y la «Oferta» de cada lead salgan bien): usa **exactamente** estos 6 textos a la izquierda (la app también entiende «Situación», «Inversión»… y los campos `quiz_situacion`…, pero así es seguro):
  - `¿En qué situación estás hoy?`
  - `¿Qué experiencia tienes con IA?`
  - `¿Qué quieres lograr en los próximos 90 días?`
  - `¿Cuánto tiempo por semana le puedes dedicar?`
  - `Si encuentras el programa correcto, ¿estás en condiciones de invertir en tu formación?`
  - `¿Cuándo quieres empezar?`
  - Y en `tags` que vaya la etiqueta **«biblioteca recursos»** (o que el pipeline sea «Biblioteca Recursos»).
- Si el **reparto automático** está encendido (Administración → Proyecto y reparto, con el % de cada caller), el lead se asigna solo a un caller según su %; con «solo a quien esté en su horario», entre los que están en su horario en ese momento (si no hay nadie, igual entre todos los que tienen %). Apagado: se reparte a mano o con «Repartir leads».

### Workflow 2 · Cita agendada

- **Disparador:** «Customer Booked Appointment» (o «Appointment Status» = confirmada) del calendario de los closers. ⚠ comprobar.
- **Raw Body:** el JSON «2 · Cita agendada».
- `fecha`: elige con el selector la **fecha y hora de inicio de la cita**. ⚠ comprobar que la variable incluye la hora y la zona; si la cita aparece a otra hora en la app, avísame.
- `closer_email`: elige el **email del usuario asignado a la cita**. Tiene que ser el mismo email con el que el closer entra en la app **y el closer tiene que estar añadido a este proyecto**; si no, la cita llega sin closer y la asigna el director.
- **Cómo encuentra la app al lead de la cita:** por el Contact Id de GHL; si no, por el email; si no trae email, por el **teléfono** (últimas 9 cifras, así «+34 600 111 222» y «600 111 222» son el mismo). Si no existe, lo crea (y lo deja en «Orgánico → Agendados»). Si la cita no trae ninguno de los tres, sale en «Últimos eventos» con el error «no viene email, teléfono ni contacto de GHL».
- **No se duplican citas:** si GHL reenvía la misma cita, se actualiza la que ya existe (por su id de GHL; y si no trae id, por el mismo lead a la misma hora).
- **Agendar por link (11 oct):** este workflow es **el que da la agenda**. El caller ya no agenda en la app: manda al lead el link del calendario de GHL (el que se guarda en Administración → Proyecto y reparto → «Link de agenda») y pulsa **«Link enviado»** con sus estrellas. Cuando el lead reserva, GHL manda la cita aquí: la hora y el closer salen de GHL (el reparto entre closers lo hace el calendario de GHL; la app ya no tiene rotación). La agenda (KPIs, Ranking y comisión) cuenta para quien marcó «Link enviado»; si nadie lo marcó, para el caller del lead. Si a los 2 días no ha llegado la cita, el lead vuelve a la cola del caller. **Sin este workflow, ningún caller suma agendas.**
- **Reagendar (11 oct):** todas las citas se reagendan y se mueven **en la app**, también las que vinieron de GHL (la app es el CRM; GHL solo trae datos). Al reagendar, la cita nueva ya no está unida a GHL: la sincronización no le cambia la hora. ⚠ Los recordatorios que manda GHL al lead siguen con la hora vieja salvo que también se cambie en GHL.

### Workflow 3 · Cambio de etapa (solo si hace falta)

La app es el CRM principal, así que **normalmente no hace falta**. Úsalo solo si alguien sigue moviendo oportunidades en GHL.

- **Disparador:** «Pipeline Stage Changed». ⚠ comprobar.
- **Raw Body:** el JSON «3 · Cambio de etapa».
- `pipeline` y `etapa`: elige con el selector el nombre del pipeline y de la etapa. Tienen que llamarse **igual** que en la app (sin contar el número de delante, las tildes ni las mayúsculas); si no existe esa columna, el evento sale con error en «Últimos eventos» y no se mueve nada. Solo vale para los pipelines de origen (Webinar 1, Biblioteca…): «Callers» y «Closers» se mueven solos por el resultado de la llamada y el estado de la cita.

### Probar cada workflow

1. En GHL, «Test Workflow» con un contacto de prueba (o crea uno).
2. En la app: **Administración → Integraciones → Últimos eventos**:
   - **OK** → llegó y se procesó.
   - **Error** → el mensaje dice qué falta (por ejemplo «La cita no trae fecha»).
   - No aparece nada → revisa la URL y la clave; GHL mostrará el código de respuesta en «Execution Logs» (`401` = clave mal puesta).
3. Busca el lead en el CRM y abre su ficha: deben salir sus respuestas del formulario.

---

## Parte 2 · Eternity → GHL (avisos de los reportes)

1. En GHL, crea un workflow con el disparador **«Inbound Webhook»**. GHL te dará una URL.
2. En la app: **Administración → Proyecto y reparto → «Webhook de avisos»** → pega esa URL → Guardar.
3. Envía un reporte de prueba desde la app (como caller o closer). GHL necesita recibir uno para saber qué campos llegan.
4. En el workflow de GHL añade las acciones de aviso:
   - **WhatsApp** (o «Internal Notification») al director y al CEO. ⚠ comprobar el nombre de la acción en tu cuenta. **El email ya lo manda la app con Resend** (bloque 6, 11 oct): no hace falta añadirlo en GHL (si lo añades, les llegará dos veces).
   - En el cuerpo del mensaje usa el campo **`texto`**: es el reporte entero ya redactado, listo para leer.
5. Envía otro reporte y comprueba que llega el aviso.

**Un reporte por persona y día:** si alguien manda el reporte del mismo día dos veces, el segundo sustituye al primero y **el aviso no se repite**. Para probar el aviso otra vez, usa otra persona u otro día.

**Lo que manda la app en cada reporte:**

| Campo | Qué es |
|---|---|
| `tipo` | `reporte_fin_de_dia` |
| `texto` | El reporte completo en texto (lo más fácil de usar) |
| `persona`, `rol`, `fecha` | Quién, si es caller o closer, y de qué día |
| `respuestas` | Lista de preguntas y respuestas (las preguntas de ahora: se cambian en Administración → Reportes) |
| `tasa_agendamiento`, `tasa_cierre` | Solo en reportes de closer |
| `destinatarios` | Nombre, email y WhatsApp de los directores del proyecto y del CEO (al CEO le llega siempre, aunque no esté añadido al proyecto) |
| `proyecto`, `enviado_en` | Proyecto y hora de envío |

**Importante (no verificado):** hasta donde sé, para mandar un email o WhatsApp desde un workflow, el destinatario tiene que existir como contacto en GHL. Por si acaso, da de alta al director y al CEO como contactos de la cuenta de Maestria. ⚠ comprobar.

---

## Si cambias la clave

Administración → Integraciones → «Nueva clave». Después hay que poner la clave nueva en la cabecera de **los 3 workflows**; hasta entonces, GHL recibirá `401` y no entrará nada. (La app también acepta la clave en la URL, `?secreto=…`, por decisión de Cristian; la cabecera es más segura y es lo recomendado.)

---

## Parte 3 · (v2) Landings → Eternity directo

1. En la app: **Administración → Entradas (landings) → Nueva entrada**: nombre (por ejemplo «Opt-in masterclass»), pipeline y columna donde entran los leads.
2. Copia su **dirección** y pégala en la landing como destino del formulario (el mismo JSON que hoy manda a GHL). Cada landing tiene la suya; si alguien la ve, pulsa «Nueva dirección» y cámbiala en la landing.
3. La app **guarda todo lo que llega** (también UTM, `source`, `event`, `quiz_*`) y lo enseña en la ficha del lead.
4. **Reglas** (opcional): «si el campo X es Y → este pipeline, esta columna y esta etiqueta». Se eligen los campos de los envíos que ya han llegado.
5. Debajo se ven los últimos envíos, con su estado y el JSON entero, para comprobar que todo entra.

## Parte 4 · (v2) Token de GHL: calendario de cada closer y llamadas

### El token

> **Hecho en Maestria el 12 oct:** Private Integration «App Eternity (dashboard)» (entonces con 3 permisos; hoy tiene todos, ver abajo); Location ID `ZGWJLBH58RJtl2iGhykp`; «Probar conexión» correcto. Ids de usuario de GHL de los closers: Andrés `GFc1HiIWJkr1PlTQOSNn`, Renzo `Dyz4qLnUYxbkfyEJ3srG`, Cristian `DubIbjsps2tK1fhLcgcP`, José `J8xk7z0XlRevokd1bsH8`. Con el id de usuario se traen sus citas de **cualquier** calendario. Primera sincronización: 20 citas, **horas correctas** (la API sí manda la zona).

1. En GHL (subcuenta de Maestria): **Settings → Private Integrations → Create** (comprobado: el menú se llama así).
2. Permisos: Qué usa la app — lectura: calendarios y citas (`calendars.readonly`, `calendars/events.readonly`), contactos (`contacts.readonly`), conversaciones (`conversations/message.readonly`), oportunidades (`opportunities.readonly`), campos (`locations/customFields.readonly`); escritura: `contacts.write`, `opportunities.write`, `calendars/events.write`. La integración «App Eternity (dashboard)» tiene todos los permisos por decisión de Cristian (8 nov 2026).
3. En la app: **Administración → Integraciones → Calendario de GHL** → pega el token y el **id de la subcuenta** (Location ID) → Guardar → **Probar conexión**. El token solo se escribe: no se vuelve a enseñar.

### Calendario de cada closer

En la misma pantalla (o en la ficha de cada closer → «GHL y Fathom»), para cada closer: el **id de su calendario** de GHL o su **id de usuario** de GHL. En **Agendas → Llamadas** el botón «Sincronizar GHL» trae sus citas (de hace 30 días a dentro de 60), y también lo hace sola al abrir Agendas si han pasado más de 10 minutos. Las citas que no encuentran su lead salen en «Hay N sin unir → Revisar». Mientras una cita está abierta, la hora y el closer de GHL mandan; una vez terminada en la app (cerrada, no show, perdida…), GHL ya no la cambia. Si se registra una venta antes de la hora de la cita, la cita se cierra con la hora de ese momento.

**Citas borradas en GHL:** si una cita de un closer desaparece de su calendario de GHL (se borró), al sincronizar pasa a **«cancelada»** en la app. Solo se hace con las citas que siguen abiertas (lo que ya registró el closer no se toca), dentro del rango que se consulta y si GHL respondió bien. Cada cancelación queda en el historial del lead y sale en el aviso de la sincronización. ⚠ comprobar con GHL real: según la especificación oficial, la lista de citas no se reparte en páginas; si con GHL real llegara incompleta, se cancelarían citas buenas.

### Llamadas grabadas

1. En **Integraciones → Llamadas de GHL: quién es quién** (o en la ficha de cada persona: pestaña «GHL y Fathom» para callers y closers, «GHL» para directores), pon el **id de usuario de GHL** de cada caller (y de cada director que llame). Los closers lo tienen arriba si usan usuario.
2. En **Ventas → Llamadas de GHL** (desde el 11 oct la ven el CEO, los directores y los 2 perfiles de prueba, closer-test y caller-test; a callers y closers se les abre en Administración → Permisos cuando esté listo), pulsa **«Traer llamadas de GHL»**: trae todas las llamadas **contestadas de más de 1 minuto** (decisión de Cristian), las transcribe (con la transcripción de GHL si la hay; si no, con Deepgram) y Claude las analiza.
3. **Limitación:** la API de GHL **no deja lanzar llamadas** desde la app; se sigue llamando desde GHL.
4. ⚠ comprobar con la primera llamada real que la transcripción de GHL llega bien (la especificación describe cada frase, pero no del todo cómo vienen juntas; la app acepta las dos formas posibles).

Fuente: [especificación oficial de la API de GHL](https://github.com/GoHighLevel/highlevel-api-docs) (`apps/calendars.json`, `apps/contacts.json`, `apps/conversations.json`).

