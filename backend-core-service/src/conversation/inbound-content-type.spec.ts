import {
  resolveInboundContentType,
  sniffContentType,
} from './conversation.service';

/**
 * Inbound media persistence fails soft: any storage rejection leaves the raw
 * `{ type, providerFile }` ref on the message, which renders as an attachment
 * with no fileId and never reaches the media library. Nothing surfaces the
 * cause at runtime, so the content-type decision is asserted directly here.
 */

const ascii = (text: string) => Buffer.from(text, 'latin1');
const padded = (head: Buffer, length = 512) =>
  Buffer.concat([head, Buffer.alloc(Math.max(0, length - head.length))]);

// MP3 layer III, MPEG-1: 0xFF 0xFB — 11 sync bits, layer != 00, version != 01.
const MP3_FRAME_SYNC = Buffer.from([0xff, 0xfb]);

describe('sniffContentType', () => {
  it('detects an mp3 that carries an ID3 tag', () => {
    expect(
      sniffContentType(Buffer.concat([ascii('ID3'), Buffer.alloc(64)])),
    ).toBe('audio/mpeg');
  });

  // Regression: only ID3-tagged mp3s were recognised. Telegram voice notes and
  // phone recordings are routinely raw frames with no tag and no filename, so
  // these resolved to null and the attachment kept its raw provider ref.
  it('detects a raw mp3 frame with no ID3 tag', () => {
    expect(sniffContentType(padded(MP3_FRAME_SYNC))).toBe('audio/mpeg');
  });

  it('detects an mp3 whose ID3 tag is followed by frame data', () => {
    expect(
      sniffContentType(
        Buffer.concat([
          ascii('ID3'),
          Buffer.alloc(30),
          MP3_FRAME_SYNC,
          Buffer.alloc(64),
        ]),
      ),
    ).toBe('audio/mpeg');
  });

  it('does not treat arbitrary binary noise as audio', () => {
    // 0xFF 0xE9 is 11 sync bits but layer == 00 and version == 01, both
    // reserved values — the guard that keeps false positives out.
    expect(sniffContentType(padded(Buffer.from([0xff, 0xe9])))).toBeNull();
    expect(sniffContentType(Buffer.from('not audio at all'))).toBeNull();
  });

  // Regression: m4a shares the ISO-BMFF container with mp4, so the shared
  // 'ftyp' branch reported every m4a as video/mp4. It then stored as a
  // non-playable video rather than audio.
  it('separates m4a audio from mp4 video by major brand', () => {
    expect(sniffContentType(padded(ascii('\0\0\0 ftypM4A ')))).toBe(
      'audio/mp4',
    );
    expect(sniffContentType(padded(ascii('\0\0\0 ftypM4B ')))).toBe(
      'audio/mp4',
    );
    expect(sniffContentType(padded(ascii('\0\0\0 ftypmp42')))).toBe(
      'video/mp4',
    );
    expect(sniffContentType(padded(ascii('\0\0\0 ftypisom')))).toBe(
      'video/mp4',
    );
  });

  it('detects ogg voice notes, webm, and the image/pdf formats', () => {
    expect(sniffContentType(padded(ascii('OggS')))).toBe('audio/ogg');
    expect(
      sniffContentType(padded(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))),
    ).toBe('video/webm');
    expect(sniffContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'image/jpeg',
    );
    expect(sniffContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(
      'image/png',
    );
    expect(sniffContentType(ascii('%PDF-1.7'))).toBe('application/pdf');
  });
});

describe('resolveInboundContentType', () => {
  const mp3Frame = padded(MP3_FRAME_SYNC);
  const m4a = padded(ascii('\0\0\0 ftypM4A '));

  it('prefers the provider mime type when Telegram supplies one', () => {
    expect(
      resolveInboundContentType(
        'audio/mpeg',
        'application/octet-stream',
        '',
        mp3Frame,
      ),
    ).toBe('audio/mpeg');
  });

  // Telegram's /file host serves octet-stream, which file-storage rejects, so
  // octet-stream must never win — otherwise every download 400s.
  it('never returns octet-stream from any source', () => {
    expect(
      resolveInboundContentType(
        'application/octet-stream',
        'binary/octet-stream',
        '',
        mp3Frame,
      ),
    ).toBe('audio/mpeg');
  });

  it('falls back to magic bytes when the provider and download are silent', () => {
    expect(
      resolveInboundContentType(
        undefined,
        'application/octet-stream',
        'telegram-abc123',
        m4a,
      ),
    ).toBe('audio/mp4');
  });

  it('falls back to the filename extension when bytes are inconclusive', () => {
    expect(
      resolveInboundContentType(
        undefined,
        '',
        'voice-note.ogg',
        Buffer.alloc(16),
      ),
    ).toBe('audio/ogg');
    expect(
      resolveInboundContentType(undefined, '', 'clip.webm', Buffer.alloc(16)),
    ).toBe('video/webm');
    expect(
      resolveInboundContentType(undefined, '', 'song.m4a', Buffer.alloc(16)),
    ).toBe('audio/mp4');
    expect(
      resolveInboundContentType(undefined, '', 'anim.gif', Buffer.alloc(16)),
    ).toBe('image/gif');
  });

  it('returns null for an unidentifiable file so the raw ref is kept', () => {
    expect(
      resolveInboundContentType(
        undefined,
        'application/octet-stream',
        'telegram-abc123',
        Buffer.alloc(64),
      ),
    ).toBeNull();
  });
});
