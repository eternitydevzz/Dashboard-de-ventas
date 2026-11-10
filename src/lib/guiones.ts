// Fase 6 · Guion de llamadas (Cristian, 12 oct 2026): un guion para el caller y otro para el closer, por pasos,
// cada paso con su checklist y sus pistas, y una lista de objeciones con su respuesta. Lo editan el CEO y los
// directores; mientras no pongan el suyo, sale este de ejemplo. Sin base de datos: se prueba con tests.

export type RolGuion = "caller" | "closer";
export type PasoGuion = { id: string; titulo: string; texto: string; checklist: string[]; pistas: string[] };
export type Objecion = { id: string; objecion: string; respuesta: string };
export type Guion = { pasos: PasoGuion[]; objeciones: Objecion[] };
// Lo que marcó una persona en una llamada: por paso, los índices de su checklist marcados
export type Marcas = Record<string, number[]>;

export const LIMITES = { pasos: 15, checklist: 10, pistas: 8, objeciones: 30, texto: 1500, linea: 200 };

const id = (prefijo: string, i: number) => `${prefijo}${i + 1}`;

// Guiones de ejemplo (Cristian, 12 oct: «exacto, ponlo así»; los reales los carga él después)
export const GUION_EJEMPLO: Record<RolGuion, Guion> = {
  // Guion de la academia de IA (Cristian, 10 nov 2026). Las ramas «Si pregunta / Si dice…» van en objeciones.
  caller: {
    pasos: [
      { id: "p1", titulo: "Abrir la llamada", texto: `Paso 1
"¿{nombre}?"
Si hay silencio 2 segundos: "¿{nombre}?"

Paso 2
{nombre}: "Sí… ¿quién es?"
"Soy Carlos."
(Silencio. Esperas a que pregunte quién.)

Paso 3
{nombre}: "¿Qué Carlos?"
"Carlos, de la academia de inteligencia artificial. Rellenaste un formulario para aprender de IA y generar ingresos. Cuéntame (o decime), ¿usas ChatGPT, Claude o Gemini?"`, checklist: ["Dije su nombre y esperé a que preguntara quién soy", "Le pregunté qué IA usa: ChatGPT, Claude o Gemini"], pistas: [] },
      { id: "p2", titulo: "Cualificar", texto: `"Entiendo. ¿Y hace mucho que usas [la IA que te diga]?"
"¿Y qué es lo que te gustaría aprender? ¿Qué es lo que te llama la atención de la IA?"
Si no sabe qué decir: "La mayoría viene por tres cosas: un dinero extra, dejar su trabajo o montar su propio negocio con IA. ¿Cuál es la tuya?"
"¿Y a qué te dedicas ahora mismo? ¿Más o menos cuánto sacas al mes con eso?"
Si vive en EE. UU.: "¿Cuánto te entra a la semana?"`, checklist: ["Sé qué IA usa y desde cuándo", "Sé qué quiere conseguir con la IA", "Sé a qué se dedica y cuánto gana"], pistas: [] },
      { id: "p3", titulo: "El dolor", texto: `"¿Qué no te gusta de tu situación ahora mismo?"
"¿Ganar más para qué? ¿Qué cambiaría en tu vida si ganaras más?"
"¿Y cuánto tiempo llevas así?"
"¿Ya probaste otros métodos?"`, checklist: ["Sé qué no le gusta de su situación", "Sé para qué quiere ganar más", "Sé cuánto tiempo lleva así y qué ha probado"], pistas: [] },
      { id: "p4", titulo: "La oportunidad", texto: `Si ya probó otro método: "¿Sabes por qué creo que no te funcionó [Amazon o lo que probó]? Porque llegaste tarde. Quien entró en Amazon hace diez años ganó; quien entra hoy se encuentra un mercado saturado. Con la IA todavía estás a tiempo, porque todo el mundo habla de IA, pero ¿cuántas personas conoces que hagan dinero con ella?"
"¿Sabes por qué? Porque la gente la usa mal. Si usas la IA, tienes dos caminos. El primero: usarla para hacer videítos graciosos. Y el segundo: usar la mejor herramienta de la historia para hacer dinero. ¿A ti cuál te gusta más?"`, checklist: ["Si probó otro método, le expliqué por qué no le funcionó", "Eligió el segundo camino: hacer dinero con IA"], pistas: [] },
      { id: "p5", titulo: "El filtro · Tiempo y dinero", texto: `"Perfecto. Para el segundo camino, hacer dinero con IA, hay que dedicarle tiempo. ¿Cuántas horas podrías dedicarle al día?"
"Para poder [deseo 1], [deseo 2] y [deseo 3] tienes que invertir para crear tu agencia de IA, ¿me entiendes?"
"¿Cuánto podrías invertir para [deseo 1], [deseo 2] y [deseo 3] gracias a la inteligencia artificial?"
• 200 $ o más → se agenda.
• Menos de 200 $ → Membresía.`, checklist: ["Sé cuántas horas al día puede dedicarle", "Sé cuánto puede invertir", "Decidí: se agenda (200 $ o más) o Membresía"], pistas: [] },
      { id: "p6", titulo: "Agendar · La cita", texto: `"Perfecto, pues por lo que me has contado, creo que encajas dentro de nuestra academia. Pero es importante que sepas que esto no es un curso: nosotros te damos los sistemas listos para copiar, pegar y vender. ¿Te hace sentido?"
"Nosotros te enseñamos cómo configurarlos y cómo venderlos. ¿Qué te parece?"
"Perfecto, pues ahí te envío el link para que puedas agendar tu sesión estratégica con nuestro equipo especialista en IA, para que evalúen tu caso y veamos si podemos colaborar juntos. Revisa tu WhatsApp."
(Le envías el link.)`, checklist: ["Le expliqué que no es un curso: son sistemas listos", "Le mandé el link para agendar por WhatsApp"], pistas: [] },
      { id: "p7", titulo: "Confirmar si viene con su pareja", texto: `"En caso de que el equipo vea que podemos trabajar juntos, la decisión de inversión, ¿la tomas solo tú o se lo tendrías que consultar a tu pareja?"
Si dice que lo consultaría: "Perfecto. ¿Y ella podría estar también en la reunión? Porque al ser una decisión que podría [deseo 1], [deseo 2] y [deseo 3], sería importante que ella estuviera, ¿sí?"`, checklist: ["Sé si decide solo o con su pareja", "Si lo consulta con su pareja, le pedí que venga a la reunión"], pistas: [] },
      { id: "p8", titulo: "Blindar la cita", texto: `"¿Me puedes enviar una captura por WhatsApp cuando agendes la llamada, para asegurar que todo esté correcto en nuestro sistema?"
Cuando envíe la captura: "Perfecto, pues un placer, {nombre}. Ya nuestro equipo confirmó tu llamada, nos vemos el [día]. Antes de la llamada te mando dos vídeos cortos para que veas cómo es por dentro nuestro sistema, ¿ok?"
"Perfecto, {nombre}. ¡Buen día!"`, checklist: ["Me mandó la captura de la cita agendada", "Le avisé de los dos vídeos antes de la llamada"], pistas: [] },
    ],
    objeciones: [
      { id: "o1", objecion: "¿De dónde sacaste mi número?", respuesta: `"Lo dejaste tú en nuestro formulario, junto con tu email. Eres [nombre y apellidos], ¿cierto?"
Cuando diga que sí: "¿Sigues interesado en aprender a usar la IA para hacer dinero?"` },
      { id: "o2", objecion: "Ahora no puedo / estoy ocupado", respuesta: `"Te entiendo, {nombre}, pero una sola pregunta: ¿sigues queriendo aprender a ganar dinero con IA, o ya no?"
• Sí → "Perfecto. ¿Y qué IA sueles usar, ChatGPT, Claude o Gemini?"
• No → "Perfecto. Entonces, ¿no crees que la IA sea la herramienta más poderosa de la historia para generar ingresos?"` },
      { id: "o3", objecion: "De verdad no puede ahora", respuesta: `"Perfecto, {nombre}. ¿A qué hora te viene bien que te llame?"
Si dice "no sé": "¿Te queda bien a las [hora]?"
"Perfecto, a esa hora te llamo entonces. ¡Buen día!"` },
      { id: "o4", objecion: "No me interesa", respuesta: `"{nombre}, ¿no te interesa aprender a usar la IA para hacer dinero?"
• Sí → "Perfecto. ¿Y qué IA sueles usar, ChatGPT, Claude o Gemini?"
• No → "Perfecto. Entonces, ¿no crees que la IA sea la herramienta más poderosa de la historia para generar ingresos?"` },
      { id: "o5", objecion: "¿Qué sistemas?", respuesta: `"Bueno, tenemos un sistema que crea páginas web en 30 minutos. Tenemos un sistema que envía miles de emails al día para conseguir clientes. Tenemos un sistema que automatiza las conversaciones de WhatsApp para las empresas, y tenemos un montón de sistemas para poder vendérselos a los empresarios por miles de dólares. ¿Te hace sentido?"` },
    ],
  },
  closer: {
    pasos: [
      { id: "p1", titulo: "Conexión", texto: "Hola {nombre}, gracias por venir. Antes de nada, ¿cómo estás y desde dónde nos conectas?", checklist: ["Rompí el hielo", "Expliqué cómo va la llamada"], pistas: ["Lee la nota del caller y sus estrellas antes de empezar"] },
      { id: "p2", titulo: "Diagnóstico", texto: "Cuéntame tu situación ahora mismo y qué has probado hasta hoy.", checklist: ["Situación actual", "Lo que ha probado", "Por qué ahora"], pistas: ["Pregunta, no vendas todavía"] },
      { id: "p3", titulo: "Objetivo y coste de no actuar", texto: "¿Dónde quieres estar en 12 meses? ¿Qué pasa si sigues igual?", checklist: ["Objetivo con cifra", "Coste de no hacer nada"], pistas: ["Deja silencios: que lo piense"] },
      { id: "p4", titulo: "Presentación", texto: "Te cuento cómo lo hacemos y qué resultados tienen otros como tú.", checklist: ["Expliqué el programa", "Conté un caso parecido"], pistas: ["Conecta cada parte con su objetivo"] },
      { id: "p5", titulo: "Cierre", texto: "¿Ves que esto te lleva a tu objetivo? La inversión es {precio}. ¿Cómo prefieres hacerlo?", checklist: ["Di el precio", "Pregunté por la forma de pago", "Registré el resultado"], pistas: ["Tras decir el precio, calla", "Usa los links de pago de Programas"] },
    ],
    objeciones: [
      { id: "o1", objecion: "Es caro", respuesta: "Entiendo. Comparado con seguir igual 12 meses más, ¿cuánto te cuesta no hacerlo? Además hay pago en cuotas." },
      { id: "o2", objecion: "Lo tengo que hablar con mi pareja", respuesta: "Me parece bien. Si fuera solo tu decisión, ¿lo harías? ¿Qué crees que te va a preguntar?" },
      { id: "o3", objecion: "No es el momento", respuesta: "¿Qué tendría que pasar para que sea el momento? Lo que me cuentas suele empeorar si se espera." },
      { id: "o4", objecion: "Necesito pensarlo", respuesta: "Claro. ¿Qué parte quieres pensar? Mejor resolverlo ahora que me tienes aquí." },
    ],
  },
};

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const lineas = (v: unknown, max: number) => (Array.isArray(v) ? v.map((x) => texto(x, LIMITES.linea)).filter(Boolean).slice(0, max) : []);

// Limpia un guion que llega de la base o del editor: recorta, quita vacíos y pone ids únicos
export function guionValido(v: unknown): Guion | null {
  if (!v || typeof v !== "object") return null;
  const g = v as { pasos?: unknown; objeciones?: unknown };
  const pasos = (Array.isArray(g.pasos) ? g.pasos : [])
    .map((p) => p as Record<string, unknown>)
    .map((p) => ({ titulo: texto(p?.titulo, 80), texto: texto(p?.texto, LIMITES.texto), checklist: lineas(p?.checklist, LIMITES.checklist), pistas: lineas(p?.pistas, LIMITES.pistas) }))
    .filter((p) => p.titulo)
    .slice(0, LIMITES.pasos)
    .map((p, i) => ({ id: id("p", i), ...p }));
  const objeciones = (Array.isArray(g.objeciones) ? g.objeciones : [])
    .map((o) => o as Record<string, unknown>)
    .map((o) => ({ objecion: texto(o?.objecion, LIMITES.linea), respuesta: texto(o?.respuesta, LIMITES.texto) }))
    .filter((o) => o.objecion && o.respuesta)
    .slice(0, LIMITES.objeciones)
    .map((o, i) => ({ id: id("o", i), ...o }));
  if (!pasos.length) return null;
  return { pasos, objeciones };
}

// Cuántos puntos de la checklist marcó (y de cuántos), solo con los pasos que existen en el guion
export function resumenMarcas(guion: Guion, marcas: Marcas) {
  let hechos = 0;
  let total = 0;
  for (const p of guion.pasos) {
    total += p.checklist.length;
    hechos += new Set((marcas[p.id] ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < p.checklist.length)).size;
  }
  return { hechos, total };
}

// «{nombre}» y compañía del texto del guion, con los datos del lead
export function rellenar(textoGuion: string, datos: Record<string, string | null | undefined>) {
  return textoGuion.replace(/\{(\w[\w ]*)\}/g, (todo, clave: string) => datos[clave.trim()] || todo);
}
