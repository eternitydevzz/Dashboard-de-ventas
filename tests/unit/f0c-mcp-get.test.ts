// A1-02 (fase 0): el GET (SSE) del MCP se quedaba abierto hasta el corte de 300 s de Vercel y llenaba el registro de
// errores. El cliente del SDK acepta un 405 en GET como «el servidor no ofrece SSE».
import { describe, expect, it } from "vitest";

const { GET } = await import("@/app/api/mcp/route");

describe("MCP: GET", () => {
  it("responde 405 con Allow: POST, DELETE", async () => {
    const r = GET();
    expect(r.status).toBe(405);
    expect(r.headers.get("allow")).toBe("POST, DELETE");
  });
});
