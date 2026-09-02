import { Router } from "express";
import { fileService } from "@/lib/services/file-service";
import { orphanedUploadCleanupSchema } from "@/lib/validation/files";
import { sendSuccess, parseWithSchema, asyncHandler } from "@/lib/api/route";

export const adminRouter = Router();

adminRouter.get("/", asyncHandler(async (_req, res) => {
  const workerRes = await fetch("http://localhost:4000/admin");
  const data = await workerRes.json();
  return res.json(data);
}));

adminRouter.get("/dlq", asyncHandler(async (_req, res) => {
  const workerRes = await fetch("http://localhost:4000/admin/dlq");
  return res.json(await workerRes.json());
}));

adminRouter.get("/job/:id", asyncHandler(async (req, res) => {
  try {
    const workerRes = await fetch(`http://localhost:4000/admin/job/${req.params.id}`);
    if (!workerRes.ok) {
      return res.status(500).json({ error: "Worker API failed" });
    }
    return res.json(await workerRes.json());
  } catch {
    return res.status(500).json({ error: "Worker not reachable" });
  }
}));

adminRouter.get("/preview/:id", asyncHandler(async (req, res) => {
  try {
    const workerRes = await fetch(`http://localhost:4000/preview/${req.params.id}`);
    if (!workerRes.ok) {
      return res.status(500).json({ error: "Preview failed" });
    }
    return res.json(await workerRes.json());
  } catch {
    return res.status(500).json({ error: "Worker not reachable" });
  }
}));

adminRouter.get("/retry/:id", asyncHandler(async (req, res) => {
  try {
    const workerRes = await fetch(`http://localhost:4000/admin/retry/${req.params.id}`);
    if (!workerRes.ok) {
      return res.status(500).json({ error: "Retry failed" });
    }
    return res.json(await workerRes.json());
  } catch {
    return res.status(500).json({ error: "Worker not reachable" });
  }
}));

adminRouter.get("/file-uploads/orphans", asyncHandler(async (req, res) => {
  const input = parseWithSchema(orphanedUploadCleanupSchema, req.query);
  const data = await fileService.cleanupOrphanedUploads(input);
  return sendSuccess(res, data);
}));

adminRouter.post("/file-uploads/orphans", asyncHandler(async (req, res) => {
  const input = parseWithSchema(orphanedUploadCleanupSchema, req.body);
  const data = await fileService.cleanupOrphanedUploads(input);
  return sendSuccess(res, data);
}));
