import type { Request } from "express";
import { getProjectShareSessionCookieName } from "@/lib/security/project-share-session";
import { projectService } from "@/lib/services/project-service";

export async function requireAuthorizedShareProject(req: Request, shareToken: string) {
  const sessionCookie = req.cookies?.[getProjectShareSessionCookieName()] ?? null;
  return projectService.requireProjectShareAccess(shareToken, sessionCookie);
}
