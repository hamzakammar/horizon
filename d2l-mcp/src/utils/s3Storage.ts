/**
 * Shared S3 helpers for browser storage state persistence.
 * Used by BrowserSessionManager (VNC flow) and sessionRefresher (headless auto-refresh).
 */

import path from "path";
import os from "os";
import fs from "fs/promises";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const S3_BUCKET = process.env.S3_BUCKET || "study-mcp-notes";
const S3_REGION = process.env.AWS_REGION || "us-east-1";

const s3 = new S3Client({ region: S3_REGION });

/** Download browser storage state from S3. Returns local temp path or undefined if not found. */
export async function loadStorageStateFromS3(userId: string): Promise<string | undefined> {
  const key = `browser-state/${userId}/storage-state.json`;
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    const body = await res.Body?.transformToString();
    if (!body) return undefined;
    const tmpPath = path.join(os.tmpdir(), `browser-state-${userId}.json`);
    await fs.writeFile(tmpPath, body);
    console.error(`[S3] Loaded browser storage state for user ${userId}`);
    return tmpPath;
  } catch (e: any) {
    if (e?.name === "NoSuchKey") {
      console.error(`[S3] No saved browser state for user ${userId}`);
    } else {
      console.error(`[S3] Failed to load browser state: ${e?.message}`);
    }
    return undefined;
  }
}

/** Upload full browser storage state to S3 (persists ADFS + D2L cookies). */
export async function saveStorageStateToS3(userId: string, statePath: string): Promise<void> {
  const key = `browser-state/${userId}/storage-state.json`;
  try {
    const body = await fs.readFile(statePath, "utf-8");
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: "application/json",
    }));
    console.error(`[S3] Saved browser storage state for user ${userId}`);
  } catch (e: any) {
    console.error(`[S3] Failed to save browser state: ${e?.message}`);
  }
}
