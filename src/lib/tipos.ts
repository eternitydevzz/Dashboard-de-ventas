// Tipos de las tablas (a mano; reflejan supabase/migrations).

export type Rol = "ceo" | "director" | "closer" | "caller";

// Plan GHL E2: closer de rol, o caller con el interruptor «También closer»
export const esCloser = (p: { rol: Rol; tambien_closer?: boolean }) => p.rol === "closer" || !!p.tambien_closer;

export type Perfil = {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  telefono: string | null;
  whatsapp: string | null;
  admin_activo: boolean;
  onboarding_completo: boolean;
  es_prueba?: boolean; // 1.0: perfil de prueba (no cuenta en cifras, reparto ni liquidaciones)
  tambien_closer?: boolean; // Plan GHL E1: un caller que también es closer (Facu)
  activo: boolean;
};

export type Proyecto = {
  id: string;
  nombre: string;
  moneda: "USD" | "EUR";
  zona_horaria: "America/New_York" | "Europe/Madrid";
  reparto_auto: boolean; // 1.0 bloque 2: reparto automático al entrar, con % por caller
  reparto_solo_horario: boolean;
  preguntas_reporte?: unknown; // 1.0 bloque 7: preguntas del reporte por rol (lib/reportes)
  tramos_comision?: unknown; // 1.0 bloque 4: tramos de comisión de callers y closers (lib/comisiones)
  calendario?: unknown; // 1.0 bloque 1: ajustes de las llamadas de los closers (lib/disponibilidad)
  webhook_secreto: string;
  aviso_webhook_url: string | null;
  link_agenda?: string | null; // link del calendario de GHL que el caller manda al lead (11 oct)
  link_reserva?: string | null; // Fase 7: link de Reserva, vale para cualquier programa
  link_agenda_es?: string | null; // 13 nov: versiones de España (lib/mercado); vacío = las de Latam
  link_reserva_es?: string | null;
  etapa_citas_ghl?: string | null; // Fase 4: columna donde van los leads con cita de GHL (antes, «Orgánico → Agendados» por nombre)
  ghl_leads_hasta?: string | null; // leads por API (16 oct): fecha de la oportunidad de GHL más nueva ya leída; null = aún sin activar
  ghl_calendarios?: string[]; // plan GHL (16 oct): ids de los calendarios de GHL que lee la app; vacío = por closer, como antes
  color: string;
};

// Paso 0: «Callers» y «Closers» son pipelines del equipo (uno de cada por proyecto)
export type TipoPipeline = "normal" | "callers" | "closers";
export type Pipeline = { id: string; proyecto_id: string; nombre: string; orden: number; tipo: TipoPipeline };
// estado_caller: columna de «Callers» unida a un estado del lead · columna_cita: de «Closers», unida a Pre-call o Post-call
export type Etapa = { id: string; pipeline_id: string; nombre: string; orden: number; color: string; estado_caller?: EstadoCaller | null; columna_cita?: string | null };

export type Respuesta = { pregunta: string; respuesta: string };

// C11 (plan Callers, 7 nov): los 12 estados viven en lib/estados-caller.ts
export type { EstadoCaller } from "@/lib/estados-caller";
import type { EstadoCaller } from "@/lib/estados-caller";

export type Lead = {
  id: string;
  proyecto_id: string;
  ghl_contact_id: string | null;
  nombre: string;
  apellido: string;
  email: string | null;
  telefono: string | null;
  pais?: string | null; // 1b: código del país sacado del teléfono («ES») o «Sin país»; null = aún sin calcular
  etiquetas: string[];
  respuestas: Respuesta[];
  origen: "csv" | "ghl" | "manual";
  pipeline_id: string | null;
  etapa_id: string | null;
  caller_id: string | null;
  closer_id: string | null;
  estado_caller: EstadoCaller;
  llamar_en: string | null;
  link_enviado_por?: string | null;
  link_enviado_en?: string | null;
  creado_en: string;
  ultima_actividad: string | null;
  // v2: de dónde viene y todo lo que mandó
  fuente: string | null;
  evento: string | null;
  seguimiento: Record<string, string>;
  quiz_score: number | null;
  datos: Record<string, unknown>;
  estrellas_caller: number | null;
  oferta?: "vip_empresas" | "vip" | "empresas" | "grupal" | "membresia" | null; // bloque A: según el formulario de la Biblioteca
};

export type EstadoCita =
  | "pendiente"
  | "confirmacion_pendiente"
  | "confirmada"
  | "no_califica"
  | "cerrada"
  | "seguimiento"
  | "no_show"
  | "reagendada"
  | "cancelada"
  | "perdida";

export type Cita = {
  id: string;
  proyecto_id: string;
  lead_id: string;
  closer_id: string | null;
  agendada_por: string | null;
  fecha: string;
  estado: EstadoCita;
  origen: "manual" | "ghl";
  nota: string | null;
  creado_en: string;
  estrellas_caller: number | null;
  estrellas_closer: number | null;
  // Plan GHL (16 oct): de dónde viene la cita (lib/canal) · calendario de GHL · página desde la que reservó
  canal?: string | null;
  ghl_calendario?: string | null;
  origen_url?: string | null;
  closer_antes?: string | null; // 3 nov: el nombre del closer que la llevaba, si se le borró
};

export type Producto = {
  id: string;
  proyecto_id: string;
  nombre: string;
  precio: number | null;
  link_pago: string | null;
  link_dossier?: string | null; // 1.0 bloque 7: va encima del link de pago
  links_pago?: unknown; // Fase 7: varios links de pago (lib/links-pago)
  links_pago_es?: unknown; // 13 nov: los de España (lib/mercado); vacío = los de Latam
  vende_caller: boolean;
  cuenta_comision?: boolean; // 1.0 bloque 4: si no, no paga comisión ni suma para el tramo
  activo: boolean;
  orden: number;
  // v2 (Programas)
  descripcion?: string | null;
  categoria?: string | null;
  color?: string;
  backend_offer?: boolean;
  modo_pago?: "unico" | "cuotas" | "mensual"; // bloque A: «mensual» = membresía sin fin
  num_cuotas?: number | null;
  precios_divisa?: Record<string, number> | null;
  comisiones?: Partial<Record<"ceo" | "director" | "closer" | "caller" | "caller_agenda", number>> | null;
};

export type Venta = {
  id: string;
  proyecto_id: string;
  lead_id: string;
  producto_id: string | null;
  vendedor_id: string | null;
  facturacion: number;
  cash_collected: number;
  tipo_pago: "completo" | "reserva" | "cuotas";
  num_cuotas: number | null;
  metodo: "stripe" | "transferencia" | "otro";
  nota: string | null;
  fecha: string;
  devuelto: number | null;
  devuelto_en: string | null;
  devolucion_nota: string | null;
};

export type Actividad = {
  id: string;
  lead_id: string;
  perfil_id: string | null;
  tipo: string;
  resultado: string | null;
  nota: string | null;
  creado_en: string;
};

export type Recurso = {
  id: string;
  proyecto_id: string;
  titulo: string;
  tipo: "pdf" | "enlace" | "guion" | "video";
  url: string | null;
  contenido: string | null;
  archivo_path: string | null;
  para_rol: "todos" | "caller" | "closer";
  mercado?: "latam" | "es"; // 13 nov (lib/mercado)
  creado_en: string;
};

export type Reporte = {
  id: string;
  proyecto_id: string;
  perfil_id: string;
  rol: string;
  fecha: string;
  respuestas: Record<string, string | number>;
  preguntas?: unknown; // 1.0 bloque 7: las preguntas que tenía al enviarse
  creado_en: string;
};
