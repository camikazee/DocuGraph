const REQUEST_HEADERS = [
  'accept',
  'authorization',
  'content-type',
  'if-match',
  'if-none-match',
  'x-request-id',
] as const;

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function apiUpstream(): URL {
  const value =
    process.env.DOCUGRAPH_API_UPSTREAM ?? 'http://localhost:3000/api/v1';
  const url = new URL(value.endsWith('/') ? value : `${value}/`);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('DOCUGRAPH_API_UPSTREAM must use http or https');
  }
  return url;
}

/**
 * Same-origin browser gateway for the separately deployed NestJS API.
 *
 * The upstream is owned by server configuration, never request input. Only the
 * headers required by DocuGraph cross the boundary; browser cookies and the
 * public Host header are intentionally excluded.
 */
export async function proxyApiRequest(
  request: Request,
  path: string[],
): Promise<Response> {
  const source = new URL(request.url);
  const target = apiUpstream();
  target.pathname = `${target.pathname.replace(/\/$/, '')}/${path
    .map(encodeURIComponent)
    .join('/')}`;
  target.search = source.search;

  const requestHeaders = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) requestHeaders.set(name, value);
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const upstream = await fetch(target.toString(), {
    method: request.method,
    headers: requestHeaders,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: 'manual',
    signal: request.signal,
  });

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      responseHeaders.append(name, value);
    }
  });

  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
