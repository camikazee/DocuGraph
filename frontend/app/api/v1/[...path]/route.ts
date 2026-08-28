import { proxyApiRequest } from '@/lib/api-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: { path: string[] } };

function handle(request: Request, context: RouteContext): Promise<Response> {
  return proxyApiRequest(request, context.params.path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
