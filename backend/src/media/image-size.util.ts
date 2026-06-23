/**
 * Minimalny odczyt wymiarów obrazu z nagłówka (PNG / GIF / JPEG) — bez zależności.
 * Zwraca null dla formatów bez wymiarów (SVG, PDF) lub przy błędzie.
 */
export function imageSize(
  buf: Buffer,
): { width: number; height: number } | null {
  try {
    // PNG: sygnatura + IHDR (width@16, height@20, big-endian).
    if (buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG') {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    // GIF: width@6, height@8 (little-endian).
    if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    // JPEG: szukamy markera SOF (0xC0–0xCF, bez 0xC4/0xC8/0xCC).
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let o = 2;
      while (o + 9 < buf.length) {
        if (buf[o] !== 0xff) {
          o++;
          continue;
        }
        const marker = buf[o + 1];
        if (
          marker >= 0xc0 &&
          marker <= 0xcf &&
          marker !== 0xc4 &&
          marker !== 0xc8 &&
          marker !== 0xcc
        ) {
          return {
            height: buf.readUInt16BE(o + 5),
            width: buf.readUInt16BE(o + 7),
          };
        }
        o += 2 + buf.readUInt16BE(o + 2);
      }
    }
  } catch {
    return null;
  }
  return null;
}
