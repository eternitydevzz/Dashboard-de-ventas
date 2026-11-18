// Iconos de los pasos de un workflow. Sin «use client» a propósito (arreglo del 18 nov 2026): los usan la vista de
// solo mirar (workflows.tsx, componente de servidor) y el editor (workflows-editor.tsx, de cliente). Desde un archivo
// «use client», el servidor recibía una referencia vacía e ICONOS[...] daba undefined (error #441 en /admin).
import { Clock, GitBranch, MoveRight, Tag, Target, User, Zap } from "lucide-react";
import type { Icono } from "@/lib/workflows-vista";

export const ICONOS: Record<Icono, { C: typeof Zap; color: string }> = {
  rayo: { C: Zap, color: "from-[#5b78ff] to-[#2341c8]" },
  reloj: { C: Clock, color: "from-[#9aa3b8] to-[#5d6679]" },
  persona: { C: User, color: "from-[#ffb35c] to-[#e46a00]" },
  etiqueta: { C: Tag, color: "from-[#ff8ab5] to-[#d63a78]" },
  diana: { C: Target, color: "from-[#4ade80] to-[#0e7a45]" },
  rama: { C: GitBranch, color: "from-[#a78bfa] to-[#6d28d9]" },
  mover: { C: MoveRight, color: "from-[#5ec8ff] to-[#0b72c4]" },
};
