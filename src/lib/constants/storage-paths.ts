/**
 * Cloudflare R2 / S3 Storage Folders and Buckets Constants
 * Centralized registry for all storage paths across the application.
 */

export const STORAGE_BUCKETS = {
  /** Primary file uploads and deliverables bucket */
  DEFAULT: process.env.R2_BUCKET_NAME || "files",
  /** Static and brand assets bucket */
  ASSETS: process.env.ASSETS_BUCKET_NAME || "mitfloww-assets",
} as const;

export const STORAGE_FOLDERS = {
  // Brand & Motion Graphics
  MOTION_GRAPHICS_LOGIN: "assets/motion-graphics/login-page",
  MOTION_GRAPHICS: "assets/motion-graphics",
  BRAND_ASSETS: "assets/brand",

  // User Profile
  USERS_ROOT: "users",
  USER_PROFILE: "userprofile",
  USER_AVATAR_PREFIX: "userprofile/avatar_",
  COMPANY_LOGO_PREFIX: "userprofile/company_logo_",
  COMPANY_ROOT: "company",

  // Testimonials
  TESTIMONIALS: "testimonials",

  // Projects & Deliverables
  PROJECTS: "projects",
  FILES: "files",
  REVISIONS: "revisions",

  // Marketplace Assets
  ASSETS_ROOT: "assets",
  ASSET_FILES: "files",
  ASSET_PREVIEWS: "previews",
} as const;

/**
 * Helper to build public CDN URL or relative proxy for a given storage key.
 */
export function getStoragePublicUrl(storageKey: string, publicBaseUrl?: string): string {
  const base = publicBaseUrl || process.env.R2_PUBLIC_BASE_URL;
  if (base) {
    return `${base.replace(/\/+$/, "")}/${storageKey.replace(/^\/+/, "")}`;
  }
  return `/api/profile/media?key=${encodeURIComponent(storageKey)}`;
}
