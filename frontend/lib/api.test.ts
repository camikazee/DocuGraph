import {
  apiBlob,
  apiForm,
  apiJson,
  apiVoid,
  isAbortError,
} from './api';

function response(options: {
  status?: number;
  contentType?: string;
  body?: unknown;
  blob?: Blob;
} = {}): Response {
  const status = options.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(
      options.contentType ? { 'content-type': options.contentType } : {},
    ),
    json: jest.fn().mockResolvedValue(options.body),
    text: jest.fn().mockResolvedValue(
      typeof options.body === 'string' ? options.body : '',
    ),
    blob: jest.fn().mockResolvedValue(options.blob ?? new Blob()),
  } as unknown as Response;
}

describe('API client', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('docugraph_token', 'jwt-token');
    global.fetch = jest.fn();
  });

  it('sends JSON with auth and parses JSON', async () => {
    jest.mocked(fetch).mockResolvedValue(
      response({ contentType: 'application/json', body: { ok: true } }),
    );

    await expect(
      apiJson('/test', { method: 'POST', body: JSON.stringify({ a: 1 }) }),
    ).resolves.toEqual({ ok: true });
    const [, init] = jest.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer jwt-token');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('preserves the browser multipart boundary', async () => {
    jest.mocked(fetch).mockResolvedValue(
      response({ contentType: 'application/json', body: { id: 'asset' } }),
    );
    const form = new FormData();
    form.append('file', new Blob(['x']), 'x.txt');

    await apiForm('/upload', form);
    const [, init] = jest.mocked(fetch).mock.calls[0];
    expect(new Headers(init?.headers).has('content-type')).toBe(false);
  });

  it('supports empty successful responses', async () => {
    jest.mocked(fetch).mockResolvedValue(response({ status: 204 }));
    await expect(apiVoid('/empty', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('returns blobs without JSON parsing', async () => {
    const blob = new Blob(['archive']);
    jest.mocked(fetch).mockResolvedValue(response({ blob }));
    await expect(apiBlob('/export')).resolves.toBe(blob);
  });

  it('maps validation arrays to one API error', async () => {
    jest.mocked(fetch).mockResolvedValue(
      response({
        status: 400,
        contentType: 'application/json',
        body: { message: ['First problem', 'Second problem'] },
      }),
    );
    await expect(apiJson('/bad')).rejects.toEqual(
      expect.objectContaining({ status: 400, message: 'First problem' }),
    );
  });

  it('recognizes abort errors', () => {
    expect(isAbortError(new DOMException('cancelled', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('network'))).toBe(false);
  });
});
