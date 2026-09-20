import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';
import type { IncomingMessage } from 'node:http';

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a = 0, b = 0] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  // Conservatively accept global unicast only; exclude IPv4-mapped and special ranges.
  return (
    isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(db8|0):/i.test(address)
  );
}

export async function validateUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  ) {
    throw new Error('Only public HTTPS URLs on port 443 without credentials are allowed');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const allowed = (process.env.ALLOWED_HOSTS ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (allowed.length && !allowed.includes(hostname))
    throw new Error('Host is not in ALLOWED_HOSTS');
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((x) => !isPublicAddress(x.address)))
    throw new Error('Non-public destination blocked');
  return url;
}

/** Redirects are revalidated; bounded body and a total timeout cover streamed responses. */
export async function download(raw: string, maxBytes = 2_000_000): Promise<Uint8Array> {
  const signal = AbortSignal.timeout(20_000);
  let url = raw;
  for (let redirects = 0; redirects <= 3; redirects++) {
    signal.throwIfAborted();
    const validated = await validateUrl(url);
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      const req = request(
        validated,
        {
          signal,
          headers: {
            'User-Agent': 'MiningRightsDaily/1.0 (+MCP research tool)',
            'Accept-Encoding': 'identity',
          },
          // Validate the addresses actually used by the socket, closing DNS-rebinding TOCTOU.
          lookup(hostname, options, callback) {
            lookup(hostname, { all: true })
              .then((addresses) => {
                if (!addresses.length || addresses.some((x) => !isPublicAddress(x.address))) {
                  callback(new Error('Non-public destination blocked'), '', 4);
                } else if (options.all) callback(null, addresses);
                else callback(null, addresses[0]!.address, addresses[0]!.family);
              })
              .catch((error) => callback(error, '', 4));
          },
        },
        resolve,
      );
      req.on('error', reject);
      req.end();
    });
    if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
      response.destroy();
      const location = response.headers.location;
      if (!location) throw new Error('Redirect without Location');
      url = new URL(location, validated).href;
      continue;
    }
    if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
      response.destroy();
      throw new Error(`Upstream HTTP ${response.statusCode}`);
    }
    if (Number(response.headers['content-length']) > maxBytes) {
      response.destroy();
      throw new Error('Response exceeds size limit');
    }
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for await (const chunk of response) {
      bytes += chunk.length;
      if (bytes > maxBytes) throw new Error('Response exceeds size limit');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw new Error('Too many redirects');
}

export async function downloadText(url: string): Promise<string> {
  return new TextDecoder().decode(await download(url));
}
