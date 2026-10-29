import crypto from "crypto";
import { githubService } from "@/lib/services/github-service";
import { revisionComments } from "@/lib/db/schema";
import { storage } from "@/lib/storage";
import { contractService } from "@/lib/services/contract-service";
import { requestProjectUpdateBodySchema } from "@/lib/validation/projects";
import { emailService } from "@/lib/email/email-service";
import { createScopedLogger } from "@/lib/logger";
import { Router } from "express";
import { Readable } from "stream";
import { z } from "zod";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getRequestLocale } from "@/middleware/locale";
import { resolveActiveActor } from "@/lib/auth/active-actor";
import { projectService } from "@/lib/services/project-service";
import { fileService } from "@/lib/services/file-service";
import { db } from "@/lib/db/client";
import { authIdentities, fileVersions, files, projects, users } from "@/lib/db/schema";
import { DrizzleProjectRepository } from "@/lib/repositories/project-repository";
import {
  projectListQueryParamsSchema,
  projectMutationSchema,
  projectIdParamsSchema,
  projectShareEmailMutationSchema,
  projectShareLinkMutationSchema,
} from "@/lib/validation/projects";
import {
  projectFileReviewParamsSchema,
  projectFileVersionParamsSchema,
  finalDraftReportBodySchema,
  commitProjectFileVersionBodySchema,
  fileVersionReportBodySchema,
} from "@/lib/validation/file-review";
import { sendSuccess, parseWithSchema, asyncHandler } from "@/lib/api/route";
import { NotFoundAppError, AppError } from "@/lib/errors/app-error";
import { ProjectPaymentStatus } from "@/lib/dto/projects";

const scopedLogger = createScopedLogger("projects-route");

export const projectsRouter = Router();

async function getAuthorizedProject(identifier: string, actorId: string) {
  const project = await projectRepository.findByIdentifier(identifier);
  if (!project || project.userId !== actorId) {
    throw new NotFoundAppError("Project not found.");
  }
  return project;
}

function getClientAppBaseUrl(req: any): string | undefined {
  const origin = req.get("origin");
  if (origin && !origin.includes(":4001") && !origin.includes("mitfloww-api")) {
    return origin.trim().replace(/\/+$/, "");
  }

  const referer = req.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.port !== "4001" && !url.hostname.includes("mitfloww-api")) {
        return url.origin;
      }
    } catch {}
  }

  const forwardedHost = req.get("x-forwarded-host");
  if (
    forwardedHost &&
    !forwardedHost.includes(":4001") &&
    !forwardedHost.includes("mitfloww-api")
  ) {
    const proto =
      req.get("x-forwarded-proto") || (req.secure ? "https" : "http");
    return `${proto}://${forwardedHost}`.replace(/\/+$/, "");
  }

  return undefined;
}

const projectRepository = new DrizzleProjectRepository();

const projectMetricsQuerySchema = z
  .object({
    projectIds: z
      .string({
        invalid_type_error: "projectIds must be a string.",
      })
      .trim()
      .max(10_000, "projectIds is too long.")
      .optional(),
  })
  .strict();

function parseProjectIds(value: string | undefined) {
  if (!value) return [];
  const unique = new Set<string>();
  for (const candidate of value.split(",")) {
    const trimmed = candidate.trim();
    if (!trimmed || trimmed.length > 255) continue;
    unique.add(trimmed);
    if (unique.size >= 100) break;
  }
  return Array.from(unique);
}

projectsRouter.get("/", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const viewerLocale = getRequestLocale(req);
  const query = parseWithSchema(projectListQueryParamsSchema, req.query);
  const result = await projectService.listProjects({ ...query, userId: actor.id }, viewerLocale);

  return sendSuccess(res, result.items, {
    meta: {
      count: result.items.length,
      filters: {
        hasDeliverables: query.hasDeliverables ?? null,
        paymentStatus: query.paymentStatus ?? null,
        search: query.search ?? null,
      },
      pagination: result.pagination,
      sorting: {
        field: query.sort,
        order: query.order,
      },
    },
  });
}));

projectsRouter.post("/", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const requestLocale = getRequestLocale(req);
  const input = parseWithSchema(projectMutationSchema, req.body);
  const data = await projectService.createProject(input, {
    sourceLocale: requestLocale,
    viewerLocale: requestLocale,
    userId: actor.id,
  });

  return sendSuccess(res, data, { status: 201 });
}));

projectsRouter.get("/metrics", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const query = parseWithSchema(projectMetricsQuerySchema, req.query);
  const projectIdentifiers = parseProjectIds(query.projectIds);

  if (projectIdentifiers.length === 0) {
    return sendSuccess(res, []);
  }

  const resolvedProjects = await Promise.all(
    projectIdentifiers.map(async (identifier) => ({
      identifier,
      project: await projectRepository.findByIdentifier(identifier),
    })),
  );
  const projectIds = Array.from(
    new Set(
      resolvedProjects
        .map(({ project }) => (project?.userId === actor.id ? project?.id : null))
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (projectIds.length === 0) {
    return sendSuccess(res, []);
  }

  const rows = await db
    .select({
      projectId: files.projectId,
      total: sql<number>`cast(count(distinct ${files.id}) as int)`,
      totalSizeBytes: sql<number>`cast(coalesce(sum(coalesce(${fileVersions.sizeBytes}, ${files.sizeBytes})), 0) as bigint)`,
    })
    .from(files)
    .leftJoin(
      fileVersions,
      and(eq(fileVersions.fileId, files.id), isNull(fileVersions.deletedAt)),
    )
    .where(and(isNull(files.deletedAt), inArray(files.projectId, projectIds)))
    .groupBy(files.projectId);

  return sendSuccess(
    res,
    rows
      .filter((row) => row.projectId != null)
      .map((row) => ({
        projectId: row.projectId as string,
        totalDeliverablesCount: Number(row.total ?? 0),
        totalSizeBytes: Number(row.totalSizeBytes ?? 0),
      })),
  );
}));

projectsRouter.get("/reviews", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const projectsWithReviews = await projectService.getPaidProjectsWithReviews(actor.id);

  return res.json({
    items: projectsWithReviews.map(({ project, review }) => ({
      clientEmail: project.clientEmail,
      clientName: project.clientName,
      createdAt: project.createdAt.toISOString(),
      id: project.id,
      projectReviewId: review.id,
      rating: review.rating,
      reviewText: review.reviewText,
      sourceLocale: review.sourceLocale,
      submittedAt: review.submittedAt.toISOString(),
      title: project.title,
    })),
  });
}));


// ----------------------------------------------------
// GitHub OAuth & Repository Integration (Vercel-style)
// ----------------------------------------------------

/**
 * Check GitHub OAuth status for current actor
 */
projectsRouter.get("/github/status", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);

  const [userRecord] = await db
    .select({
      githubUsername: users.githubUsername,
      githubTokenCiphertext: users.githubTokenCiphertext,
    })
    .from(users)
    .where(eq(users.id, actor.id))
    .limit(1);

  return res.json({
    configured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    connected: Boolean(userRecord?.githubTokenCiphertext),
    username: userRecord?.githubUsername || null,
  });
}));

/**
 * Initiate GitHub OAuth authorization (Redirect to GitHub)
 */
projectsRouter.get("/github/connect", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId || !process.env.GITHUB_CLIENT_SECRET) {
    const redirectTarget =
      typeof req.query.redirect === "string" &&
      req.query.redirect.startsWith("/") &&
      !req.query.redirect.startsWith("//")
        ? req.query.redirect
        : "/projects";
    const separator = redirectTarget.includes("?") ? "&" : "?";
    return res.redirect(redirectTarget + separator + "github_error=oauth_not_configured");
  }

  // Generate cryptographically secure CSRF state
  const state = crypto.randomBytes(32).toString("hex");

  // Prevent Open Redirect: validate redirect is a relative path starting with /
  const rawRedirect = typeof req.query.redirect === "string" && req.query.redirect.startsWith("/") && !req.query.redirect.startsWith("//")
    ? req.query.redirect
    : "/projects";
  const separator = rawRedirect.includes("?") ? "&" : "?";
  const redirectTarget = `${rawRedirect}${separator}github_connected=1&modal=link_repo`;

  const isProd = process.env.NODE_ENV === "production";
  const isPopup = req.query.popup === "1";

  res.cookie("github_oauth_state", state, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000, // 10 minutes
    path: "/",
  });

  res.cookie("github_oauth_redirect", redirectTarget, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/",
  });

  if (isPopup) {
    res.cookie("github_oauth_popup", "1", {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
      path: "/",
    });
  }

  const forwardedHost = req.get("x-forwarded-host");
  const forwardedProto = req.get("x-forwarded-proto");
  const publicBase = (
    process.env.APP_URL ||
    (forwardedHost ? `${forwardedProto || "http"}://${forwardedHost}` : `${req.protocol}://${req.get("host")}`)
  ).replace(/\/+$/, "");

  const redirectUri = `${publicBase}/api/projects/github/callback`;
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,read:user&state=${state}`;

  return res.redirect(githubAuthUrl);
}));

/**
 * GitHub OAuth Callback
 */
projectsRouter.get("/github/callback", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);

  const { code, state, error: ghError, error_description } = req.query;

  // Clear state cookie regardless
  const cookieState = req.cookies?.github_oauth_state;
  const redirectTarget = req.cookies?.github_oauth_redirect || "/projects?github_connected=1&modal=link_repo";
  const isPopup = req.cookies?.github_oauth_popup === "1";

  res.clearCookie("github_oauth_state", { path: "/" });
  res.clearCookie("github_oauth_redirect", { path: "/" });
  res.clearCookie("github_oauth_popup", { path: "/" });

  if (ghError) {
    const errorMsg = typeof error_description === "string" ? error_description : "GitHub authorization denied.";
    if (isPopup) {
      return res.send(`<!DOCTYPE html>
<html>
<head><title>GitHub Authorization Error</title></head>
<body style="background:#0b0f17;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: "MITFLOWW_GITHUB_ERROR", error: ${JSON.stringify(errorMsg)} }, "*");
      window.close();
    } else {
      window.location.href = "${redirectTarget.includes("?") ? redirectTarget + "&" : redirectTarget + "?"}github_error=" + encodeURIComponent(${JSON.stringify(errorMsg)});
    }
  </script>
</body>
</html>`);
    }
    const sep = redirectTarget.includes("?") ? "&" : "?";
    return res.redirect(`${redirectTarget}${sep}github_error=${encodeURIComponent(errorMsg)}`);
  }

  if (!code || typeof code !== "string" || !state || typeof state !== "string" || state !== cookieState) {
    throw new AppError("Invalid or expired OAuth state (CSRF verification failed).", 403, "invalid_oauth_state");
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new AppError("GitHub OAuth not configured.", 500, "github_oauth_not_configured");
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "MitFloww-App",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  const tokenData = await tokenRes.json() as any;

  if (!tokenRes.ok || !tokenData.access_token) {
    const errorMsg = tokenData.error_description || "Failed to exchange GitHub authorization code.";
    throw new AppError(errorMsg, 400, "github_token_exchange_failed");
  }

  const accessToken = tokenData.access_token as string;

  // Fetch GitHub user profile
  const profileRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "MitFloww-App",
    },
  });

  if (!profileRes.ok) {
    throw new AppError("Failed to fetch GitHub profile with OAuth token.", 502, "github_profile_failed");
  }

  const ghProfile = await profileRes.json() as any;

  // Encrypt access token at rest using AES-256-GCM
  const encryptedToken = githubService.encryptToken(accessToken);

  // Update user with encrypted token and GitHub username
  await db
    .update(users)
    .set({
      githubTokenCiphertext: encryptedToken,
      githubUsername: ghProfile.login,
    })
    .where(eq(users.id, actor.id));

  // Also record auth identity
  try {
    await db
      .insert(authIdentities)
      .values({
        userId: actor.id,
        provider: "github",
        providerUserId: String(ghProfile.id),
        email: ghProfile.email || null,
        emailVerified: true,
      })
      .onConflictDoNothing();
  } catch {
    // Identity might already exist, continue safely
  }

  if (isPopup) {
    return res.send(`<!DOCTYPE html>
<html>
<head><title>GitHub Connected</title></head>
<body style="background:#0b0f17;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="text-align:center;padding:20px;">
    <p style="font-size:16px;font-weight:600;margin-bottom:8px;">Connected to GitHub!</p>
    <p style="font-size:13px;color:#94a3b8;margin:0;">Closing window and returning to MitFloww...</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: "MITFLOWW_GITHUB_CONNECTED", username: ${JSON.stringify(ghProfile.login)} }, "*");
      window.close();
    } else {
      window.location.href = ${JSON.stringify(redirectTarget)};
    }
  </script>
</body>
</html>`);
  }

  return res.redirect(redirectTarget);
}));

/**
 * Disconnect GitHub Account
 */
projectsRouter.post("/github/disconnect", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);

  await db
    .update(users)
    .set({
      githubTokenCiphertext: null,
      githubUsername: null,
    })
    .where(eq(users.id, actor.id));

  return sendSuccess(res, { message: "GitHub disconnected successfully." });
}));

const listGithubReposQuerySchema = z.object({
  user: z.string().trim().optional(),
  token: z.string().trim().optional(),
});

/**
 * Fetch Repositories:
 * - If actor has connected GitHub: loads user's repos automatically (including private!)
 * - If user parameter provided: loads that user's/org's public repos
 */
projectsRouter.get("/github-repos", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const input = parseWithSchema(listGithubReposQuerySchema, req.query);

  const [userRecord] = await db
    .select({
      githubUsername: users.githubUsername,
      githubTokenCiphertext: users.githubTokenCiphertext,
    })
    .from(users)
    .where(eq(users.id, actor.id))
    .limit(1);

  let connectedToken: string | undefined = undefined;
  if (userRecord?.githubTokenCiphertext) {
    try {
      connectedToken = githubService.decryptToken(userRecord.githubTokenCiphertext);
    } catch {
      // Token corrupted or session secret changed
    }
  }

  const effectiveToken = input.token?.trim() || connectedToken || undefined;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "MitFloww-App",
  };
  if (effectiveToken) {
    headers.Authorization = `Bearer ${effectiveToken}`;
  }

  let repos: any[] = [];
  let resolvedOwner = userRecord?.githubUsername || "";

  // Mode 1: Specific username / URL passed
  if (input.user && input.user.trim()) {
    const cleaned = input.user.replace(/^https?:\/\/github\.com\//i, "").replace(/\/+$/, "");
    const segments = cleaned.split("/").filter(Boolean);
    const owner = segments[0];

    if (!owner) {
      throw new AppError("Invalid GitHub username or URL.", 400, "invalid_github_user");
    }

    resolvedOwner = owner;

    // If specific repo was passed (e.g. owner/repo)
    if (segments.length >= 2) {
      const specificRepoUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(segments[1])}`;
      try {
        const specificRes = await fetch(specificRepoUrl, { headers });
        if (specificRes.ok) {
          const specificRepo = await specificRes.json();
          repos.push(specificRepo);
        }
      } catch {
        // Fallback
      }
    }

    const listUrl = `https://api.github.com/users/${encodeURIComponent(owner)}/repos?sort=updated&per_page=50`;
    const response = await fetch(listUrl, { headers });

    if (!response.ok) {
      if (response.status === 404 && repos.length === 0) {
        throw new AppError(`GitHub account or organization "${owner}" not found.`, 404, "github_user_not_found");
      }
      if (response.status === 403) {
        const msg = await response.text();
        if (msg.includes("rate limit")) {
          throw new AppError("GitHub API rate limit reached. Please connect your GitHub account or provide a token.", 429, "rate_limit_exceeded");
        }
      }
      if (repos.length === 0) {
        throw new AppError(`Failed to load GitHub repositories (${response.status}).`, 502, "github_api_error");
      }
    } else {
      const userRepos = await response.json();
      if (Array.isArray(userRepos)) {
        for (const r of userRepos) {
          if (!repos.some(existing => existing.id === r.id)) {
            repos.push(r);
          }
        }
      }
    }
  } else if (connectedToken) {
    // Mode 2: User is connected via GitHub OAuth - fetch user's own repos (including private!)
    const userReposUrl = "https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member";
    const response = await fetch(userReposUrl, { headers });

    if (!response.ok) {
      throw new AppError(`Failed to load your GitHub repositories (${response.status}).`, 502, "github_api_error");
    }

    const userRepos = await response.json();
    if (Array.isArray(userRepos)) {
      repos = userRepos;
    }
  }

  const formatted = repos.map((repo: any) => ({
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    html_url: repo.html_url,
    description: repo.description || null,
    default_branch: repo.default_branch || "main",
    language: repo.language || null,
    stargazers_count: repo.stargazers_count || 0,
    updated_at: repo.updated_at,
    private: Boolean(repo.private),
  }));

  return sendSuccess(res, {
    owner: resolvedOwner,
    connected: Boolean(connectedToken),
    username: userRecord?.githubUsername || null,
    repos: formatted,
  });
}));

projectsRouter.get("/:id", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const data = await projectService.getProjectById(params.id, viewerLocale, actor.id);
  return sendSuccess(res, data);
}));

projectsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const input = parseWithSchema(projectMutationSchema, req.body);
  const data = await projectService.updateProject(params.id, input, {
    sourceLocale: requestLocale,
    viewerLocale: requestLocale,
    userId: actor.id,
  });
  return sendSuccess(res, data);
}));

projectsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const data = await projectService.deleteProject(params.id, actor.id);
  return sendSuccess(res, data);
}));

projectsRouter.get("/:id/edit-locks", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const result = await projectService.getProjectEditLocks(params.id, actor.id);
  return sendSuccess(res, result);
}));

projectsRouter.get("/:id/review", asyncHandler(async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  const data = await projectService.getProjectClientReviewByProjectId(id);
  return sendSuccess(res, data);
}));

projectsRouter.get("/:id/share", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const baseUrl = getClientAppBaseUrl(req);
  const data = await projectService.getProjectShareComposer(params.id, {
    baseUrl,
    expiryDays: actor.clientShareLinkExpiryDays,
    userId: actor.id,
    viewerLocale,
  });
  return sendSuccess(res, data);
}));

projectsRouter.post("/:id/share", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const input = parseWithSchema(projectShareLinkMutationSchema, req.body);
  const baseUrl = getClientAppBaseUrl(req);
  const data = await projectService.mutateProjectShare(params.id, input, {
    baseUrl,
    expiryDays: actor.clientShareLinkExpiryDays,
    userId: actor.id,
    viewerLocale,
  });
  return sendSuccess(res, data);
}));

projectsRouter.patch("/:id/share", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const input = parseWithSchema(projectShareEmailMutationSchema, req.body);
  const data = await projectService.saveProjectShareClientEmail(
    params.id,
    input.shareClientEmail,
    viewerLocale,
    actor.id,
  );
  return sendSuccess(res, data);
}));

projectsRouter.post("/:id/request-testimonial-email", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const baseUrl = getClientAppBaseUrl(req);

  const project = await projectService.getProjectById(params.id, viewerLocale, actor.id);
  if (project.paymentStatus !== ProjectPaymentStatus.Paid) {
    throw new AppError("Testimonials can only be requested for paid projects.", 400, "project_not_paid");
  }

  const existingReview = await projectService.getProjectClientReviewByProjectId(params.id);
  if (existingReview) {
    throw new AppError("This project already has client feedback submitted.", 400, "project_already_reviewed");
  }

  const COOLDOWN_MS = 24 * 60 * 60 * 1000;
  if (project.testimonialRequestSentAt) {
    const elapsed = Date.now() - new Date(project.testimonialRequestSentAt).getTime();
    if (elapsed < COOLDOWN_MS) {
      const hoursRemaining = Math.max(1, Math.ceil((COOLDOWN_MS - elapsed) / (60 * 60 * 1000)));
      throw new AppError(
        `A testimonial request email was already sent for this project. Please wait ${hoursRemaining} hour${hoursRemaining === 1 ? "" : "s"} before sending another.`,
        429,
        "testimonial_request_cooldown"
      );
    }
  }

  const clientEmail = (req.body?.clientEmail || project.clientEmail || project.shareClientEmail || "").trim();
  if (!clientEmail) {
    throw new AppError("Client email is required to send testimonial request.", 400, "client_email_required");
  }

  const shareComposer = await projectService.getProjectShareComposer(params.id, {
    baseUrl,
    expiryDays: actor.clientShareLinkExpiryDays,
    userId: actor.id,
    viewerLocale,
  });

  const reviewUrl = `${baseUrl || "http://localhost:3000"}/s/${encodeURIComponent(shareComposer.shareDraft.shareToken)}/review`;

  await emailService.sendTestimonialRequestEmail({
    clientEmail,
    clientName: project.clientName || undefined,
    creatorName: actor.name || "Your creative partner",
    projectTitle: project.title,
    reviewUrl,
  });

  const sentAt = new Date();
  await projectService.recordTestimonialRequestSent(project.id, sentAt);

  scopedLogger.info("Testimonial request email dispatched", {
    recipient: clientEmail,
    projectId: project.id,
    projectTitle: project.title,
    actorId: actor.id,
    expiryDays: actor.clientShareLinkExpiryDays,
    testimonialRequestSentAt: sentAt.toISOString(),
  });

  return sendSuccess(res, {
    clientEmail,
    message: "Testimonial request email sent successfully.",
    reviewUrl,
    success: true,
    testimonialRequestSentAt: sentAt.toISOString(),
  });
}));

projectsRouter.delete("/:id/share", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const data = await projectService.clearProjectShareClientEmail(
    params.id,
    viewerLocale,
    actor.id,
  );
  return sendSuccess(res, data);
}));

projectsRouter.get("/:id/files/:fileId/review", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(projectFileReviewParamsSchema, req.params);
  const project = await getAuthorizedProject(params.id, actor.id);
  const result = await fileService.getFileReview({
    fileId: params.fileId,
    projectId: project.id,
    viewerLocale,
  });

  void (async () => {
    try {
      await db
        .update(projects)
        .set({ creatorLastViewedCommentsAt: new Date() })
        .where(eq(projects.id, project.id));
    } catch {}
  })();

  return sendSuccess(res, result);
}));

projectsRouter.get("/:id/files/:fileId/thumbnail", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const params = parseWithSchema(projectFileReviewParamsSchema, req.params);
  const project = await getAuthorizedProject(params.id, actor.id);
  const width = req.query.w ? Number(req.query.w) : undefined;
  const height = req.query.h ? Number(req.query.h) : undefined;

  const result = await fileService.getFileThumbnail(params.fileId, {
    projectId: project.id,
    width,
    height,
  });

  if (req.headers["if-none-match"] === result.etag) {
    return res.status(304).end();
  }

  res.setHeader("Content-Type", result.contentType);
  res.setHeader("Content-Length", String(result.buffer.length));
  res.setHeader("ETag", result.etag);
  res.setHeader("Cache-Control", "private, no-cache");
  res.setHeader("Vary", "Cookie, Authorization, Origin");

  return res.send(result.buffer);
}));

projectsRouter.get("/:id/files/:fileId/content", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const params = parseWithSchema(projectFileReviewParamsSchema, req.params);
  const project = await getAuthorizedProject(params.id, actor.id);
  const result = await fileService.getFileContent(params.fileId, {
    projectId: project.id,
  });

  res.setHeader("Content-Type", result.contentType);
  if (result.contentLength != null) {
    res.setHeader("Content-Length", String(result.contentLength));
  }
  if (result.etag) {
    res.setHeader("ETag", result.etag);
  }
  res.setHeader("Cache-Control", "private, no-cache");
  res.setHeader("Vary", "Cookie, Authorization, Origin");

  if (result.body instanceof Readable) {
    return result.body.pipe(res);
  } else if (result.body && typeof (result.body as any).getReader === "function") {
    return Readable.fromWeb(result.body as any).pipe(res);
  } else if (Buffer.isBuffer(result.body) || result.body instanceof Uint8Array) {
    return res.send(Buffer.from(result.body));
  } else {
    return res.send(result.body);
  }
}));

projectsRouter.post("/:id/files/:fileId/final-draft-report", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(projectFileReviewParamsSchema, req.params);
  const project = await getAuthorizedProject(params.id, actor.id);
  const input = parseWithSchema(finalDraftReportBodySchema, req.body);
  const data = await fileService.reportFinalDraft({
    fileId: params.fileId,
    message: input.message,
    projectId: project.id,
    reason: input.reason,
    sourceLocale: requestLocale,
  });
  return sendSuccess(res, data, { status: 201 });
}));

projectsRouter.post("/:id/files/:fileId/versions/commit", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(projectFileReviewParamsSchema, req.params);
  const project = await getAuthorizedProject(params.id, actor.id);
  const input = parseWithSchema(commitProjectFileVersionBodySchema, req.body);
  const idempotencyKeyBase = `commit:project:${project.id}:file:${params.fileId}:${input.files.map((f) => f.localFileId).join("|")}`;

  const data = await fileService.commitUploadedFileVersion(
    {
      allowLargeUploads: input.allowLargeUploads,
      fileId: params.fileId,
      files: input.files,
      isFinalDraft: input.isFinalDraft,
      useSoftWatermark: input.useSoftWatermark,
      projectId: project.id,
      revisionDescription: input.revisionDescription,
      sourceLocale: requestLocale,
      viewerLocale: requestLocale,
    },
    { idempotencyKeyBase },
  );

  return sendSuccess(res, data);
}));

projectsRouter.delete("/:id/files/:fileId/versions/:versionId", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const params = parseWithSchema(projectFileVersionParamsSchema, req.params);
  const project = await getAuthorizedProject(params.id, actor.id);
  const data = await fileService.deleteFileVersion({
    fileId: params.fileId,
    projectId: project.id,
    versionId: params.versionId,
  });
  return sendSuccess(res, data);
}));

projectsRouter.post("/:id/files/:fileId/versions/:versionId/report", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(projectFileVersionParamsSchema, req.params);
  const project = await getAuthorizedProject(params.id, actor.id);
  const input = parseWithSchema(fileVersionReportBodySchema, req.body);
  const data = await fileService.reportFileVersion({
    fileId: params.fileId,
    message: input.message,
    projectId: project.id,
    reason: input.reason,
    sourceLocale: requestLocale,
    versionId: params.versionId,
  });
  return sendSuccess(res, data, { status: 201 });
}));

projectsRouter.get("/:id/contract/pdf", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const project = await getAuthorizedProject(params.id, actor.id);
  const proposed = req.query.proposed === "true";
  const version = req.query.version ? parseInt(String(req.query.version), 10) : undefined;

  const { pdfBuffer, filename } = await contractService.getContractPdf({
    projectId: project.id,
    proposed,
    version,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.setHeader("Content-Length", String(pdfBuffer.length));
  res.setHeader("Cache-Control", "no-store, max-age=0");
  return res.send(pdfBuffer);
}));


projectsRouter.post("/:id/contract/request-update", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const project = await getAuthorizedProject(params.id, actor.id);
  const input = parseWithSchema(requestProjectUpdateBodySchema, req.body);

  const requestRecord = await contractService.requestProjectUpdate({
    projectId: project.id,
    userId: actor.id,
    changes: input,
  });

  return sendSuccess(res, requestRecord, { status: 201 });
}));

const linkRepositoryBodySchema = z.object({
  repoUrl: z.string().min(1, "Repository URL is required"),
  branch: z.string().trim().optional(),
  githubToken: z.string().trim().optional(),
  name: z.string().trim().max(120).optional(),
});

projectsRouter.post("/:id/repositories", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const project = await getAuthorizedProject(params.id, actor.id);
  const input = parseWithSchema(linkRepositoryBodySchema, req.body);

  const { owner, repo } = githubService.parseRepoUrl(input.repoUrl);

  // If no explicit token provided, use user's connected GitHub OAuth token if available
  let effectiveToken = input.githubToken?.trim() || undefined;
  if (!effectiveToken) {
    const [userRecord] = await db
      .select({ githubTokenCiphertext: users.githubTokenCiphertext })
      .from(users)
      .where(eq(users.id, actor.id))
      .limit(1);
    if (userRecord?.githubTokenCiphertext) {
      try {
        effectiveToken = githubService.decryptToken(userRecord.githubTokenCiphertext);
      } catch {
        // Fallback
      }
    }
  }
  const repoMeta = await githubService.verifyRepository(effectiveToken, owner, repo);
  const targetBranch = input.branch?.trim() || repoMeta.defaultBranch;

  const commit = await githubService.fetchLatestCommit(effectiveToken, owner, repo, targetBranch);
  const fileId = crypto.randomUUID();
  const defaultBucket = storage.getDefaultBucket();
  const storageKey = `projects/${project.id}/repos/${fileId}/rev-1-${commit.sha}.zip`;
  const estimatedSizeBytes = (repoMeta.sizeKb || 0) * 1024;

  const encryptedToken = effectiveToken ? githubService.encryptToken(effectiveToken) : null;
  const deliverableName = input.name?.trim() || repoMeta.name;

  const [createdFile] = await db
    .insert(files)
    .values({
      id: fileId,
      projectId: project.id,
      name: deliverableName,
      originalName: `${repoMeta.name}-${commit.shortSha}.zip`,
      mimeType: "application/zip",
      extension: "zip",
      sizeBytes: estimatedSizeBytes,
      storageKey,
      storageBucket: defaultBucket,
      fileKind: 1,
      repoOwner: owner,
      repoName: repoMeta.name,
      repoUrl: repoMeta.htmlUrl,
      repoBranch: targetBranch,
      githubTokenCiphertext: encryptedToken,
      isSyncFrozen: false,
      approvalStatus: "pending",
      uploadStatus: "uploaded",
    })
    .returning();

  const [createdVersion] = await db
    .insert(fileVersions)
    .values({
      fileId: createdFile.id,
      revisionNumber: 1,
      originalName: `${repoMeta.name}-${commit.shortSha}.zip`,
      mimeType: "application/zip",
      extension: "zip",
      sizeBytes: estimatedSizeBytes,
      storageBucket: defaultBucket,
      storageKey,
      commitHash: commit.sha,
      commitMessage: commit.commitMessage,
      committedAt: commit.committedAt,
      commitAuthor: commit.commitAuthor,
      previewUrl: project.deploymentUrl ?? null,
      processingStatus: "completed",
    })
    .returning();

  await db
    .update(files)
    .set({ currentVersionId: createdVersion.id })
    .where(eq(files.id, createdFile.id));

  // Asynchronously download repository snapshot and save to storage for offline archival
  // Deliverable linking is instant (< 300ms) and never blocks on large zipball downloads
  void (async () => {
    try {
      const { buffer, sizeBytes } = await githubService.downloadZipball(effectiveToken, owner, repo, commit.sha);
      await storage.uploadFile({
        bucket: defaultBucket,
        key: storageKey,
        body: buffer,
        contentType: "application/zip",
      });
      await db.update(files).set({ sizeBytes }).where(eq(files.id, fileId));
      await db.update(fileVersions).set({ sizeBytes }).where(eq(fileVersions.id, createdVersion.id));
      scopedLogger.info("Repository snapshot zip archived successfully", { fileId, commitSha: commit.sha, sizeBytes });
    } catch (archiveErr) {
      scopedLogger.warn("Non-fatal: Background repo zip archival deferred", {
        fileId,
        commitSha: commit.sha,
        error: archiveErr instanceof Error ? archiveErr.message : String(archiveErr),
      });
    }
  })();

  return sendSuccess(res, {
    file: {
      ...createdFile,
      currentVersionId: createdVersion.id,
    },
    version: createdVersion,
    commit,
  }, { status: 201 });
}));

projectsRouter.post("/:id/repositories/:fileId/sync", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const params = parseWithSchema(projectFileReviewParamsSchema, req.params);
  const project = await getAuthorizedProject(params.id, actor.id);

  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, params.fileId), eq(files.projectId, project.id)))
    .limit(1);

  if (!file) {
    throw new NotFoundAppError("Deliverable file not found.");
  }

  if (file.fileKind !== 1 || !file.repoOwner || !file.repoName || !file.repoBranch) {
    throw new AppError("This deliverable is not a linked code repository.", 400, "not_a_code_repo");
  }

  if (file.isSyncFrozen) {
    throw new AppError(
      "Repository synchronization is frozen because this milestone has already been approved by the client.",
      400,
      "sync_frozen"
    );
  }

  let token: string | null = null;
  if (file.githubTokenCiphertext) {
    token = githubService.decryptToken(file.githubTokenCiphertext);
  }

  const latestCommit = await githubService.fetchLatestCommit(token, file.repoOwner, file.repoName, file.repoBranch);

  const [currentVersion] = await db
    .select()
    .from(fileVersions)
    .where(eq(fileVersions.id, file.currentVersionId!))
    .limit(1);

  if (currentVersion && currentVersion.commitHash === latestCommit.sha) {
    return sendSuccess(res, {
      upToDate: true,
      message: "Repository deliverable is already up to date with the latest commit.",
      currentCommit: latestCommit,
      version: currentVersion,
    });
  }

  const nextRevisionNumber = (currentVersion?.revisionNumber ?? 0) + 1;
  const defaultBucket = storage.getDefaultBucket();
  const storageKey = `projects/${project.id}/repos/${file.id}/rev-${nextRevisionNumber}-${latestCommit.sha}.zip`;
  const estimatedSizeBytes = file.sizeBytes || 0;

  const [newVersion] = await db
    .insert(fileVersions)
    .values({
      fileId: file.id,
      revisionNumber: nextRevisionNumber,
      originalName: `${file.repoName}-${latestCommit.shortSha}.zip`,
      mimeType: "application/zip",
      extension: "zip",
      sizeBytes: estimatedSizeBytes,
      storageBucket: defaultBucket,
      storageKey,
      commitHash: latestCommit.sha,
      commitMessage: latestCommit.commitMessage,
      committedAt: latestCommit.committedAt,
      commitAuthor: latestCommit.commitAuthor,
      previewUrl: project.deploymentUrl ?? null,
      processingStatus: "completed",
    })
    .returning();

  await db
    .update(files)
    .set({
      currentVersionId: newVersion.id,
      originalName: `${file.repoName}-${latestCommit.shortSha}.zip`,
      storageKey,
      approvalStatus: "pending",
      updatedAt: new Date(),
    })
    .where(eq(files.id, file.id));

  // Background archival for the new commit zip
  void (async () => {
    try {
      const { buffer, sizeBytes } = await githubService.downloadZipball(token, file.repoOwner!, file.repoName!, latestCommit.sha);
      await storage.uploadFile({
        bucket: defaultBucket,
        key: storageKey,
        body: buffer,
        contentType: "application/zip",
      });
      await db.update(files).set({ sizeBytes }).where(eq(files.id, file.id));
      await db.update(fileVersions).set({ sizeBytes }).where(eq(fileVersions.id, newVersion.id));
      scopedLogger.info("Synced commit zip archived successfully", { fileId: file.id, commitSha: latestCommit.sha, sizeBytes });
    } catch (archiveErr) {
      scopedLogger.warn("Non-fatal: Background synced commit zip archival deferred", {
        fileId: file.id,
        commitSha: latestCommit.sha,
        error: archiveErr instanceof Error ? archiveErr.message : String(archiveErr),
      });
    }
  })();

  // Automatically mark all pending revision comments from previous version as resolved
  await db
    .update(revisionComments)
    .set({
      status: "resolved",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(revisionComments.fileId, file.id),
        eq(revisionComments.status, "pending"),
        isNull(revisionComments.deletedAt),
      ),
    );

  return sendSuccess(res, {
    upToDate: false,
    message: `Fetched new version (revision #${nextRevisionNumber}) with commit ${latestCommit.shortSha}.`,
    version: newVersion,
    commit: latestCommit,
  }, { status: 201 });
}));

projectsRouter.post("/:id/repositories/:fileId/unfreeze", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const params = parseWithSchema(projectFileReviewParamsSchema, req.params);
  const project = await getAuthorizedProject(params.id, actor.id);

  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, params.fileId), eq(files.projectId, project.id)))
    .limit(1);

  if (!file) {
    throw new NotFoundAppError("Deliverable file not found.");
  }

  await db
    .update(files)
    .set({ isSyncFrozen: false, updatedAt: new Date() })
    .where(eq(files.id, file.id));

  return sendSuccess(res, { success: true, isSyncFrozen: false });
}));
