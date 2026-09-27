import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Peer } from '../core/handler';

/** node:http request → Web Request, so the shared handler can serve it. */
export function toRequest(req: IncomingMessage): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || name.startsWith(':')) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v);
  }
  const method = req.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  let url: string;
  try {
    url = new URL(req.url ?? '/', 'http://grabby.local').href;
  } catch {
    url = 'http://grabby.local/';
  }
  return new Request(url, {
    method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : undefined,
    // Required by Node when the body is a stream.
    ...(hasBody ? { duplex: 'half' } : {}),
  } as RequestInit);
}

export function peerOf(req: IncomingMessage): Peer {
  const addr = req.socket.remoteAddress ?? '';
  return {
    ip: addr || 'unknown',
    loopback: addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1',
    host: req.headers.host ?? '',
  };
}

export async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  if (res.headersSent) return;
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => { headers[name] = value; });
  const body = response.body ? Buffer.from(await response.arrayBuffer()) : null;
  if (body) headers['content-length'] = String(body.length);
  res.writeHead(response.status, headers);
  res.end(body ?? undefined);
}
