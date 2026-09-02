export type TestimonialEditorProps = {
  testimonialId: string;
  initialTestimonial: TestimonialRecord;
};

export const TESTIMONIAL_STATUSES = [
  "draft",
  "saved",
  "published",
  "archived",
] as const;

export type TestimonialStatus = (typeof TESTIMONIAL_STATUSES)[number];

export const TestimonialStatus = {
  Draft: TESTIMONIAL_STATUSES[0],
  Saved: TESTIMONIAL_STATUSES[1],
  Published: TESTIMONIAL_STATUSES[2],
  Archived: TESTIMONIAL_STATUSES[3],
} as const satisfies Record<string, TestimonialStatus>;

export const TESTIMONIAL_TEMPLATE_SCOPES = ["system", "user"] as const;

export type TestimonialTemplateScope =
  (typeof TESTIMONIAL_TEMPLATE_SCOPES)[number];

export const TestimonialTemplateScope = {
  System: TESTIMONIAL_TEMPLATE_SCOPES[0],
  User: TESTIMONIAL_TEMPLATE_SCOPES[1],
} as const satisfies Record<string, TestimonialTemplateScope>;

export const TESTIMONIAL_TEMPLATE_ACCESS_LEVELS = [
  "free",
  "premium",
] as const;

export type TestimonialTemplateAccessLevel =
  (typeof TESTIMONIAL_TEMPLATE_ACCESS_LEVELS)[number];

export const TestimonialTemplateAccessLevel = {
  Free: TESTIMONIAL_TEMPLATE_ACCESS_LEVELS[0],
  Premium: TESTIMONIAL_TEMPLATE_ACCESS_LEVELS[1],
} as const satisfies Record<string, TestimonialTemplateAccessLevel>;

export const TESTIMONIAL_CANVAS_PRESETS = [
  "square",
  "portrait",
  "story",
  "landscape",
  "linkedin",
] as const;

export type TestimonialCanvasPresetId =
  (typeof TESTIMONIAL_CANVAS_PRESETS)[number];

export const TestimonialCanvasPreset = {
  Square: TESTIMONIAL_CANVAS_PRESETS[0],
  Portrait: TESTIMONIAL_CANVAS_PRESETS[1],
  Story: TESTIMONIAL_CANVAS_PRESETS[2],
  Landscape: TESTIMONIAL_CANVAS_PRESETS[3],
  Linkedin: TESTIMONIAL_CANVAS_PRESETS[4],
} as const satisfies Record<string, TestimonialCanvasPresetId>;

export type TestimonialExportFormat = "png" | "jpeg" | "webp";

export const TESTIMONIAL_BINDING_KEYS = [
  "client.name",
  "client.avatar",
  "client.initials",
  "client.company",
  "client.role",
  "client.email",
  "project.name",
  "project.client",
  "project.completedAt",
  "review.text",
  "review.comment",
  "review.rating",
  "review.submittedAt",
] as const;

export type TestimonialBindingKey =
  (typeof TESTIMONIAL_BINDING_KEYS)[number];

export const TESTIMONIAL_ELEMENT_TYPES = [
  "text",
  "image",
  "logo",
  "shape",
  "rating",
  "watermark",
] as const;

export type TestimonialElementType =
  (typeof TESTIMONIAL_ELEMENT_TYPES)[number];

export type TestimonialBackground = {
  color: string;
  image?: string | null;
  overlayColor?: string | null;
  type: "solid" | "gradient";
  secondaryColor?: string | null;
};

export type TestimonialCanvasMetadata = {
  accentColor: string;
  cardColor: string;
  fontFamily: string;
  mutedTextColor: string;
  surfaceColor: string;
  textColor: string;
};

type TestimonialElementBase = {
  binding?: TestimonialBindingKey;
  height: number;
  id: string;
  name?: string;
  hidden?: boolean;
  locked?: boolean;
  opacity?: number;
  rotation: number;
  width: number;
  x: number;
  y: number;
  zIndex: number;
};

export type TestimonialTextElement = TestimonialElementBase & {
  align: "left" | "center" | "right";
  fontFamily: string;
  fontSize: number;
  fontStyle?: "normal" | "bold" | "italic" | "bold italic";
  lineHeight: number;
  text: string;
  type: "text";
  fill: string;
  letterSpacing?: number;
};

export type TestimonialImageElement = TestimonialElementBase & {
  alt: string;
  borderRadius: number;
  fit: "cover" | "contain";
  fallbackLabel?: string;
  source: string | null;
  stroke?: string;
  strokeWidth?: number;
  type: "image";
};

export type TestimonialLogoElement = TestimonialElementBase & {
  backgroundColor?: string;
  borderRadius: number;
  label: string;
  source: string | null;
  textColor: string;
  type: "logo";
};

export type TestimonialShapeElement = TestimonialElementBase & {
  fill: string;
  radius?: number;
  shape: "rect" | "circle" | "triangle" | "line" | "arrow" | "star" | "polygon";
  stroke?: string;
  strokeWidth?: number;
  type: "shape";
};

export type TestimonialRatingElement = TestimonialElementBase & {
  emptyStarColor: string;
  maxRating: number;
  starColor: string;
  starSize: number;
  type: "rating";
  value: number;
};

export type TestimonialWatermarkElement = TestimonialElementBase & {
  color: string;
  fontSize: number;
  text: string;
  type: "watermark";
};

export type TestimonialCanvasElement =
  | TestimonialTextElement
  | TestimonialImageElement
  | TestimonialLogoElement
  | TestimonialShapeElement
  | TestimonialRatingElement
  | TestimonialWatermarkElement;

export type TestimonialCanvasDocument = {
  background: TestimonialBackground;
  elements: TestimonialCanvasElement[];
  metadata: TestimonialCanvasMetadata;
  presetId: TestimonialCanvasPresetId;
};

// ─── Template preview/customize capability ────────────────────────────────
export type TestimonialTemplateCapabilityLevel = "free" | "paid" | "premium" | "disabled";

// ─── Color palette driven by template config ──────────────────────────────
export type TestimonialTemplatePalette = {
  /** Unique id within the template, e.g. "ocean" */
  id: string;
  /** Human-readable label, e.g. "Ocean" */
  label: string;
  /** Primary background color */
  backgroundColor: string;
  /** Secondary/gradient stop */
  secondaryColor: string;
  /** Accent color applied to interactive elements */
  accentColor: string;
  /** Card/surface color */
  cardColor: string;
  /** Main text color */
  textColor: string;
  /** Muted text color */
  mutedTextColor: string;
  /** Who can access this palette */
  capability?: TestimonialTemplateCapabilityLevel;
};

// ─── Template family (groups variations) ─────────────────────────────────
export type TestimonialTemplateFamily = {
  /** Unique family id, e.g. "modern-gradient" */
  id: string;
  /** Display label, e.g. "Modern Gradient" */
  label: string;
  /** Ordered list of template IDs that belong to this family */
  variationIds: string[];
};

export type TestimonialTemplate = {
  accessLevel: TestimonialTemplateAccessLevel;
  category: string;
  canvas: TestimonialCanvasDocument;
  description: string;
  id: string;
  isDefault: boolean;
  name: string;
  presetId: TestimonialCanvasPresetId;
  scope: TestimonialTemplateScope;
  tags: string[];
  /** Which template family this variation belongs to */
  familyId?: string;
  /** Short label shown in the variation selector, e.g. "Modern Gradient" */
  variationLabel?: string;
  /** Ordered list of color palettes available for this template */
  palettes?: TestimonialTemplatePalette[];
  /** Who can preview this template */
  previewCapability?: TestimonialTemplateCapabilityLevel;
  /** Who can customize this template */
  customizeCapability?: TestimonialTemplateCapabilityLevel;
  /** Credit cost to customize (0 = free) */
  creditCost?: number;
};

// ─── Review item type (returned by /api/projects/reviews) ─────────────────
export type TestimonialReviewItem = {
  id: string;
  projectName: string;
  title: string;
  clientName: string;
  clientEmail: string;
  clientAvatarUrl?: string | null;
  clientCompanyName?: string | null;
  clientRole?: string | null;
  rating: number;
  projectReviewId: string;
  reviewText: string;
  submittedAt: string;
  createdAt?: string;
};

export type TestimonialReviewBinding = {
  comment: string;
  rating: number;
  submittedAt: string | null;
  text: string;
};

export type TestimonialClientBinding = {
  avatarUrl: string | null;
  companyName: string | null;
  email: string | null;
  initials: string;
  name: string;
  role: string | null;
};

export type TestimonialProjectBinding = {
  completedAt: string | null;
  id: string;
  name: string;
};

export type TestimonialBindingSource = {
  client: TestimonialClientBinding;
  project: TestimonialProjectBinding;
  review: TestimonialReviewBinding;
};

export type TestimonialBindingValues = Record<
  TestimonialBindingKey,
  string | number | null
>;

export type TestimonialRevisionReason =
  | "autosave"
  | "manual"
  | "duplicate"
  | "publish"
  | "template-change";

export type TestimonialRevisionRecord = {
  canvas: TestimonialCanvasDocument;
  createdAt: string;
  id: string;
  reason: TestimonialRevisionReason;
  testimonialId: string;
  title: string;
};

export type TestimonialRecord = {
  bindingSource: TestimonialBindingSource | null;
  canvas: TestimonialCanvasDocument;
  createdAt: string;
  id: string;
  lastSavedAt: string;
  presetId: TestimonialCanvasPresetId;
  previewDataUrl: string | null;
  projectId: string | null;
  reviewId: string | null;
  slug: string;
  status: TestimonialStatus;
  templateId: string;
  templateScope: TestimonialTemplateScope;
  templateSnapshot: TestimonialTemplate | null;
  title: string;
  updatedAt: string;
  userId: string;
};

export type TestimonialStoreSnapshot = {
  revisionsByTestimonialId: Record<string, TestimonialRevisionRecord[]>;
  testimonials: TestimonialRecord[];
  userTemplates: TestimonialTemplate[];
};

export type TestimonialListItem = TestimonialRecord;

export const DEFAULT_TESTIMONIAL_TITLE_PREFIX = "Testimonial Design";

function canonicalizeTitle(value: string | undefined | null) {
  if (!value) return "";
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function stripTitleSequence(value: string) {
  const canonical = canonicalizeTitle(value);
  const match = canonical.match(/^(.*?)(?:\s+#(\d+))?$/);

  return {
    sequence: match?.[2] ? Number(match[2]) : null,
    stem: canonicalizeTitle(match?.[1] ?? canonical),
  };
}

function toTitleSequence(value: number) {
  return String(value).padStart(3, "0");
}

export function createUniqueTestimonialTitle(
  requestedTitle: string | undefined,
  existingTitles: readonly string[],
  fallbackPrefix = DEFAULT_TESTIMONIAL_TITLE_PREFIX,
) {
  const candidate = canonicalizeTitle(requestedTitle ?? "");
  const fallback = canonicalizeTitle(fallbackPrefix) || DEFAULT_TESTIMONIAL_TITLE_PREFIX;
  const preferredBase = candidate.length > 0 ? candidate : `${fallback} #001`;
  const { stem } = stripTitleSequence(preferredBase);
  const matchingSequences = new Set<number>();
  let exactMatch = false;

  for (const title of existingTitles) {
    const canonicalExisting = canonicalizeTitle(title);
    const strippedExisting = stripTitleSequence(canonicalExisting);

    if (strippedExisting.stem.toLowerCase() !== stem.toLowerCase()) {
      continue;
    }

    if (canonicalExisting.toLowerCase() === preferredBase.toLowerCase()) {
      exactMatch = true;
    }

    if (strippedExisting.sequence != null) {
      matchingSequences.add(strippedExisting.sequence);
    }
  }

  if (candidate.length > 0 && !exactMatch && matchingSequences.size === 0) {
    return preferredBase;
  }

  let nextSequence = 1;

  while (matchingSequences.has(nextSequence)) {
    nextSequence += 1;
  }

  return `${stem} #${toTitleSequence(nextSequence)}`;
}

export function createDefaultTestimonialTitle(existingTitles: readonly string[]) {
  return createUniqueTestimonialTitle("", existingTitles);
}

export function normalizeTestimonialTitle(value: string | undefined | null) {
  return canonicalizeTitle(value);
}

export function createTestimonialSlug(title: string, existingSlugs: readonly string[]) {
  const base = canonicalizeTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const preferred = base.length > 0 ? base : "testimonial";
  if (!existingSlugs.includes(preferred)) {
    return preferred;
  }

  let suffix = 2;
  while (existingSlugs.includes(`${preferred}-${suffix}`)) {
    suffix += 1;
  }

  return `${preferred}-${suffix}`;
}

export function getElementZIndex(elements: TestimonialCanvasElement[]) {
  return elements.reduce((max, element) => Math.max(max, element.zIndex), 0);
}

export function cloneCanvasDocument(document: TestimonialCanvasDocument) {
  return JSON.parse(JSON.stringify(document)) as TestimonialCanvasDocument;
}

export function createBindingValues(
  source: TestimonialBindingSource | null | undefined,
): Partial<TestimonialBindingValues> {
  if (!source) {
    return {};
  }

  return {
    "client.avatar": source.client.avatarUrl,
    "client.company": source.client.companyName,
    "client.email": source.client.email,
    "client.initials": source.client.initials,
    "client.name": source.client.name,
    "client.role": source.client.role,
    "project.client": source.client.name,
    "project.completedAt": source.project.completedAt,
    "project.name": source.project.name,
    "review.comment": source.review.comment,
    "review.rating": source.review.rating,
    "review.submittedAt": source.review.submittedAt,
    "review.text": source.review.text,
  };
}

function resolveBindingValue(
  binding: TestimonialBindingKey | undefined,
  values: Partial<TestimonialBindingValues>,
) {
  if (!binding) {
    return null;
  }

  return values[binding] ?? null;
}

export function resolveCanvasText(
  element: Pick<TestimonialTextElement, "binding" | "text">,
  values: Partial<TestimonialBindingValues>,
) {
  const resolvedBinding = resolveBindingValue(element.binding, values);

  if (resolvedBinding == null || resolvedBinding === "") {
    return element.text;
  }

  return String(resolvedBinding);
}

export function resolveCanvasImageSource(
  element: Pick<TestimonialImageElement | TestimonialLogoElement, "binding" | "source">,
  values: Partial<TestimonialBindingValues>,
) {
  const resolvedBinding = resolveBindingValue(element.binding, values);

  if (typeof resolvedBinding === "string" && resolvedBinding.length > 0) {
    return resolvedBinding;
  }

  return element.source;
}

export function getInitialsFromName(value: string) {
  const words = canonicalizeTitle(value)
    .split(" ")
    .filter(Boolean);

  if (words.length === 0) {
    return "M";
  }

  const first = words[0]?.[0] ?? "M";
  const second = words.length > 1 ? words[1]?.[0] ?? "" : "";

  return `${first}${second}`.toUpperCase();
}

export function createEmptyBindingSource(): TestimonialBindingSource {
  return {
    client: {
      avatarUrl: null,
      companyName: null,
      email: null,
      initials: "M",
      name: "MitFloww Client",
      role: null,
    },
    project: {
      completedAt: null,
      id: "project-placeholder",
      name: "Project name",
    },
    review: {
      comment: "This is where the client review will load.",
      rating: 5,
      submittedAt: null,
      text: "This is where the client review will load.",
    },
  };
}

export type TestimonialDesign = TestimonialRecord;
