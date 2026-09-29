import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { LocalStorage, verifyLocalSignature } from "../src/lib/storage/local";
import { getStoragePublicUrl } from "../src/lib/constants/storage-paths";

test("LocalStorage: saves file to disk in bucket/key folder structure and reads back", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mitfloww-storage-test-"));
  process.env.LOCAL_STORAGE_PATH = tempDir;
  process.env.STORAGE_PROVIDER = "local";

  const storage = new LocalStorage();
  const bucket = "test-bucket";
  const key = "users/usr_123/projects/prj_456/files/fil_789/revisions/r001/original/sample.pdf";
  const fileContent = Buffer.from("%PDF-1.4 test document content");

  // 1. Upload
  const uploadResult = await storage.uploadFile({
    bucket,
    key,
    body: fileContent,
    contentType: "application/pdf",
  });
  assert.equal(uploadResult.bucket, bucket);
  assert.equal(uploadResult.key, key);

  // Verify file exists on local system disk at exact path
  const expectedDiskPath = path.join(tempDir, bucket, key);
  const diskStats = await fs.stat(expectedDiskPath);
  assert.equal(diskStats.size, fileContent.length);

  // 2. Head
  const head = await storage.headFile({ bucket, key });
  assert.equal(head.exists, true);
  assert.equal(head.contentLength, fileContent.length);
  assert.equal(head.contentType, "application/pdf");

  // 3. Get file
  const file = await storage.getFile({ bucket, key });
  assert.equal(file.contentLength, fileContent.length);
  assert.equal(file.contentType, "application/pdf");

  const chunks: Buffer[] = [];
  for await (const chunk of file.body as any) {
    chunks.push(Buffer.from(chunk));
  }
  const downloaded = Buffer.concat(chunks);
  assert.deepEqual(downloaded, fileContent);

  // 4. List files with prefix
  const listed = await storage.listFiles({
    bucket,
    prefix: "users/usr_123/projects/prj_456",
  });
  assert.equal(listed.objects.length, 1);
  assert.equal(listed.objects[0].key, key);
  assert.equal(listed.objects[0].sizeBytes, fileContent.length);

  // 5. Delete file
  const deleteResult = await storage.deleteFile({ bucket, key });
  assert.equal(deleteResult.deleted, true);

  const headAfterDelete = await storage.headFile({ bucket, key });
  assert.equal(headAfterDelete.exists, false);

  // Cleanup
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("LocalStorage: multipart upload lifecycle (create, upload parts, complete)", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mitfloww-storage-multipart-"));
  process.env.LOCAL_STORAGE_PATH = tempDir;
  process.env.STORAGE_PROVIDER = "local";

  const storage = new LocalStorage();
  const bucket = "test-bucket";
  const key = "users/usr_test/deliverables/video.mp4";

  // 1. Create multipart
  const init = await storage.createMultipartUpload({ bucket, key, contentType: "video/mp4" });
  assert.ok(init.uploadId);

  // 2. Upload part 1 & part 2
  const part1Data = Buffer.from("Part1-Data-Chunk-");
  const part2Data = Buffer.from("Part2-Data-Chunk-Ending");

  const p1 = await storage.uploadMultipartPart({
    bucket,
    key,
    uploadId: init.uploadId,
    partNumber: 1,
    body: part1Data,
    contentLength: part1Data.length,
  });
  assert.equal(p1.partNumber, 1);

  const p2 = await storage.uploadMultipartPart({
    bucket,
    key,
    uploadId: init.uploadId,
    partNumber: 2,
    body: part2Data,
    contentLength: part2Data.length,
  });
  assert.equal(p2.partNumber, 2);

  // 3. Complete multipart
  const complete = await storage.completeMultipartUpload({
    bucket,
    key,
    uploadId: init.uploadId,
    parts: [
      { partNumber: 1, etag: p1.etag },
      { partNumber: 2, etag: p2.etag },
    ],
  });
  assert.equal(complete.key, key);

  // 4. Verify combined content
  const result = await storage.getFile({ bucket, key });
  const chunks: Buffer[] = [];
  for await (const chunk of result.body as any) {
    chunks.push(Buffer.from(chunk));
  }
  const combined = Buffer.concat(chunks);
  assert.equal(combined.toString("utf8"), "Part1-Data-Chunk-Part2-Data-Chunk-Ending");

  // Cleanup
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("verifyLocalSignature: authenticates signed URLs and rejects expired/tampered", () => {
  const storage = new LocalStorage();
  const bucket = "test-bucket";
  const key = "users/usr_1/avatar.webp";

  // Valid URL
  const signedPayload = (storage as any).createAuthenticatedUrl("download", bucket, key, 300);
  const validUrl = new URL(signedPayload);
  assert.equal(verifyLocalSignature(validUrl), true);

  // Expired URL
  const expiredUrl = new URL(signedPayload);
  expiredUrl.searchParams.set("expiresAt", String(Math.floor(Date.now() / 1000) - 60));
  assert.equal(verifyLocalSignature(expiredUrl), false);

  // Tampered key
  const tamperedUrl = new URL(signedPayload);
  tamperedUrl.searchParams.set("key", "users/usr_OTHER/avatar.webp");
  assert.equal(verifyLocalSignature(tamperedUrl), false);

  // Tampered signature
  const fakeSigUrl = new URL(signedPayload);
  fakeSigUrl.searchParams.set("signature", "invalid-signature-hash");
  assert.equal(verifyLocalSignature(fakeSigUrl), false);
});

test("getStoragePublicUrl: returns local media endpoint when STORAGE_PROVIDER is local", () => {
  const origProvider = process.env.STORAGE_PROVIDER;
  const origR2Url = process.env.R2_PUBLIC_BASE_URL;

  try {
    process.env.STORAGE_PROVIDER = "local";
    process.env.R2_PUBLIC_BASE_URL = "https://pub-mock-r2.cloudflarestorage.com";

    const localUrl = getStoragePublicUrl("users/usr_123/testimonials/review.webp");
    assert.equal(localUrl, "/api/profile/media?key=users%2Fusr_123%2Ftestimonials%2Freview.webp");

    // When server mode, uses R2 public URL
    process.env.STORAGE_PROVIDER = "server";
    const serverUrl = getStoragePublicUrl("users/usr_123/testimonials/review.webp");
    assert.equal(serverUrl, "https://pub-mock-r2.cloudflarestorage.com/users/usr_123/testimonials/review.webp");
  } finally {
    process.env.STORAGE_PROVIDER = origProvider;
    process.env.R2_PUBLIC_BASE_URL = origR2Url;
  }
});
