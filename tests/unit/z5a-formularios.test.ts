// Fases 5-6, zona A · S4-4 (17 nov 2026): si se pulsa «Entrar» antes de que cargue React, el navegador envía el
// formulario solo. Sin method="post" va por GET y la contraseña queda en la URL (historial y registros).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/login/acciones", () => ({ iniciarSesion: vi.fn(), pedirEnlace: vi.fn() }));
const { FormularioLogin } = await import("@/app/login/formulario");
const { FormularioSinVaciar } = await import("@/components/formulario-sin-vaciar");

describe("S4-4 · contraseña nunca en la URL", () => {
  it("el login va por POST", () => {
    expect(renderToStaticMarkup(createElement(FormularioLogin))).toMatch(/<form[^>]*method="post"/);
  });
  it("el formulario común (onboarding, con las contraseñas) va por POST", () => {
    expect(renderToStaticMarkup(createElement(FormularioSinVaciar, { accion: () => {} }, null))).toMatch(/<form[^>]*method="post"/);
  });
});
