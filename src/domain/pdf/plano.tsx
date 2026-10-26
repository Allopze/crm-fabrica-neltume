// Plano de una línea: el dibujo de la puerta o del marco y, en la nota y la orden de trabajo, las cotas de la medida pedida
// (estilo común v1 §5, ADR-0025 D12). Las medidas salen de los tokens (`plano`): el dibujo base es de 455 × 900 px y el lienzo
// con cotas, de 660 × 1090; el ancho se acota bajo la hoja y el alto a su derecha, sobre la hoja que dice `dibujos.json`.
import { Image, Path, Svg, Text, View } from "@react-pdf/renderer";
import { type Dibujo, imagenDelDibujo, type Medida } from "./dibujos";
import { COLOR, PLANO } from "./estilo";

/** Esquema genérico de puerta (marco, hoja y manilla), en el mismo lienzo y con el mismo trazo que los dibujos. */
const GENERICO = `M14 890V14H441V890M${0.14 * 455} ${0.07 * 900}h${0.72 * 455}v${0.915 * 900}h${-0.72 * 455}zM${0.86 * 455 - 40} 470v70`;

/** Dibujo con su alto en puntos. Con `cotas` (y una hoja en el dibujo) el lienzo crece para alojarlas; `altoPt` es el del lienzo. */
export function Plano({ dibujo, cotas, altoPt }: { dibujo: Dibujo; cotas: Medida | null; altoPt: number }) {
  const [w, h] = dibujo.px;
  const hoja = cotas ? dibujo.hoja : null;
  const [ancho, alto] = hoja ? [PLANO.lienzoConCotasPx.ancho, PLANO.lienzoConCotasPx.alto] : [w, h];
  const k = altoPt / alto;
  const trazo = { stroke: COLOR.tinta, strokeWidth: PLANO.cotas.trazoPx, fill: "none" };
  const tinta = { fontFamily: PLANO.cotas.familia, fontWeight: PLANO.cotas.peso, fontSize: PLANO.cotas.tamanoPx, fill: COLOR.tinta, textAnchor: "middle" as const };
  let acotado = null;
  if (hoja && cotas) {
    const [x0, x1, y0, y1] = [hoja.izq * w, hoja.der * w, hoja.arriba * h, hoja.abajo * h];
    const [xv, yh, t] = [w + 40, h + 40, 16];
    const [ay, ax] = [(y0 + y1) / 2, xv + 125];
    acotado = (
      <>
        <Path d={`M${x0} ${yh}H${x1}M${x0} ${yh - t}V${yh + t}M${x1} ${yh - t}V${yh + t}M${xv} ${y0}V${y1}M${xv - t} ${y0}H${xv + t}M${xv - t} ${y1}H${xv + t}`} {...trazo} />
        <Text x={(x0 + x1) / 2} y={yh + 145} {...tinta}>{String(cotas.ancho)}</Text>
        <Text x={ax} y={ay} transform={`rotate(-90 ${ax} ${ay})`} {...tinta}>{String(cotas.alto)}</Text>
      </>
    );
  }
  return (
    <View style={{ width: ancho * k, height: alto * k }}>
      {/* Es la imagen de un PDF (react-pdf), no un <img>: no tiene atributo alt. */}
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      {dibujo.archivo && <Image src={{ data: imagenDelDibujo(dibujo), format: "png" }} style={{ position: "absolute", left: 0, top: 0, width: w * k, height: h * k }} />}
      <Svg width={ancho * k} height={alto * k} viewBox={`0 0 ${ancho} ${alto}`} style={{ position: "absolute", left: 0, top: 0 }}>
        {!dibujo.archivo && <Path d={GENERICO} {...trazo} />}
        {acotado}
      </Svg>
    </View>
  );
}
