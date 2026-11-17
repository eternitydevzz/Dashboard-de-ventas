"use client";

import { startTransition, type FormEvent } from "react";

// React 19 vacía el formulario después de cada envío con action={...}.
// Con esto, si hay un error, lo que escribió la persona se queda donde estaba. `form`: para vaciarlo solo si va bien
// (los de «crear», para no crear lo mismo dos veces)
export function sinVaciar(accion: (fd: FormData, form: HTMLFormElement) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(() => accion(fd, form));
  };
}
