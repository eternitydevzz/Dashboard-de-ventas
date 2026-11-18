// 18 nov 2026: Chrome (MediaRecorder) graba el .webm sin índice (Cues) ni duración, y sin índice el navegador no puede
// saltar dentro del audio («demuxer seek failed» al pulsar ±10 s o la barra). Antes de subir la grabación se reempaqueta
// con índice y duración: copia el audio tal cual (sin recodificar, misma calidad), solo cambia el envoltorio.
// Si algo falla, se sube la original: una grabación sin índice se oye; una perdida, no.
// mediabunny se carga solo al terminar una grabación (import dinámico), no en cada página.

const ES_WEBM = /^(audio|video)\/webm\b/;

export async function hacerBuscable(blob: Blob): Promise<Blob> {
  if (!ES_WEBM.test(blob.type)) return blob; // Safari graba mp4: no lo toca
  let input: import("mediabunny").Input | null = null;
  try {
    const { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Output, WebMOutputFormat } = await import("mediabunny");
    input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const target = new BufferTarget();
    const output = new Output({ format: new WebMOutputFormat(), target });
    // «forced»: solo copiar; si el audio no se pudiera copiar se descarta y devolvemos la original (nunca recodifica)
    const conversion = await Conversion.init({ input, output, copy: { mode: "forced" }, showWarnings: false });
    if (!conversion.isValid || conversion.utilizedTracks.length === 0) return blob;
    await conversion.execute();
    return target.buffer ? new Blob([target.buffer], { type: blob.type }) : blob;
  } catch {
    return blob; // a propósito: ver la cabecera (subir la original antes que perder la grabación)
  } finally {
    input?.dispose();
  }
}
