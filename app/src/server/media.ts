import { createHash, createHmac } from 'node:crypto';
import { env } from './env.js';
import { ApiError } from './http.js';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export type SupportedImage = { bytes: Uint8Array; mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; extension: 'jpg' | 'png' | 'webp' };

function detectedImage(bytes: Uint8Array): Pick<SupportedImage, 'mimeType' | 'extension'> | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mimeType: 'image/jpeg', extension: 'jpg' };
  if (bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])) return { mimeType: 'image/png', extension: 'png' };
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return { mimeType: 'image/webp', extension: 'webp' };
  return null;
}

export async function validateImageUpload(file: File): Promise<SupportedImage> {
  if (file.size === 0) throw new ApiError(400, 'INVALID_MEDIA', 'A foto está vazia.');
  if (file.size > MAX_IMAGE_BYTES) throw new ApiError(413, 'MEDIA_TOO_LARGE', 'A foto deve ter no máximo 10 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = detectedImage(bytes);
  if (!image) throw new ApiError(400, 'INVALID_MEDIA', 'Envie uma foto JPEG, PNG ou WebP válida.');
  if (file.type && file.type !== image.mimeType) throw new ApiError(400, 'INVALID_MEDIA', 'O tipo informado da foto não corresponde ao arquivo.');
  return { bytes, ...image };
}

type BucketConfig = { endpoint: URL; bucket: string; accessKeyId: string; secretAccessKey: string; region: string };

function bucketConfig(): BucketConfig {
  const configuration = env();
  if (!configuration.MEDIA_BUCKET_ENDPOINT || !configuration.MEDIA_BUCKET_NAME || !configuration.MEDIA_BUCKET_ACCESS_KEY_ID || !configuration.MEDIA_BUCKET_SECRET_ACCESS_KEY) {
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'O armazenamento privado de fotos não está configurado neste ambiente.');
  }
  return {
    endpoint: new URL(configuration.MEDIA_BUCKET_ENDPOINT),
    bucket: configuration.MEDIA_BUCKET_NAME,
    accessKeyId: configuration.MEDIA_BUCKET_ACCESS_KEY_ID,
    secretAccessKey: configuration.MEDIA_BUCKET_SECRET_ACCESS_KEY,
    region: configuration.MEDIA_BUCKET_REGION,
  };
}

const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const hmac = (key: Uint8Array | string, value: string) => createHmac('sha256', key).update(value).digest();
const awsEncode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

function s3Url(config: BucketConfig, key: string) {
  const url = new URL(config.endpoint.toString());
  url.hostname = `${config.bucket}.${url.hostname}`;
  url.pathname = `/${key.split('/').map(awsEncode).join('/')}`;
  return url;
}

async function signedRequest(method: 'PUT' | 'GET' | 'DELETE', key: string, body?: Uint8Array, contentType?: string): Promise<Response> {
  const config = bucketConfig();
  const url = s3Url(config, key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body ?? new Uint8Array());
  const headers: Record<string, string> = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  if (contentType) headers['content-type'] = contentType;
  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders.map((name) => `${name}:${headers[name]}\n`).join('');
  const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedHeaders.join(';'), payloadHash].join('\n');
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), config.region), 's3'), 'aws4_request');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders.join(';')}, Signature=${hmac(signingKey, stringToSign).toString('hex')}`;
  return fetch(url, { method, headers, body });
}

export async function putPrivateImage(key: string, image: SupportedImage) {
  let response: Response;
  try {
    response = await signedRequest('PUT', key, image.bytes, image.mimeType);
  } catch {
    throw new ApiError(502, 'MEDIA_STORAGE_FAILED', 'Não foi possível guardar a foto agora. Tente novamente.');
  }
  if (!response.ok) throw new ApiError(502, 'MEDIA_STORAGE_FAILED', 'Não foi possível guardar a foto agora. Tente novamente.');
}

export async function getPrivateImage(key: string, expectedMimeType: SupportedImage['mimeType']): Promise<SupportedImage> {
  let response: Response;
  try {
    response = await signedRequest('GET', key);
  } catch {
    throw new ApiError(502, 'MEDIA_STORAGE_FAILED', 'Não foi possível ler a foto agora. Tente novamente.');
  }
  if (!response.ok) throw new ApiError(502, 'MEDIA_STORAGE_FAILED', 'Não foi possível ler a foto agora. Tente novamente.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const detected = detectedImage(bytes);
  if (!detected || detected.mimeType !== expectedMimeType) throw new ApiError(502, 'MEDIA_CORRUPTED', 'A foto armazenada não é válida. Envie-a novamente.');
  return { bytes, ...detected };
}

export async function deletePrivateObject(key: string) {
  try { await signedRequest('DELETE', key); } catch { /* a captura pendente será limpa por retenção operacional */ }
}

export function privateImageKey(farmId: string, captureId: string, attachmentId: string, extension: SupportedImage['extension']) {
  return `assistant-captures/${farmId}/${captureId}/${attachmentId}.${extension}`;
}
