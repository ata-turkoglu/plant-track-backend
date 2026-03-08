import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// NOTE(local-bucket): Local development uses a project-folder "bucket" implementation.
// TODO(production): Replace this adapter with a cloud object storage provider (S3/GCS/Azure Blob).
const LOCAL_BUCKET_ROOT = path.resolve(process.cwd(), process.env.LOCAL_BUCKET_ROOT ?? '../bucket');
const LOCAL_BUCKET_PUBLIC_BASE_PATH = normalizePublicBasePath(process.env.LOCAL_BUCKET_PUBLIC_BASE_PATH ?? '/api/public/files');

const IMAGE_MIME_TO_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif'
};

function normalizePublicBasePath(value) {
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

function normalizeObjectKey(value) {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .trim();
}

function resolveObjectPath(objectKey) {
  const key = normalizeObjectKey(objectKey);
  if (!key) throw new Error('Invalid bucket object key');

  const absolutePath = path.resolve(LOCAL_BUCKET_ROOT, key);
  const rootWithSep = LOCAL_BUCKET_ROOT.endsWith(path.sep) ? LOCAL_BUCKET_ROOT : `${LOCAL_BUCKET_ROOT}${path.sep}`;
  if (!(absolutePath === LOCAL_BUCKET_ROOT || absolutePath.startsWith(rootWithSep))) {
    throw new Error('Unsafe bucket object path');
  }

  return { key, absolutePath };
}

export function getLocalBucketRootDir() {
  return LOCAL_BUCKET_ROOT;
}

export function getLocalBucketPublicBasePath() {
  return LOCAL_BUCKET_PUBLIC_BASE_PATH;
}

export async function ensureLocalBucketRootDir() {
  await fs.mkdir(LOCAL_BUCKET_ROOT, { recursive: true });
}

export function buildLocalBucketPublicUrl(objectKey) {
  const key = normalizeObjectKey(objectKey);
  if (!key) return null;
  return `${LOCAL_BUCKET_PUBLIC_BASE_PATH}/${key}`;
}

export function parseLocalBucketObjectKeyFromPublicUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let pathOnly = trimmed;
  try {
    pathOnly = new URL(trimmed).pathname;
  } catch {
    // Relative URL path is expected in local development.
  }

  if (!pathOnly.startsWith('/')) pathOnly = `/${pathOnly}`;
  const pathWithoutQuery = pathOnly.split('?')[0].split('#')[0];
  const prefix = `${LOCAL_BUCKET_PUBLIC_BASE_PATH}/`;
  if (!pathWithoutQuery.startsWith(prefix)) return null;

  const key = normalizeObjectKey(decodeURIComponent(pathWithoutQuery.slice(prefix.length)));
  return key || null;
}

export function isLocalBucketPublicUrl(value) {
  return parseLocalBucketObjectKeyFromPublicUrl(value) != null;
}

export async function writeBufferToLocalBucket({ objectKey, buffer }) {
  const { key, absolutePath } = resolveObjectPath(objectKey);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return key;
}

export async function deleteLocalBucketObjectIfExists(objectKey) {
  const { absolutePath } = resolveObjectPath(objectKey);
  try {
    await fs.unlink(absolutePath);
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
  }
}

export async function deleteLocalBucketObjectByPublicUrl(value) {
  const key = parseLocalBucketObjectKeyFromPublicUrl(value);
  if (!key) return false;
  return deleteLocalBucketObjectIfExists(key);
}

export function decodeBase64ImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const extension = IMAGE_MIME_TO_EXTENSION[mimeType];
  if (!extension) return null;

  const base64Payload = match[2].replace(/\s+/g, '');
  const buffer = Buffer.from(base64Payload, 'base64');
  if (!buffer.length) return null;

  return { mimeType, extension, buffer };
}

export async function storeDataImageUrlInLocalBucket({ organizationId, scope, entityId, dataUrl }) {
  const decoded = decodeBase64ImageDataUrl(dataUrl);
  if (!decoded) return null;

  const normalizedScope = normalizeObjectKey(scope || 'misc');
  const normalizedEntity = normalizeObjectKey(entityId || 'unknown').replace(/\//g, '-');
  const fileName = `${normalizedEntity}-${Date.now()}-${randomUUID()}.${decoded.extension}`;
  const objectKey = [
    `org-${organizationId}`,
    normalizedScope,
    fileName
  ].join('/');

  await writeBufferToLocalBucket({ objectKey, buffer: decoded.buffer });
  return {
    objectKey,
    publicUrl: buildLocalBucketPublicUrl(objectKey),
    mimeType: decoded.mimeType,
    sizeBytes: decoded.buffer.length
  };
}
