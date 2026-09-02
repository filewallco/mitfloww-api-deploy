import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { localeMiddleware } from "@/middleware/locale";
import { errorHandler } from "@/middleware/error-handler";

import { healthRouter } from "@/routes/health";
import { usersRouter } from "@/routes/users";
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

app.use("/api", api);

// Global error handler
app.use(errorHandler);
