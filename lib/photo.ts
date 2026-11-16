/**
 * A photograph off somebody's phone, made small enough to store.
 *
 * The cap in the review app is 250kB and a picture taken on a phone is three
 * to eight megabytes, so without this every upload would be refused and the
 * advice would be "open it in something else first". Nobody does that.
 *
 * Done in the browser rather than on the server on purpose: the bytes never
 * leave the machine at full size, which is the difference between a four
 * megabyte upload on a hotel's broadband and a hundred kilobyte one.
 *
 * The result is a JPEG whatever went in. These are photographs of shelves and
 * beds — there is no transparency to keep and no flat colour that PNG would
 * do better, and one format out means one thing to think about.
 */

/**
 * The long edge, in pixels.
 *
 * Big enough to see which way a towel is folded when it fills a phone screen,
 * which is the whole job. Past this the file grows and the picture does not
 * get any more useful.
 */
const MAX_EDGE = 1400;

/** Under the review app's 250kB, with room for base64 rounding. */
const MAX_BYTES = 240 * 1024;

/** How many bytes a base64 data URI actually carries. */
function bytesOf(dataUri: string): number {
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

async function decode(file: File): Promise<ImageBitmap> {
  // `createImageBitmap` handles orientation from EXIF, which an <img> does
  // not — without it a photograph taken in portrait arrives on its side.
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

function draw(bitmap: ImageBitmap, edge: number): HTMLCanvasElement {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");

  // White underneath, because a PNG with transparency becomes black where it
  // was clear once it is a JPEG, and a photo of a bed should not arrive with
  // black corners.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * @returns a `data:image/jpeg;base64,…` string, or an error to show as-is.
 */
export async function shrink(
  file: File
): Promise<{ dataUri: string } | { error: string }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    /*
     * Almost always an iPhone HEIC, which no desktop browser decodes. Named
     * rather than described, because "that image could not be read" leaves
     * somebody trying the same file again.
     */
    return {
      error:
        "That image could not be read. If it came off an iPhone it may be HEIC — send it as a JPEG, or take the screenshot and use that.",
    };
  }

  try {
    /*
     * Quality first, then size.
     *
     * Dropping quality on a photograph is nearly invisible down to about 0.5
     * and saves most of the file; shrinking it loses detail that is the point
     * of the picture. So the long edge only comes down once quality has been
     * spent, and only for the photographs that need it.
     */
    for (const edge of [MAX_EDGE, 1000, 700]) {
      const canvas = draw(bitmap, edge);
      for (const quality of [0.82, 0.7, 0.58, 0.48]) {
        const dataUri = canvas.toDataURL("image/jpeg", quality);
        if (bytesOf(dataUri) <= MAX_BYTES) return { dataUri };
      }
    }

    return {
      error: "That photo is too detailed to store. Try a smaller one.",
    };
  } finally {
    bitmap.close();
  }
}
