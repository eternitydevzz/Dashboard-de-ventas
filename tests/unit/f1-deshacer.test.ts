import { describe, expect, it, vi, beforeEach } from "vitest";
import { apuntarDeshacer, esAtajoDeshacer, esCampoDeTexto, sacarDeshacer, vaciarDeshacer } from "@/lib/deshacer";

const tecla = (o: Partial<KeyboardEvent>) => ({ key: "z", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o });

describe("N2 · Ctrl+Z / Cmd+Z", () => {
  beforeEach(vaciarDeshacer);

  it("deshace lo último primero y cada paso una sola vez", () => {
    const a = { texto: "a", deshacer: vi.fn() };
    const b = { texto: "b", deshacer: vi.fn() };
    apuntarDeshacer(a);
    apuntarDeshacer(b);
    expect(sacarDeshacer()).toBe(b);
    expect(sacarDeshacer(b)).toBeUndefined(); // el botón de un aviso ya deshecho no hace nada
    expect(sacarDeshacer(a)).toBe(a);
    expect(sacarDeshacer()).toBeUndefined();
  });

  it("Ctrl+Z y Cmd+Z sí; con Mayús (rehacer) o sin modificador, no", () => {
    expect(esAtajoDeshacer(tecla({ ctrlKey: true }))).toBe(true);
    expect(esAtajoDeshacer(tecla({ metaKey: true, key: "Z" }))).toBe(true);
    expect(esAtajoDeshacer(tecla({ metaKey: true, shiftKey: true }))).toBe(false);
    expect(esAtajoDeshacer(tecla({}))).toBe(false);
  });

  it("dentro de un campo de texto manda el deshacer del texto", () => {
    expect(esCampoDeTexto({ tagName: "INPUT", type: "text" } as unknown as EventTarget)).toBe(true);
    expect(esCampoDeTexto({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(esCampoDeTexto({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(esCampoDeTexto({ tagName: "INPUT", type: "checkbox" } as unknown as EventTarget)).toBe(false);
    expect(esCampoDeTexto({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
  });

  it("guarda como mucho 20 pasos", () => {
    for (let i = 0; i < 25; i++) apuntarDeshacer({ texto: String(i), deshacer: () => {} });
    let n = 0;
    while (sacarDeshacer()) n++;
    expect(n).toBe(20);
  });
});
