"use client";

import type { ReactNode } from "react";
import { sinVaciar } from "@/components/sin-vaciar";

// Un <form> para páginas de servidor que no se vacía al enviarlo (12 nov 2026, onboarding): con action={…} React 19
// borra lo escrito tras cada envío, y quien se equivocaba en un campo tenía que escribir otra vez las contraseñas,
// el teléfono y el WhatsApp.
export function FormularioSinVaciar({ accion, className, children }: { accion: (fd: FormData) => void | Promise<void>; className?: string; children: ReactNode }) {
  return <form onSubmit={sinVaciar(accion)} className={className}>{children}</form>;
}
