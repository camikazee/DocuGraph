/** @jest-environment node */

import { proxyApiRequest } from './api-proxy';

describe('runtime API proxy', () => {
  const originalUpstream = process.env.DOCUGRAPH_API_UPSTREAM;

  beforeEach(() => {
    process.env.DOCUGRAPH_API_UPSTREAM = 'http://backend:3000/api/v1';
    global.fetch = jest.fn();
  });

  afterAll(() => {
    if (originalUpstream === undefined) {
      delete process.env.DOCUGRAPH_API_UPSTREAM;
    } else {
      process.env.DOCUGRAPH_API_UPSTREAM = originalUpstream;
    }
  });

  it('forwards method, query, body, and bounded headers', async () => {
    jest.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req-1',
        },
      }),
    );
    const request = new Request(
      'https://docs.example.com/api/v1/documents?limit=20',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          authorization: 'Bearer token',
          'content-type': 'application/json',
          cookie: 'must-not-leak=true',
          host: 'docs.example.com',
        },
        body: JSON.stringify({ title: 'Guide' }),
      },
    );

    const response = await proxyApiRequest(request, ['documents']);

    expect(fetch).toHaveBeenCalledWith(
      'http://backend:3000/api/v1/documents?limit=20',
      expect.objectContaining({ method: 'POST', redirect: 'manual' }),
    );
    const init = jest.mocked(fetch).mock.calls[0][1];
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer token');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('host')).toBeNull();
    expect(Buffer.from(init?.body as ArrayBuffer).toString()).toBe(
      JSON.stringify({ title: 'Guide' }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('x-request-id')).toBe('req-1');
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('preserves multipart bytes without inventing a boundary', async () => {
    jest.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    const body = new Uint8Array([1, 2, 3, 4]);
    const request = new Request('https://docs.example.com/api/v1/media', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=browser-boundary' },
      body,
    });

    await proxyApiRequest(request, ['media']);

    const init = jest.mocked(fetch).mock.calls[0][1];
    expect(new Headers(init?.headers).get('content-type')).toBe(
      'multipart/form-data; boundary=browser-boundary',
    );
    expect([...new Uint8Array(init?.body as ArrayBuffer)]).toEqual([1, 2, 3, 4]);
  });

  it('streams binary responses and preserves backend errors', async () => {
    jest.mocked(fetch).mockResolvedValue(
      new Response(new Uint8Array([9, 8, 7]), {
        status: 422,
        headers: {
          'content-type': 'application/octet-stream',
          connection: 'close',
        },
      }),
    );

    const response = await proxyApiRequest(
      new Request('https://docs.example.com/api/v1/export'),
      ['export'],
    );

    expect(response.status).toBe(422);
    expect(response.headers.get('connection')).toBeNull();
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([9, 8, 7]);
  });

  it('does not send or return a body for HEAD', async () => {
    jest.mocked(fetch).mockResolvedValue(
      new Response(null, { status: 200, headers: { 'content-length': '12' } }),
    );

    const response = await proxyApiRequest(
      new Request('https://docs.example.com/api/v1/health', { method: 'HEAD' }),
      ['health'],
    );

    expect(jest.mocked(fetch).mock.calls[0][1]?.body).toBeUndefined();
    expect(await response.text()).toBe('');
  });

  it('encodes path segments and rejects non-http upstreams', async () => {
    jest.mocked(fetch).mockResolvedValue(new Response('{}'));
    await proxyApiRequest(
      new Request('https://docs.example.com/api/v1/by-path'),
      ['documents', 'folder/file.md'],
    );
    expect(jest.mocked(fetch).mock.calls[0][0]).toBe(
      'http://backend:3000/api/v1/documents/folder%2Ffile.md',
    );

    process.env.DOCUGRAPH_API_UPSTREAM = 'file:///etc/passwd';
    await expect(
      proxyApiRequest(
        new Request('https://docs.example.com/api/v1/health'),
        ['health'],
      ),
    ).rejects.toThrow('DOCUGRAPH_API_UPSTREAM must use http or https');
  });
});
