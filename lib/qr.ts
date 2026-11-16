import qrcode from "qrcode-generator";

/**
 * A QR code as one SVG path, for printing.
 *
 * Vector rather than a raster image on purpose: this ends up on a poster that a
 * venue prints at whatever size their printer offers, and a PNG scaled up to
 * 60mm is a PNG with soft edges — which is exactly what a phone camera struggles
 * to read in low light across a table.
 */
export interface QrCode {
  /** Modules per side, excluding the quiet zone. */
  count: number;
  /** Every dark module, as unit squares in a `count`-by-`count` grid. */
  path: string;
}

/**
 * Error correction Q (25%) rather than the usual M. A poster lives on a counter
 * and gets splashed, scuffed and half-covered; the denser code is still
 * comfortably scannable at the size it prints, and it survives that.
 */
export function qrCode(text: string): QrCode {
  const qr = qrcode(0, "Q"); // 0 = smallest version the text fits in
  qr.addData(text); // byte mode, which is right for a URL
  qr.make();

  const count = qr.getModuleCount();
  const parts: string[] = [];

  // One path of unit squares, not one <rect> per module. A version-4 code is
  // 33x33, so this is the difference between one element and a thousand for the
  // browser to lay out and the printer to rasterise.
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) parts.push(`M${col} ${row}h1v1h-1z`);
    }
  }

  return { count, path: parts.join("") };
}
