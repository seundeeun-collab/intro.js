import fs from 'fs/promises';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

const LOCAL_STORE = path.resolve('content-store');

function s3ClientFromEnv() {
  const region = process.env.AWS_REGION;
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !region) return null;
  return new S3Client({ region });
}

export async function saveContent(key, html, opts = {}) {
  const s3 = s3ClientFromEnv();
  if (s3 && opts.bucket) {
    const command = new PutObjectCommand({ Bucket: opts.bucket, Key: key, Body: html, ContentType: 'text/html' });
    await s3.send(command);
    return { storage: 's3', bucket: opts.bucket, key };
  }

  // fallback to local disk persistence
  await fs.mkdir(LOCAL_STORE, { recursive: true });
  const target = path.join(LOCAL_STORE, key.replace(/[^a-z0-9\-_.]/gi, '_'));
  await fs.writeFile(target, html, 'utf8');
  return { storage: 'disk', path: target };
}

export async function loadContent(key, opts = {}) {
  const s3 = s3ClientFromEnv();
  if (s3 && opts.bucket) {
    const command = new GetObjectCommand({ Bucket: opts.bucket, Key: key });
    const resp = await s3.send(command);
    if (resp.Body) return streamToString(resp.Body);
    throw new Error('S3 object had no body');
  }
  const target = path.join(LOCAL_STORE, key.replace(/[^a-z0-9\-_.]/gi, '_'));
  return fs.readFile(target, 'utf8');
}

export default { saveContent, loadContent };
