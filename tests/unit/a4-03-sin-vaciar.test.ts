// A4-03 (fases 5-6): React 19 vacía un <form action={…}> al enviarse, aunque el servidor dé error, y se pierde lo
// escrito. Los formularios con campos que se escriben usan ahora sinVaciar (onSubmit), que no vacía nada.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(panel)/admin/acciones", () => ({}));
vi.mock("@/app/(panel)/closer/analisis/acciones", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
const { CalendariosProyecto } = await import("@/app/(panel)/admin/ghl");
const { EvaluarManual } = await import("@/app/(panel)/closer/analisis/cliente");
const { sinVaciar } = await import("@/components/sin-vaciar");

// Así marca React (en el servidor) un <form action={función}>: es el formulario que se vacía al enviarse
const conAction = (html: string) => /<form[^>]*action="javascript:/.test(html);

describe("A4-03 · lo escrito no se pierde si el servidor da error", () => {
  it("control: un <form action={función}> sí lleva la marca", () => {
    expect(conAction(renderToStaticMarkup(createElement("form", { action: () => {} })))).toBe(true);
  });
  it("Calendarios del proyecto (admin/ghl) y Evaluación manual (closer/análisis) ya no usan action={…}", () => {
    const ghl = renderToStaticMarkup(createElement(CalendariosProyecto, { ids: ["cal1"] }));
    const ev = renderToStaticMarkup(createElement(EvaluarManual, { id: "a1", nota: 7, texto: "bien" }));
    for (const html of [ghl, ev]) {
      expect(html).toMatch(/<form/);
      expect(conAction(html)).toBe(false);
    }
    expect(ghl).toContain("cal1"); // lo que ya había sigue en el campo
  });
  it("sinVaciar: no deja que el navegador envíe y pasa lo escrito a la acción", async () => {
    const leido = new Map([["t", "lo que escribió"]]);
    vi.stubGlobal("FormData", class { get = (k: string) => leido.get(k) ?? null; });
    const accion = vi.fn();
    const preventDefault = vi.fn();
    sinVaciar(accion)({ preventDefault, currentTarget: {} } as never);
    await vi.waitFor(() => expect(accion).toHaveBeenCalled());
    expect(preventDefault).toHaveBeenCalled();
    expect((accion.mock.calls[0][0] as FormData).get("t")).toBe("lo que escribió");
    vi.unstubAllGlobals();
  });
});
