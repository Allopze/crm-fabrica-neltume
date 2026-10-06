// Tablón de madera generado con filtros SVG: veta longitudinal ondulada + poro fino.
// Sin imágenes: escala a cualquier tamaño y cada tablón tiene su propia semilla.

export interface MaderaVisual {
  id: string;
  base: string; // tono medio de la especie
  veta: string; // tono de las líneas de crecimiento
  poro: string; // tono del poro fino
  semilla: number;
  ondulacion: number; // cuánto serpentea la veta
  densidad: string; // frecuencia "x y" de la veta: x alta = vetas finas, y baja = vetas largas
}

// Bandas alternadas: convierten el ruido continuo en líneas de crecimiento nítidas.
const BANDAS = "0 0 .15 .55 .9 .55 .15 0 0 .1 .4 .7 .4 .1 0 0 .2 .6 .2 0";

export function Tablon({ m, className }: { m: MaderaVisual; className?: string }) {
  const f = `veta-${m.id}`;
  return (
    <svg className={className} preserveAspectRatio="none" aria-hidden>
      <defs>
        <filter id={f} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency={m.densidad} numOctaves={3} seed={m.semilla} result="fibra" />
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.0015" numOctaves={2} seed={m.semilla + 11} result="onda" />
          <feDisplacementMap in="fibra" in2="onda" scale={m.ondulacion} xChannelSelector="R" yChannelSelector="G" result="curva" />
          <feColorMatrix in="curva" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.4 0 0 0 -0.2" result="nivel" />
          <feComponentTransfer in="nivel" result="lineas">
            <feFuncA type="table" tableValues={BANDAS} />
          </feComponentTransfer>
          <feTurbulence type="fractalNoise" baseFrequency="0.9 0.06" numOctaves={2} seed={m.semilla + 23} result="ruidoPoro" />
          <feColorMatrix in="ruidoPoro" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.3" result="poroAlfa" />
          <feFlood floodColor={m.base} result="fondo" />
          <feFlood floodColor={m.veta} result="tonoVeta" />
          <feComposite in="tonoVeta" in2="lineas" operator="in" result="vetas" />
          <feFlood floodColor={m.poro} floodOpacity="0.35" result="tonoPoro" />
          <feComposite in="tonoPoro" in2="poroAlfa" operator="in" result="poros" />
          <feMerge>
            <feMergeNode in="fondo" />
            <feMergeNode in="vetas" />
            <feMergeNode in="poros" />
          </feMerge>
        </filter>
        {/* Luz de barniz: brillo al centro y canto oscurecido */}
        <linearGradient id={`${f}-luz`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity=".28" />
          <stop offset=".12" stopColor="#000" stopOpacity="0" />
          <stop offset=".45" stopColor="#fff" stopOpacity=".09" />
          <stop offset=".88" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".32" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" filter={`url(#${f})`} />
      <rect width="100%" height="100%" fill={`url(#${f}-luz)`} />
    </svg>
  );
}

export const MADERAS_LOGIN: (MaderaVisual & { nombre: string })[] = [
  { id: "pino", nombre: "Pino Oregón", base: "#d9ad74", veta: "#a8703a", poro: "#7a4a22", semilla: 4, ondulacion: 70, densidad: "0.022 0.0016" },
  { id: "lenga", nombre: "Lenga", base: "#cf9474", veta: "#a3624a", poro: "#6e3a28", semilla: 19, ondulacion: 40, densidad: "0.05 0.0012" },
  { id: "rauli", nombre: "Raulí", base: "#a8654c", veta: "#743826", poro: "#4a2012", semilla: 7, ondulacion: 55, densidad: "0.04 0.0014" },
  { id: "mara", nombre: "Mara", base: "#7d3a27", veta: "#4c1c10", poro: "#2a0e06", semilla: 31, ondulacion: 35, densidad: "0.06 0.0011" },
];
