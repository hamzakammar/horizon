/**
 * S3 presigned upload URLs for note PDFs.
 * Requires AWS_REGION, S3_BUCKET. Optional AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY for local.
 */

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const region = process.env.AWS_REGION ?? process.env.S3_REGION;
const bucket = process.env.S3_BUCKET;

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    if (!region || !bucket) {
      throw new Error("S3 not configured: set AWS_REGION and S3_BUCKET");
    }
    client = new S3Client({ region });
  }
  return client;
}

export function isS3Configured(): boolean {
  return Boolean(region && bucket);
}

export function getBucket(): string {
  if (!bucket) throw new Error("S3_BUCKET not set");
  return bucket;
}

/**
 * Generate presigned PUT URL for upload. Key = users/{userId}/notes/{uuid}-{filename}.
 */
export async function presignUpload(
  userId: string,
  filename: string,
  contentType: string,
  sizeBytes: number
): Promise<{ uploadUrl: string; s3Key: string }> {
  const { randomUUID } = await import("node:crypto");
  const ext = filename.replace(/^.*\./, "") || "pdf";
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const s3Key = `users/${userId}/notes/${randomUUID()}-${safeName}`;

  const cmd = new PutObjectCommand({
    Bucket: getBucket(),
    Key: s3Key,
    ContentType: contentType,
    ContentLength: sizeBytes,
  });

  const uploadUrl = await getSignedUrl(getClient(), cmd, { expiresIn: 900 });
  return { uploadUrl, s3Key };
}

/**
 * Fetch object from S3 as Buffer (for process endpoint).
 */
export async function getObjectBuffer(s3Key: string): Promise<Buffer | null> {
  try {
    const cmd = new GetObjectCommand({ Bucket: getBucket(), Key: s3Key });
    const out = await getClient().send(cmd);
    const body = out.Body;
    if (!body) return null;
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}
