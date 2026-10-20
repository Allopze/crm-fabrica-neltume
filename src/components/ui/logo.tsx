import { LOGO } from "@/lib/logo-trazos";

/** Logo oficial «Puertas Neltume» (public/marca/logo-neltume.svg), en el color del texto que lo rodea. */
export function Logo({ className, titulo = "Puertas Neltume" }: { className?: string; titulo?: string }) {
  return (
    <svg viewBox={LOGO.viewBox} className={className} fill="currentColor" fillRule={LOGO.relleno} role="img" aria-label={titulo}>
      {LOGO.trazos.map((d, i) => <path key={i} d={d} />)}
      {LOGO.rects.map(([x, y, w, h], i) => <rect key={`r${i}`} x={x} y={y} width={w} height={h} />)}
    </svg>
  );
}
