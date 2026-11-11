/**
 * Content-type vs. payload agreement for uploaded bytes.
 *
 * A declared content type is a claim made at *registration* time, before the
 * client has sent a single byte. The body that later arrives over the signed
 * PUT URL is never checked against it, so a client can register `image/jpeg`
 * and store arbitrary bytes under that type. Nothing fails at upload time; the
 * record is marked `uploaded` and reported as a success.
 *
 * The damage only surfaces later, and far from the cause. The stored object is
 * served with the *declared* type (`Content-Type: image/jpeg`) while the bytes
 * are something else entirely, so the browser rejects the response before the
 * renderer ever sees it. This was observed as Chrome's
 * `net::ERR_BLOCKED_BY_ORB` (Opaque Response Blocking): a saved-reply photo
 * rendered as a broken image because the object held JSON that had been
 * uploaded under an image type, and the media library reported every upload as
 * having worked.
 *
 * Comparing the leading bytes against the expected signature closes that gap
 * at the only layer that has both the claim and the payload: the write.
 */

/**
 * Byte prefixes per content type. Kept deliberately small and explicit rather
 * than inferred from the extension: the registration-time type is the claim
 * under test, so the table is keyed by MIME type.
 *
 * A type absent from this table is not validated — see `hasKnownSignature`.
 */
const CONTENT_TYPE_SIGNATURES: Record<string, number[][]> = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/gif': [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  ],
  'image/webp': [
    // RIFF....WEBP — the four size bytes at offset 4 vary per file.
    [0x52, 0x49, 0x46, 0x46],
  ],
  'application/pdf': [[0x25, 0x50, 0x44, 0x46, 0x2d]],
  'audio/mpeg': [[0x49, 0x44, 0x33]],
  'audio/mp4': [
    // ISO-BMFF: bytes 4-7 are the 'ftyp' box type.
    [0x66, 0x74, 0x79, 0x70],
  ],
  'audio/ogg': [[0x4f, 0x67, 0x67, 0x53]],
  'video/mp4': [[0x66, 0x74, 0x79, 0x70]],
  'video/webm': [
    // EBML header. Deliberately 0x1a45dfa3 only: an .mkv/.webm family file
    // legitimately continues with different DocType bytes.
    [0x1a, 0x45, 0xdf, 0xa3],
  ],
  'text/plain': [], // Any UTF-8/ASCII text is valid; see isTextLike below.
};

/**
 * Offsets that must match within the leading N bytes, for signatures that do
 * not start at byte 0 (e.g. ISO-BMFF puts 'ftyp' at offset 4).
 */
const SIGNATURE_OFFSETS: Record<string, { offset: number; bytes: number[] }[]> =
  {
    'audio/mp4': [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }],
    'video/mp4': [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }],
    'image/webp': [{ offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }],
  };

/** Leading bytes any signature may inspect. */
const SIGNATURE_WINDOW = 16;

/**
 * True when this service knows how to verify the type. Unknown types pass
 * through untouched: adding a new allowed type must not start rejecting its
 * uploads, and the allowlist in `validateFile` remains the gate on what is
 * accepted at all.
 */
export function hasKnownSignature(contentType: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    CONTENT_TYPE_SIGNATURES,
    contentType,
  );
}

/**
 * Whether `content` plausibly is the type it was registered as.
 *
 * `text/plain` is treated as matching any text-like payload: its signature is
 * deliberately empty, since "starts with a letter" is not a property worth
 * enforcing and a BOM or leading punctuation is legitimate.
 */
export function contentMatchesDeclaredType(
  content: Buffer,
  contentType: string,
): boolean {
  if (!hasKnownSignature(contentType)) return true;

  if (contentType === 'text/plain') return isTextLike(content);

  const leading = [...content.subarray(0, SIGNATURE_WINDOW)];
  const startsWithAny = (prefix: number[]) =>
    prefix.every((byte, index) => leading[index] === byte);

  const anchored = SIGNATURE_OFFSETS[contentType];
  if (anchored && anchored.length > 0) {
    return anchored.every(({ offset, bytes }) =>
      bytes.every((byte, index) => leading[offset + index] === byte),
    );
  }

  const candidates = CONTENT_TYPE_SIGNATURES[contentType] ?? [];
  return candidates.some(startsWithAny);
}

/** Rejects control bytes, which binary payloads always contain early on. */
function isTextLike(content: Buffer): boolean {
  const sample = content.subarray(0, SIGNATURE_WINDOW * 8);
  for (const byte of sample) {
    // Tab, LF, CR are legal whitespace in text/plain.
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d) continue;
    if (byte < 0x20 || byte === 0x7f) return false;
  }
  return true;
}