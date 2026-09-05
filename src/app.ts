import { resolvePublicAppBaseUrl } from "@/lib/services/project-service";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { localeMiddleware } from "@/middleware/locale";
import { errorHandler } from "@/middleware/error-handler";

import { healthRouter } from "@/routes/health";
import { usersRouter } from "@/routes/users";
import { profileRouter } from "@/routes/profile";
import { authRouter } from "@/routes/auth";
import { actorStorage } from "@/lib/auth/active-actor";
import { verifySessionToken } from "@/lib/auth/session";
import { DEFAULT_CREDIT_OWNER_ID } from "@/lib/credits/config/ledger";
import { plansRouter } from "@/routes/plans";
import { creditsRouter } from "@/routes/credits";
import { storageRouter } from "@/routes/storage";
import { cronRouter } from "@/routes/cron";
import { adminRouter } from "@/routes/admin";
import { i18nRouter } from "@/routes/i18n";
import { notificationsRouter } from "@/routes/notifications";
import { testimonialsRouter } from "@/routes/testimonials";
import { fileProcessingRouter } from "@/routes/file-processing";
import { fileUploadsRouter } from "@/routes/file-uploads";
import { projectsRouter } from "@/routes/projects";
import { filesRouter } from "@/routes/files";
import { shareLinksRouter } from "@/routes/share-links";

export const app = express();

// Trust proxy for reverse proxy from web/Next.js
app.set("trust proxy", true);

// Enable CORS
app.use(
  cors({
    credentials: true,
    origin: true,
  }),
);

// Cookie parser
app.use(cookieParser());

// Session authentication context middleware
app.use((req, _res, next) => {
  let userId = DEFAULT_CREDIT_OWNER_ID;
  const sessionCookie = req.cookies?.mitfloww_session;
  if (sessionCookie) {
    const verified = verifySessionToken(sessionCookie);
    if (verified) {
      userId = verified;
    }
  }
  actorStorage.run({ userId }, () => next());
});

// Raw body parser for binary/multipart uploads
app.use(
  express.raw({
    type: [
      "application/octet-stream",
      "video/*",
      "image/*",
      "application/pdf",
      "application/zip",
    ],
    limit: "500mb",
  }),
);

// Standard JSON body parser
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Locale detection middleware
app.use(localeMiddleware);

// Mount API routes under /api
const api = express.Router();

api.use("/health", healthRouter);
api.use("/users", usersRouter);
api.use("/profile", profileRouter);
api.use("/auth", authRouter);
api.use("/plans", plansRouter);
api.use("/credits", creditsRouter);
api.use("/storage", storageRouter);
api.use("/cron", cronRouter);
api.use("/admin", adminRouter);
api.use("/i18n", i18nRouter);
api.use("/notifications", notificationsRouter);
api.use("/testimonials", testimonialsRouter);
api.use("/file-processing", fileProcessingRouter);
api.use("/file-uploads", fileUploadsRouter);
api.use("/projects", projectsRouter);
api.use("/files", filesRouter);
api.use("/share-links", shareLinksRouter);

// Redirect client share links opened directly on API host to the frontend web app
app.get("/s/:token", (req, res) => {
  const origin = req.get("origin") || req.get("referer");
  const webBaseUrl = resolvePublicAppBaseUrl(origin);
  return res.redirect(302, `${webBaseUrl}/s/${encodeURIComponent(req.params.token)}`);
});

app.use("/api", api);

// Global error handler
app.use(errorHandler);
