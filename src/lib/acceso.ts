import "server-only";
import { db } from "@/lib/datos";
import { enviarEmail, urlApp, type ResultadoEmail } from "@/lib/email";
import { plantillaEmail } from "@/lib/plantilla-email";
import { DURA_ENLACE } from "@/lib/enlace";

// Emails con enlace para entrar (Fase 1, Cristian 12 oct 2026), todos con Resend y el diseño de la app:
// - «bienvenida»: el acceso que manda un administrador (lleva a crear la contraseña);
// - «pedido»: el que pide la propia persona desde el login (caducado u olvidó la contraseña);
// - «ficha»: el «Enviar enlace mágico» de la ficha de cada persona.
// El enlace es de Supabase: un solo uso y dura lo que diga su ajuste (24 h).
type TipoEnlace = "bienvenida" | "pedido" | "ficha";

export async function mandarEnlace(persona: { nombre: string; email: string }, tipo: TipoEnlace, proyecto?: string): Promise<ResultadoEmail> {
  const { data, error } = await db().auth.admin.generateLink({ type: "magiclink", email: persona.email });
  if (error || !data?.properties?.hashed_token) return { enviado: false, motivo: "No se pudo generar el enlace" };
  const siguiente = tipo === "ficha" ? "" : "&siguiente=perfil";
  const enlace = `${urlApp()}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink${siguiente}`;
  const dura = `Dura ${DURA_ENLACE} y solo vale una vez.`;
  const dondeProyecto = proyecto ? ` (${proyecto})` : "";
  const textos = {
    bienvenida: {
      asunto: "Tu acceso a la app de ventas · Eternity",
      titulo: "Bienvenido a Eternity",
      intro: `Hola ${persona.nombre}: ya tienes acceso a la app de ventas de Eternity${dondeProyecto}. Pulsa el botón para entrar y crea tu contraseña. ${dura}`,
      boton: "Entrar y crear mi contraseña",
      pie: `Después entrarás en ${urlApp()} con tu email y tu contraseña. Si el enlace caduca, en la pantalla de entrar pulsa «¿No puedes entrar?» y te llega otro.`,
    },
    pedido: {
      asunto: "Tu enlace para entrar · Eternity",
      titulo: "Tu enlace para entrar",
      intro: `Hola ${persona.nombre}: pulsa el botón para entrar en la app de ventas de Eternity. Dentro puedes crear o cambiar tu contraseña. ${dura}`,
      boton: "Entrar en Eternity",
      pie: "Si no lo has pedido tú, ignora este email: nadie puede entrar sin abrirlo.",
    },
    ficha: {
      asunto: `Tu enlace para entrar${proyecto ? ` en ${proyecto}` : ""} · Eternity`,
      titulo: "Tu enlace para entrar",
      intro: `Hola ${persona.nombre}: pulsa el botón para entrar en la app de ventas de Eternity. ${dura}`,
      boton: "Entrar en Eternity",
      pie: "Si no lo has pedido tú, ignora este email.",
    },
  }[tipo];
  return enviarEmail({
    para: [persona.email],
    asunto: textos.asunto,
    texto: `${textos.intro}\n\n${enlace}\n\n${textos.pie}`,
    html: plantillaEmail({ urlBase: urlApp(), titulo: textos.titulo, intro: textos.intro, boton: { texto: textos.boton, url: enlace }, pie: textos.pie }),
  });
}
