export type ScanProviderResult = {
  verdict: 'clean' | 'infected' | 'error';
  threats?: string[];
  engineVersion?: string;
  raw?: Record<string, unknown>;
};

export type TranscriptionProviderResult = {
  transcript: string;
  language?: string;
  durationSeconds?: number;
  segments?: unknown[];
  raw?: Record<string, unknown>;
};

type ProviderFile = { fileName: string; contentType: string; content: Buffer };

export class HttpFileScanningClient {
  constructor(
    private readonly endpoint = process.env.FILE_SCANNING_ENDPOINT,
    private readonly apiKey = process.env.FILE_SCANNING_API_KEY,
    private readonly fetcher?: typeof fetch,
  ) {}

  async scan(file: ProviderFile): Promise<ScanProviderResult> {
    if (!this.endpoint) throw new Error('FILE_SCANNING_ENDPOINT is required');
    const response = await (this.fetcher || fetch)(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': file.contentType || 'application/octet-stream',
        'x-file-name': encodeURIComponent(file.fileName),
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: file.content as unknown as BodyInit,
    });
    const body = await this.json(response);
    if (!response.ok) throw new Error(`File scanning provider returned HTTP ${response.status}`);
    const verdict = String(body.verdict || body.status || '').toLowerCase();
    if (!['clean', 'infected'].includes(verdict)) throw new Error('File scanning provider returned an invalid verdict');
    return {
      verdict: verdict as 'clean' | 'infected',
      threats: Array.isArray(body.threats) ? body.threats.map(String) : [],
      engineVersion: typeof body.engineVersion === 'string' ? body.engineVersion : undefined,
      raw: body,
    };
  }

  private async json(response: Response) {
    try { return await response.json() as Record<string, unknown>; } catch { return {}; }
  }
}

export class HttpTranscriptionClient {
  constructor(
    private readonly endpoint = process.env.TRANSCRIPTION_ENDPOINT,
    private readonly apiKey = process.env.TRANSCRIPTION_API_KEY,
    private readonly fetcher?: typeof fetch,
  ) {}

  async transcribe(file: ProviderFile, options: Record<string, unknown> = {}): Promise<TranscriptionProviderResult> {
    if (!this.endpoint) throw new Error('TRANSCRIPTION_ENDPOINT is required');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file.content)], { type: file.contentType }), file.fileName);
    form.append('model', String(options.model || process.env.TRANSCRIPTION_MODEL || 'default'));
    if (options.language && options.language !== 'auto') form.append('language', String(options.language));
    const response = await (this.fetcher || fetch)(this.endpoint, {
      method: 'POST',
      headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : undefined,
      body: form,
    });
    const body = await this.json(response);
    if (!response.ok) throw new Error(`Transcription provider returned HTTP ${response.status}`);
    const transcript = typeof body.text === 'string' ? body.text : typeof body.transcript === 'string' ? body.transcript : '';
    if (!transcript.trim()) throw new Error('Transcription provider returned an empty transcript');
    return {
      transcript,
      language: typeof body.language === 'string' ? body.language : undefined,
      durationSeconds: Number.isFinite(Number(body.duration)) ? Number(body.duration) : undefined,
      segments: Array.isArray(body.segments) ? body.segments : undefined,
      raw: body,
    };
  }

  private async json(response: Response) {
    try { return await response.json() as Record<string, unknown>; } catch { return {}; }
  }
}
