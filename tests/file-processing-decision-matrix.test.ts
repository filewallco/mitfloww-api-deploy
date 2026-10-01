import test from "node:test";
import assert from "node:assert/strict";
import {
  isWatermarkableUploadExtension,
  isSoftWatermarkSupported,
  isWorkerSupportedUploadExtension,
  isDangerousUploadExtension,
  isAudioExtension,
  isTextExtension,
  isArchiveExtension,
} from "../src/config/upload";
import {
  calculateWatermarkCreditCost,
} from "../src/lib/credits/calculator";
import {
  validateStoredUploadObject,
} from "../src/lib/uploads/upload-object-validation";

// Emulate determineFileProcessingPlan from file-service.ts to test decision logic directly
function determineFileProcessingPlan(input: {
  allowLargeUploads: boolean;
  extension: string;
  sizeBytes: number;
  watermarkEnabled: boolean;
  useSoftWatermark?: boolean;
  isFinalDraft?: boolean;
}) {
  const isFinalDraft = Boolean(input.isFinalDraft);
  const watermarkable = isWatermarkableUploadExtension(input.extension);

  const effectiveWatermarkEnabled = watermarkable && Boolean(input.watermarkEnabled);
  const effectiveUseSoftWatermark =
    effectiveWatermarkEnabled &&
    Boolean(input.useSoftWatermark) &&
    isSoftWatermarkSupported(input.extension);

  const needsWorkerWatermark = effectiveWatermarkEnabled && !effectiveUseSoftWatermark;

  const isWorkerSupported = isWorkerSupportedUploadExtension(input.extension);
  const shouldQueue =
    isWorkerSupported &&
    (needsWorkerWatermark ||
      isFinalDraft ||
      input.allowLargeUploads);

  return {
    effectiveWatermarkEnabled,
    effectiveUseSoftWatermark,
    needsWorkerWatermark,
    shouldQueueProcessing: shouldQueue,
    willChargeWatermarkCredits: Boolean(needsWorkerWatermark && !isFinalDraft),
  };
}

test("Decision Matrix: Image (.jpg)", () => {
  // 1. Watermark OFF
  const off = determineFileProcessingPlan({
    allowLargeUploads: false,
    extension: ".jpg",
    sizeBytes: 1024,
    watermarkEnabled: false,
    useSoftWatermark: false,
  });
  assert.equal(off.effectiveWatermarkEnabled, false);
  assert.equal(off.shouldQueueProcessing, false);
  assert.equal(off.willChargeWatermarkCredits, false);

  // 2. Watermark ON + Soft Watermark OFF
  const full = determineFileProcessingPlan({
    allowLargeUploads: false,
    extension: ".jpg",
    sizeBytes: 1024,
    watermarkEnabled: true,
    useSoftWatermark: false,
  });
  assert.equal(full.effectiveWatermarkEnabled, true);
  assert.equal(full.effectiveUseSoftWatermark, false);
  assert.equal(full.needsWorkerWatermark, true);
  assert.equal(full.shouldQueueProcessing, true);
  assert.equal(full.willChargeWatermarkCredits, true);

  // 3. Watermark ON + Soft Watermark ON
  const soft = determineFileProcessingPlan({
    allowLargeUploads: false,
    extension: ".jpg",
    sizeBytes: 1024,
    watermarkEnabled: true,
    useSoftWatermark: true,
  });
  assert.equal(soft.effectiveWatermarkEnabled, true);
  assert.equal(soft.effectiveUseSoftWatermark, true);
  assert.equal(soft.needsWorkerWatermark, false);
  assert.equal(soft.shouldQueueProcessing, false);
  assert.equal(soft.willChargeWatermarkCredits, false);
});

test("Decision Matrix: Video (.mp4)", () => {
  // 1. Watermark OFF
  const off = determineFileProcessingPlan({
    allowLargeUploads: false,
    extension: ".mp4",
    sizeBytes: 5000,
    watermarkEnabled: false,
    useSoftWatermark: false,
  });
  assert.equal(off.effectiveWatermarkEnabled, false);
  assert.equal(off.shouldQueueProcessing, false);
  assert.equal(off.willChargeWatermarkCredits, false);

  // 2. Watermark ON + Soft Watermark OFF
  const full = determineFileProcessingPlan({
    allowLargeUploads: false,
    extension: ".mp4",
    sizeBytes: 5000,
    watermarkEnabled: true,
    useSoftWatermark: false,
  });
  assert.equal(full.effectiveWatermarkEnabled, true);
  assert.equal(full.effectiveUseSoftWatermark, false);
  assert.equal(full.needsWorkerWatermark, true);
  assert.equal(full.shouldQueueProcessing, true);
  assert.equal(full.willChargeWatermarkCredits, true);

  // 3. Watermark ON + Soft Watermark ON
  const soft = determineFileProcessingPlan({
    allowLargeUploads: false,
    extension: ".mp4",
    sizeBytes: 5000,
    watermarkEnabled: true,
    useSoftWatermark: true,
  });
  assert.equal(soft.effectiveWatermarkEnabled, true);
  assert.equal(soft.effectiveUseSoftWatermark, true);
  assert.equal(soft.needsWorkerWatermark, false);
  assert.equal(soft.shouldQueueProcessing, false);
  assert.equal(soft.willChargeWatermarkCredits, false);
});

test("Decision Matrix: PDF (.pdf)", () => {
  // 1. Watermark OFF
  const off = determineFileProcessingPlan({
    allowLargeUploads: false,
    extension: ".pdf",
    sizeBytes: 2000,
    watermarkEnabled: false,
    useSoftWatermark: false,
  });
  assert.equal(off.effectiveWatermarkEnabled, false);
  assert.equal(off.shouldQueueProcessing, false);
  assert.equal(off.willChargeWatermarkCredits, false);

  // 2. Watermark ON + Soft Watermark OFF
  const full = determineFileProcessingPlan({
    allowLargeUploads: false,
    extension: ".pdf",
    sizeBytes: 2000,
    watermarkEnabled: true,
    useSoftWatermark: false,
  });
  assert.equal(full.effectiveWatermarkEnabled, true);
  assert.equal(full.effectiveUseSoftWatermark, false);
  assert.equal(full.needsWorkerWatermark, true);
  assert.equal(full.shouldQueueProcessing, true);
  assert.equal(full.willChargeWatermarkCredits, true);

  // 3. Watermark ON + Soft Watermark ON
  const soft = determineFileProcessingPlan({
    allowLargeUploads: false,
    extension: ".pdf",
    sizeBytes: 2000,
    watermarkEnabled: true,
    useSoftWatermark: true,
  });
  assert.equal(soft.effectiveWatermarkEnabled, true);
  assert.equal(soft.effectiveUseSoftWatermark, true);
  assert.equal(soft.needsWorkerWatermark, false);
  assert.equal(soft.shouldQueueProcessing, false);
  assert.equal(soft.willChargeWatermarkCredits, false);
});

test("Decision Matrix: Audio (.mp3, .wav, .m4a)", () => {
  assert.equal(isAudioExtension(".mp3"), true);
  assert.equal(isAudioExtension(".wav"), true);
  assert.equal(isAudioExtension(".ogg"), true);
  assert.equal(isAudioExtension(".m4a"), true);
  assert.equal(isAudioExtension(".aac"), true);
  assert.equal(isAudioExtension(".flac"), true);

  // Audio does NOT support soft watermark
  assert.equal(isSoftWatermarkSupported(".mp3"), false);
  assert.equal(isSoftWatermarkSupported(".wav"), false);
  assert.equal(isSoftWatermarkSupported(".m4a"), false);

  // Audio IS watermarkable
  assert.equal(isWatermarkableUploadExtension(".mp3"), true);

  // 1. Audio + Watermark OFF
  const off = determineFileProcessingPlan({
    allowLargeUploads: false,
    extension: ".mp3",
    sizeBytes: 4000,
    watermarkEnabled: false,
    useSoftWatermark: false,
  });
  assert.equal(off.effectiveWatermarkEnabled, false);
  assert.equal(off.effectiveUseSoftWatermark, false);
  assert.equal(off.needsWorkerWatermark, false);
  assert.equal(off.shouldQueueProcessing, false);
  assert.equal(off.willChargeWatermarkCredits, false);

  // 2. Audio + Watermark ON + Soft Watermark OFF -> Worker processing
  const on = determineFileProcessingPlan({
    allowLargeUploads: false,
    extension: ".mp3",
    sizeBytes: 4000,
    watermarkEnabled: true,
    useSoftWatermark: false,
  });
  assert.equal(on.effectiveWatermarkEnabled, true);
  assert.equal(on.effectiveUseSoftWatermark, false);
  assert.equal(on.needsWorkerWatermark, true);
  assert.equal(on.shouldQueueProcessing, true);
  assert.equal(on.willChargeWatermarkCredits, true);

  // 3. Audio + Watermark ON + Soft Watermark ON -> STILL Worker processing, NOT soft watermark!
  const onWithSoft = determineFileProcessingPlan({
    allowLargeUploads: false,
    extension: ".mp3",
    sizeBytes: 4000,
    watermarkEnabled: true,
    useSoftWatermark: true,
  });
  assert.equal(onWithSoft.effectiveWatermarkEnabled, true);
  assert.equal(onWithSoft.effectiveUseSoftWatermark, false); // Audio NEVER soft-watermarks
  assert.equal(onWithSoft.needsWorkerWatermark, true);
  assert.equal(onWithSoft.shouldQueueProcessing, true);
  assert.equal(onWithSoft.willChargeWatermarkCredits, true);
});

test("Decision Matrix: TXT (.txt) must NEVER be watermarked", () => {
  assert.equal(isTextExtension(".txt"), true);
  assert.equal(isWatermarkableUploadExtension(".txt"), false);
  assert.equal(isSoftWatermarkSupported(".txt"), false);

  // 1. Watermark OFF
  const off = determineFileProcessingPlan({
    allowLargeUploads: false,
    extension: ".txt",
    sizeBytes: 500,
    watermarkEnabled: false,
    useSoftWatermark: false,
  });
  assert.equal(off.effectiveWatermarkEnabled, false);
  assert.equal(off.shouldQueueProcessing, false);
  assert.equal(off.willChargeWatermarkCredits, false);

  // 2. Watermark ON
  const on = determineFileProcessingPlan({
    allowLargeUploads: false,
    extension: ".txt",
    sizeBytes: 500,
    watermarkEnabled: true,
    useSoftWatermark: false,
  });
  assert.equal(on.effectiveWatermarkEnabled, false);
  assert.equal(on.shouldQueueProcessing, false);
  assert.equal(on.willChargeWatermarkCredits, false);

  // 3. Watermark ON + Soft Watermark ON
  const onSoft = determineFileProcessingPlan({
    allowLargeUploads: false,
    extension: ".txt",
    sizeBytes: 500,
    watermarkEnabled: true,
    useSoftWatermark: true,
  });
  assert.equal(onSoft.effectiveWatermarkEnabled, false);
  assert.equal(onSoft.effectiveUseSoftWatermark, false);
  assert.equal(onSoft.shouldQueueProcessing, false);
  assert.equal(onSoft.willChargeWatermarkCredits, false);
});

test("Decision Matrix: ZIP (.zip) must NEVER be watermarked", () => {
  assert.equal(isArchiveExtension(".zip"), true);
  assert.equal(isWatermarkableUploadExtension(".zip"), false);
  assert.equal(isSoftWatermarkSupported(".zip"), false);

  // 1. Watermark OFF
  const off = determineFileProcessingPlan({
    allowLargeUploads: false,
    extension: ".zip",
    sizeBytes: 50000,
    watermarkEnabled: false,
    useSoftWatermark: false,
  });
  assert.equal(off.effectiveWatermarkEnabled, false);
  assert.equal(off.shouldQueueProcessing, false);
  assert.equal(off.willChargeWatermarkCredits, false);

  // 2. Watermark ON
  const on = determineFileProcessingPlan({
    allowLargeUploads: false,
    extension: ".zip",
    sizeBytes: 50000,
    watermarkEnabled: true,
    useSoftWatermark: false,
  });
  assert.equal(on.effectiveWatermarkEnabled, false);
  assert.equal(on.shouldQueueProcessing, false);
  assert.equal(on.willChargeWatermarkCredits, false);

  // 3. Watermark ON + Soft Watermark ON
  const onSoft = determineFileProcessingPlan({
    allowLargeUploads: false,
    extension: ".zip",
    sizeBytes: 50000,
    watermarkEnabled: true,
    useSoftWatermark: true,
  });
  assert.equal(onSoft.effectiveWatermarkEnabled, false);
  assert.equal(onSoft.effectiveUseSoftWatermark, false);
  assert.equal(onSoft.shouldQueueProcessing, false);
  assert.equal(onSoft.willChargeWatermarkCredits, false);
});

test("Mixed Batch Upload: 6 files uploaded together evaluate independently", () => {
  const batchSettings = {
    useSoftWatermark: true, // Batch toggle is ON
    allowLargeUploads: false,
  };

  const file1Image = determineFileProcessingPlan({
    ...batchSettings,
    extension: ".jpg",
    sizeBytes: 1024,
    watermarkEnabled: true,
  });
  // Image: watermark ON, soft watermark supported -> use soft watermark, NO worker processing, NO credits
  assert.equal(file1Image.effectiveWatermarkEnabled, true);
  assert.equal(file1Image.effectiveUseSoftWatermark, true);
  assert.equal(file1Image.shouldQueueProcessing, false);
  assert.equal(file1Image.willChargeWatermarkCredits, false);

  const file2Video = determineFileProcessingPlan({
    ...batchSettings,
    useSoftWatermark: false, // Per-file soft watermark disabled
    extension: ".mp4",
    sizeBytes: 20000,
    watermarkEnabled: true,
  });
  // Video: watermark ON, soft watermark OFF -> send to Worker, charge credits
  assert.equal(file2Video.effectiveWatermarkEnabled, true);
  assert.equal(file2Video.effectiveUseSoftWatermark, false);
  assert.equal(file2Video.shouldQueueProcessing, true);
  assert.equal(file2Video.willChargeWatermarkCredits, true);

  const file3Pdf = determineFileProcessingPlan({
    ...batchSettings,
    extension: ".pdf",
    sizeBytes: 5000,
    watermarkEnabled: false, // Per-file watermark OFF
  });
  // PDF: watermark OFF -> no processing, no credits
  assert.equal(file3Pdf.effectiveWatermarkEnabled, false);
  assert.equal(file3Pdf.effectiveUseSoftWatermark, false);
  assert.equal(file3Pdf.shouldQueueProcessing, false);
  assert.equal(file3Pdf.willChargeWatermarkCredits, false);

  const file4Audio = determineFileProcessingPlan({
    ...batchSettings,
    extension: ".mp3",
    sizeBytes: 15000,
    watermarkEnabled: true, // Per-file watermark ON
  });
  // Audio: watermark ON, soft watermark ON in batch -> Audio does NOT support soft watermark!
  // MUST route to Worker processing and charge credits!
  assert.equal(file4Audio.effectiveWatermarkEnabled, true);
  assert.equal(file4Audio.effectiveUseSoftWatermark, false);
  assert.equal(file4Audio.shouldQueueProcessing, true);
  assert.equal(file4Audio.willChargeWatermarkCredits, true);

  const file5Zip = determineFileProcessingPlan({
    ...batchSettings,
    extension: ".zip",
    sizeBytes: 80000,
    watermarkEnabled: true,
  });
  // ZIP: NEVER watermarked
  assert.equal(file5Zip.effectiveWatermarkEnabled, false);
  assert.equal(file5Zip.effectiveUseSoftWatermark, false);
  assert.equal(file5Zip.shouldQueueProcessing, false);
  assert.equal(file5Zip.willChargeWatermarkCredits, false);

  const file6Txt = determineFileProcessingPlan({
    ...batchSettings,
    extension: ".txt",
    sizeBytes: 300,
    watermarkEnabled: true,
  });
  // TXT: NEVER watermarked
  assert.equal(file6Txt.effectiveWatermarkEnabled, false);
  assert.equal(file6Txt.effectiveUseSoftWatermark, false);
  assert.equal(file6Txt.shouldQueueProcessing, false);
  assert.equal(file6Txt.willChargeWatermarkCredits, false);
});

test("Audio Credits: calculateWatermarkCreditCost does not discount audio with soft watermark", () => {
  // Image with soft watermark gets 50% discount
  const imageFullCost = calculateWatermarkCreditCost({
    currency: "USD",
    mediaType: "image",
    planKey: "pro",
    isSoftWatermark: false,
  });
  const imageSoftCost = calculateWatermarkCreditCost({
    currency: "USD",
    mediaType: "image",
    planKey: "pro",
    isSoftWatermark: true,
  });
  assert.equal(imageSoftCost <= imageFullCost, true);

  // Audio watermark cost
  const audioCost = calculateWatermarkCreditCost({
    currency: "USD",
    mediaType: "audio",
    planKey: "pro",
    durationMinutes: 5,
    isSoftWatermark: false,
  });
  assert.equal(audioCost > 0, true);

  // Audio with isSoftWatermark: true must NOT receive discount because soft watermark is not supported
  const audioCostAttemptSoft = calculateWatermarkCreditCost({
    currency: "USD",
    mediaType: "audio",
    planKey: "pro",
    durationMinutes: 5,
    isSoftWatermark: true,
  });
  assert.equal(audioCostAttemptSoft, audioCost);
});

test("Upload Security: Validates Audio, rejects dangerous files", () => {
  // Dangerous files are rejected
  assert.equal(isDangerousUploadExtension(".exe"), true);
  assert.equal(isDangerousUploadExtension(".bat"), true);
  assert.equal(isDangerousUploadExtension(".sh"), true);
  assert.equal(isDangerousUploadExtension(".cmd"), true);

  // Executable file validation in validateStoredUploadObject
  const exeResult = validateStoredUploadObject({
    extension: ".exe",
    headerBytes: new Uint8Array([0x4d, 0x5a, 0x90, 0x00]),
    mimeType: "application/x-msdownload",
    storedContentType: "application/x-msdownload",
  });
  assert.equal(exeResult.ok, false);

  // Audio MP3 with ID3 tag signature
  const mp3Result = validateStoredUploadObject({
    extension: ".mp3",
    headerBytes: new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]), // "ID3"
    mimeType: "audio/mpeg",
    storedContentType: "audio/mpeg",
  });
  assert.equal(mp3Result.ok, true);

  // Audio WAV with RIFF WAVE signature
  const wavBytes = new Uint8Array(12);
  wavBytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  wavBytes.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
  const wavResult = validateStoredUploadObject({
    extension: ".wav",
    headerBytes: wavBytes,
    mimeType: "audio/wav",
    storedContentType: "audio/wav",
  });
  assert.equal(wavResult.ok, true);

  // TXT file (no magic signature required, but allowed)
  const txtResult = validateStoredUploadObject({
    extension: ".txt",
    headerBytes: Buffer.from("Hello plain text world!"),
    mimeType: "text/plain",
    storedContentType: "text/plain",
  });
  assert.equal(txtResult.ok, true);

  // TXT file containing malicious HTML/Script blocked by magic check
  const maliciousTxt = validateStoredUploadObject({
    extension: ".txt",
    headerBytes: Buffer.from("<script>alert(1)</script>"),
    mimeType: "text/plain",
    storedContentType: "text/plain",
  });
  assert.equal(maliciousTxt.ok, false);
});

test("Worker Audio Processing: FFmpeg watermarks audio idempotently without touching original", async () => {
  const { execFileSync } = await import("child_process");
  const fsPromises = await import("fs/promises");
  const path = await import("path");
  const os = await import("os");

  const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "mitfloww-audio-test-"));
  const inputAudio = path.join(tempDir, "original.mp3");
  const outputBase = path.join(tempDir, "processed");
  const watermarkAudio = "E:/MitFloww/worker/assets/watermark-audio.mp3";

  // Create a 5-second sine wave audio
  execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=5", "-c:a", "libmp3lame", "-b:a", "128k", inputAudio]);
  const originalStat = await fsPromises.stat(inputAudio);
  const originalSize = originalStat.size;

  // Process audio
  const { processAudio } = await import("../../worker/src/processors/audio");
  const result1 = await processAudio(inputAudio, outputBase, { watermarkAudioPath: watermarkAudio });
  assert.equal(result1.ext, ".mp3");

  const processedStat1 = await fsPromises.stat(result1.outputPath);
  assert.equal(processedStat1.size > 0, true);

  // Original file remains 100% intact and unchanged
  const afterStat = await fsPromises.stat(inputAudio);
  assert.equal(afterStat.size, originalSize);

  // Idempotency: re-running processAudio overwrites cleanly without error and preserves original
  const result2 = await processAudio(inputAudio, outputBase, { watermarkAudioPath: watermarkAudio });
  assert.equal(result2.outputPath, result1.outputPath);
  const afterStat2 = await fsPromises.stat(inputAudio);
  assert.equal(afterStat2.size, originalSize);

  // Cleanup
  await fsPromises.rm(tempDir, { recursive: true, force: true });
});

test("File Review Representation Selection: Chooses processed vs original correctly", () => {
  function resolveDisplayLocation(version: {
    storageBucket: string;
    storageKey: string;
    mimeType: string;
    extension: string;
    processedStorageBucket?: string | null;
    processedStorageKey?: string | null;
    processedMimeType?: string | null;
    processedExtension?: string | null;
  }) {
    const hasProcessed = Boolean(version.processedStorageBucket && version.processedStorageKey);
    return {
      bucket: hasProcessed ? version.processedStorageBucket! : version.storageBucket,
      key: hasProcessed ? version.processedStorageKey! : version.storageKey,
      mimeType: hasProcessed && version.processedMimeType ? version.processedMimeType : version.mimeType,
      extension: hasProcessed && version.processedExtension ? version.processedExtension : version.extension,
      isProcessed: hasProcessed,
    };
  }

  // Audio with watermark ON and completed worker processing
  const audioWatermarked = resolveDisplayLocation({
    storageBucket: "raw-bucket",
    storageKey: "users/u1/files/f1/orig.mp3",
    mimeType: "audio/mpeg",
    extension: ".mp3",
    processedStorageBucket: "processed-bucket",
    processedStorageKey: "users/u1/files/f1/processed.mp3",
    processedMimeType: "audio/mpeg",
    processedExtension: ".mp3",
  });
  assert.equal(audioWatermarked.isProcessed, true);
  assert.equal(audioWatermarked.key, "users/u1/files/f1/processed.mp3");

  // Audio with watermark OFF
  const audioUnwatermarked = resolveDisplayLocation({
    storageBucket: "raw-bucket",
    storageKey: "users/u1/files/f1/orig.mp3",
    mimeType: "audio/mpeg",
    extension: ".mp3",
    processedStorageBucket: null,
    processedStorageKey: null,
  });
  assert.equal(audioUnwatermarked.isProcessed, false);
  assert.equal(audioUnwatermarked.key, "users/u1/files/f1/orig.mp3");

  // TXT (always original)
  const txtFile = resolveDisplayLocation({
    storageBucket: "raw-bucket",
    storageKey: "users/u1/files/f1/orig.txt",
    mimeType: "text/plain",
    extension: ".txt",
    processedStorageBucket: null,
    processedStorageKey: null,
  });
  assert.equal(txtFile.isProcessed, false);
  assert.equal(txtFile.key, "users/u1/files/f1/orig.txt");

  // ZIP (always original)
  const zipFile = resolveDisplayLocation({
    storageBucket: "raw-bucket",
    storageKey: "users/u1/files/f1/orig.zip",
    mimeType: "application/zip",
    extension: ".zip",
    processedStorageBucket: null,
    processedStorageKey: null,
  });
  assert.equal(zipFile.isProcessed, false);
  assert.equal(zipFile.key, "users/u1/files/f1/orig.zip");
});
