import { HttpFileScanningClient, HttpTranscriptionClient } from './media-provider.client';

describe('production media provider clients', () => {
  const file = { fileName: 'voice.ogg', contentType: 'audio/ogg', content: Buffer.from('content') };

  it('sends bytes to a scanning endpoint and validates the verdict', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify({ verdict: 'clean', engineVersion: '1.2.3' }), { status: 200 }));
    await expect(new HttpFileScanningClient('https://scanner.test/scan', 'key', fetcher).scan(file)).resolves.toMatchObject({ verdict: 'clean' });
    expect(fetcher).toHaveBeenCalledWith('https://scanner.test/scan', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ authorization: 'Bearer key' }) }));
  });

  it('rejects an invalid scanning verdict', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify({ verdict: 'unknown' }), { status: 200 }));
    await expect(new HttpFileScanningClient('https://scanner.test/scan', undefined, fetcher).scan(file)).rejects.toThrow('invalid verdict');
  });

  it('submits multipart transcription and requires transcript text', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'Mingalaba', language: 'my' }), { status: 200 }));
    await expect(new HttpTranscriptionClient('https://speech.test/transcribe', 'key', fetcher).transcribe(file, { language: 'my' })).resolves.toMatchObject({ transcript: 'Mingalaba', language: 'my' });
  });
});
