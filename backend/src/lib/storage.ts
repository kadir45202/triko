// Görsel depolama soyutlaması. Geliştirmede yerel disk (uploads/);
// üretimde aynı arayüzle S3/R2 implementasyonu takılır (STORAGE=s3).
// Arkaplan silme: REMBG_URL tanımlıysa görüntü oraya POST edilir
// (rembg'nin http servisi: https://github.com/danielgatis/rembg),
// değilse görsel olduğu gibi "processed" sayılır (pass-through).
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

export const UPLOAD_DIR = join(__dirname, '..', '..', 'uploads');

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function assertImageMime(mime: string): void {
  if (!ALLOWED.has(mime)) throw new Error('unsupported_image_type');
}

function extFor(mime: string): string {
  return mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
}

export async function saveImage(buf: Buffer, mime: string, prefix: string): Promise<string> {
  assertImageMime(mime);
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = prefix + '-' + Date.now() + '-' + randomBytes(4).toString('hex') + extFor(mime);
  writeFileSync(join(UPLOAD_DIR, name), buf);
  return '/uploads/' + name;
}

export async function removeBackground(buf: Buffer, mime: string, prefix: string): Promise<string> {
  const rembgUrl = process.env.REMBG_URL;
  if (!rembgUrl) {
    // rembg servisi yapılandırılmamış — orijinal görsel processed olarak kullanılır
    return saveImage(buf, mime, prefix + '-passthrough');
  }
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buf)], { type: mime }), 'image' + extFor(mime));
  const res = await fetch(rembgUrl.replace(/\/$/, '') + '/api/remove', { method: 'POST', body: form });
  if (!res.ok) throw new Error('rembg_failed_' + res.status);
  const out = Buffer.from(await res.arrayBuffer());
  return saveImage(out, 'image/png', prefix + '-nobg');
}
