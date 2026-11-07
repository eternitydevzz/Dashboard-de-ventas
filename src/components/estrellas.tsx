"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { ESCALA_CALLER, ESCALA_CLOSER } from "@/lib/estrellas";

// Selector de estrellas para formularios (envía el campo `name`). Obligatorio.
// quien = caller (elige de 2 a 5) o closer (de 1 a 5). C11 (7 nov): ya no existe «No contesta», que ponía el 1.
export function SelectorEstrellas({ quien, name = "estrellas", opcional = false }: { quien: "caller" | "closer"; name?: string; opcional?: boolean }) {
  const escala = quien === "caller" ? ESCALA_CALLER : ESCALA_CLOSER;
  const min = quien === "caller" ? 2 : 1;
  const [valor, setValor] = useState(0);
  const [encima, setEncima] = useState(0);
  const [falta, setFalta] = useState(false); // se intentó guardar sin elegir
  const visto = encima || valor;
  return (
    <fieldset>
      <legend className="etiqueta-campo">{quien === "caller" ? "¿Cómo fue la llamada?" : "¿Qué tal prospecto era?"}{opcional && " (opcional)"}</legend>
      <div className="flex items-center gap-1" onMouseLeave={() => setEncima(0)}>
        {[1, 2, 3, 4, 5].map((n) => {
          const posible = n >= min;
          return (
            <label key={n} title={escala[n - 1]} className={posible ? "cursor-pointer" : "cursor-not-allowed opacity-30"} onMouseEnter={() => posible && setEncima(n)}>
              <input
                type="radio"
                name={name}
                value={n}
                required={!opcional}
                disabled={!posible}
                checked={valor === n}
                onChange={() => {
                  setValor(n);
                  setFalta(false);
                }}
                onInvalid={(e) => {
                  e.preventDefault(); // sin el aviso del navegador (sale en inglés); se enseña el nuestro
                  setFalta(true);
                }}
                className="sr-only"
              />
              <Star className={`h-7 w-7 transition ${n <= visto ? "fill-oro text-oro" : "text-texto-3"}`} />
              <span className="sr-only">{n} · {escala[n - 1]}</span>
            </label>
          );
        })}
      </div>
      <p className={`mt-1 min-h-4 text-xs ${falta && !visto ? "font-medium text-mal" : "text-texto-2"}`}>
        {visto ? `${visto}★ · ${escala[visto - 1]}` : falta ? "Elige las estrellas para poder guardar." : quien === "caller" ? "Elige de 2 a 5" : "Elige de 1 a 5"}
      </p>
    </fieldset>
  );
}

// Para enseñar unas estrellas ya puestas
export function VerEstrellas({ n, quien }: { n: number | null | undefined; quien: "caller" | "closer" }) {
  if (!n) return <span className="text-xs text-texto-3">Sin estrellas</span>;
  const escala = quien === "caller" ? ESCALA_CALLER : ESCALA_CLOSER;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-texto-2" title={escala[n - 1]}>
      <span className="text-oro">{"★".repeat(n)}<span className="text-texto-3">{"★".repeat(5 - n)}</span></span>
      {escala[n - 1]}
    </span>
  );
}
