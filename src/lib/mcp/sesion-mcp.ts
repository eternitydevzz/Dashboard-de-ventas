import { AsyncLocalStorage } from "node:async_hooks";
import type { Sesion } from "@/lib/sesion";

// MCP, Fase 2 (11 nov 2026): la sesión de la persona de la clave mientras se ejecuta una herramienta. getSesion()
// la devuelve antes que la del navegador, así todas las comprobaciones de permisos de la app valen igual para el MCP.
// Cada petición lleva la suya (AsyncLocalStorage): dos peticiones a la vez no se mezclan.
const almacen = new AsyncLocalStorage<Sesion>();

export function conSesionMcp<T>(s: Sesion, fn: () => Promise<T>): Promise<T> {
  return almacen.run(s, fn);
}

export function sesionMcp(): Sesion | undefined {
  return almacen.getStore();
}
