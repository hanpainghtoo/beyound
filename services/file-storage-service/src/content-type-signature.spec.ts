import {
  contentMatchesDeclaredType,
  hasKnownSignature,
} from './content-type-signature';

const JPEG_HEADER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
]);
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const RIFF_WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const PDF_HEADER = Buffer.from('%PDF-1.7\n');
const OGG_HEADER = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02]);
const MP4_HEADER = Buffer.from([
  0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
]);
const WEBM_HEADER = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f,
]);

/** The exact failure this guard exists for: JSON stored as image/jpeg. */
const JSON_AS_IMAGE = Buffer.from(
  JSON.stringify({ type: 'image', payload: 'x'.repeat(200) }),
  'utf8',
);

describe('contentMatchesDeclaredType', () => {
  it.each([
    ['image/jpeg', JPEG_HEADER],
    ['image/png', PNG_HEADER],
    ['image/webp', RIFF_WEBP],
    ['application/pdf', PDF_HEADER],
    ['audio/ogg', OGG_HEADER],
    ['audio/mp4', MP4_HEADER],
    ['video/mp4', MP4_HEADER],
    ['video/webm', WEBM_HEADER],
  ])('accepts %s bytes declared as %s', (contentType, header) => {
    expect(contentMatchesDeclaredType(header, contentType)).toBe(true);
  });

  it('rejects JSON uploaded under an image type', () => {
    expect(contentMatchesDeclaredType(JSON_AS_IMAGE, 'image/jpeg')).toBe(
      false,
    );
  });

  it.each([
    ['image/jpeg', PNG_HEADER],
    ['image/png', JPEG_HEADER],
    ['image/webp', JPEG_HEADER],
    ['application/pdf', JSON_AS_IMAGE],
    ['audio/ogg', MP4_HEADER],
  ])('rejects mismatched bytes declared as %s', (contentType, content) => {
    expect(contentMatchesDeclaredType(content, contentType)).toBe(false);
  });

  it('accepts arbitrary text for text/plain', () => {
    expect(
      contentMatchesDeclaredType(Buffer.from('Order #12 shipped\n'), 'text/plain'),
    ).toBe(true);
  });

  it('rejects binary control bytes declared as text/plain', () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff]);
    expect(contentMatchesDeclaredType(binary, 'text/plain')).toBe(false);
  });

  it('passes unknown content types through unchanged', () => {
    expect(hasKnownSignature('application/zip')).toBe(false);
    expect(
      contentMatchesDeclaredType(JSON_AS_IMAGE, 'application/zip'),
    ).toBe(true);
  });
});