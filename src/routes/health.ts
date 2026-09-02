import { Router } from "express";
import { db } from "@/lib/db/client";
import { sql, eq } from "drizzle-orm";
import { healthChecks } from "@/lib/db/schema";
import { sendSuccess, asyncHandler } from "@/lib/api/route";

export const healthRouter = Router();

healthRouter.get("/", asyncHandler(async (_req, res) => {
  await db.execute(sql`SELECT 1`);
  return sendSuccess(res, {
    status: "ok",
    db: "connected",
    schema: "mitfloww",
    timestamp: new Date().toISOString(),
  });
}));

healthRouter.get("/db", asyncHandler(async (_req, res) => {
  // CREATE
  const inserted = await db
    .insert(healthChecks)
    .values({ message: "health-check" })
    .returning();

  const record = inserted[0];
  if (!record) {
    throw new Error("Insert failed");
  }

  // READ
  const fetched = await db
    .select()
    .from(healthChecks)
    .where(eq(healthChecks.id, record.id));

  // DELETE
  await db.delete(healthChecks).where(eq(healthChecks.id, record.id));

  return sendSuccess(res, {
    status: "ok",
    steps: {
      create: true,
      read: fetched.length > 0,
      delete: true,
    },
    schema: "mitfloww",
  });
}));
