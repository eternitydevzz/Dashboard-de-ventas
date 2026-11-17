// A4-03: envía un formulario que usa sinVaciar (onSubmit) con estos datos. sinVaciar lee el <form> con
// new FormData(form); en Node no hay <form>, así que mientras se envía, FormData devuelve los datos preparados.
export function enviarSinVaciar(onSubmit: unknown, fd: FormData) {
  const Real = globalThis.FormData;
  globalThis.FormData = function () { return fd; } as unknown as typeof FormData;
  try {
    (onSubmit as (e: unknown) => void)({ preventDefault() {}, currentTarget: {} });
  } finally {
    globalThis.FormData = Real;
  }
}
