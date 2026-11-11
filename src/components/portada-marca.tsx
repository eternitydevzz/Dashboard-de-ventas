import Image from "next/image";

// Portada de los mensajes (Cristian, 11 nov 2026: «prefiero una imagen así siempre… no me gustan esas con IA»):
// fondo azul Maestria con luz en el centro, la M blanca con brillo y 4 destellos que titilan. Sin fotos.
const DESTELLOS = [
  { left: "28%", top: "22%", size: 26, delay: "0s" },
  { left: "70%", top: "24%", size: 24, delay: "0.6s" },
  { left: "27%", top: "74%", size: 16, delay: "1.2s" },
  { left: "71%", top: "72%", size: 18, delay: "0.3s" },
];

export function PortadaMarca({ className = "" }: { className?: string }) {
  return (
    <div className={`portada-marca relative overflow-hidden ${className}`} aria-hidden="true">
      <div className="absolute inset-0 flex items-center justify-center">
        <Image src="/marca/maestria-m.png" alt="" width={255} height={185} className="w-[24%] min-w-14" priority />
      </div>
      {DESTELLOS.map((d) => (
        <svg key={d.left + d.top} viewBox="0 0 24 24" className="portada-destello absolute" style={{ left: d.left, top: d.top, width: d.size, height: d.size, animationDelay: d.delay }}>
          <path d="M12 0C12.6 6.6 17.4 11.4 24 12 17.4 12.6 12.6 17.4 12 24 11.4 17.4 6.6 12.6 0 12 6.6 11.4 11.4 6.6 12 0Z" fill="white" />
        </svg>
      ))}
    </div>
  );
}
