// C8 (plan Callers, 7 nov; maqueta «Mi CRM»): un caller ve el pipeline «Callers» como «<Su nombre> Caller».
import { describe, expect, it } from "vitest";
import { nombreVisiblePipeline } from "@/lib/pipelines-nombre";

const callers = { id: "1", nombre: "Callers", tipo: "callers" as const };
const origen = { id: "2", nombre: "2. Webinar 1", tipo: "normal" as const };

describe("C8 · nombre del pipeline «Callers» para cada caller", () => {
  it("un caller lo ve con su nombre de pila", () => {
    expect(nombreVisiblePipeline(callers, { rol: "caller", nombre: "Cris caller" })).toBe("Cris Caller");
    expect(nombreVisiblePipeline(callers, { rol: "caller", nombre: "Valentina Castaño" })).toBe("Valentina Caller");
  });
  it("los jefes y los closers lo siguen viendo como «Callers»", () => {
    expect(nombreVisiblePipeline(callers, { rol: "director", nombre: "Thiago Voiro" })).toBe("Callers");
    expect(nombreVisiblePipeline(callers, { rol: "closer", nombre: "Junior Closer" })).toBe("Callers");
  });
  it("los demás pipelines no cambian", () => {
    expect(nombreVisiblePipeline(origen, { rol: "caller", nombre: "Cris caller" })).toBe("2. Webinar 1");
  });
});
