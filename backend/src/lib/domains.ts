// Widget domain doğrulaması: müşteri kayıtlı domain listesi girdiyse
// Origin/Referer o listeyle eşleşmeli. Liste boşsa kısıt yok (demo modu).
import { FastifyRequest } from 'fastify';

export function originAllowed(req: FastifyRequest, allowedDomainsJson: string): boolean {
  let allowed: string[];
  try {
    allowed = JSON.parse(allowedDomainsJson || '[]');
  } catch {
    allowed = [];
  }
  if (!allowed.length) return true;

  const source = (req.headers.origin as string) || (req.headers.referer as string) || '';
  if (!source) return false;

  let host: string;
  try {
    host = new URL(source).hostname;
  } catch {
    return false;
  }

  return allowed.some((d) => {
    const domain = d.toLowerCase().trim();
    return host === domain || host.endsWith('.' + domain);
  });
}
