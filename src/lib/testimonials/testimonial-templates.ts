import {
  TestimonialCanvasPreset,
  TestimonialTemplateAccessLevel,
  TestimonialTemplateScope,
  type TestimonialCanvasPresetId,
  type TestimonialCanvasDocument,
  type TestimonialTemplate,
  type TestimonialTemplateFamily,
  type TestimonialTemplatePalette,
  type TestimonialTextElement,
  type TestimonialShapeElement,
  type TestimonialImageElement,
  type TestimonialLogoElement,
  type TestimonialRatingElement,
  type TestimonialWatermarkElement,
} from "@/types/testimonials";

function createBaseMetadata(accentColor: string, cardColor: string, textColor: string, mutedTextColor: string) {
  return { accentColor, cardColor, fontFamily: "Manrope", mutedTextColor, surfaceColor: "#ffffff", textColor };
}

function createTextElement(id: string, text: string, x: number, y: number, width: number, height: number, options: Partial<Omit<TestimonialTextElement, "type">> = {}): TestimonialTextElement {
  return { align: "left", fill: "#0F172A", fontFamily: "Manrope", fontSize: 28, fontStyle: "normal", height, id, lineHeight: 1.2, opacity: 1, rotation: 0, text, type: "text", width, x, y, zIndex: 0, ...options };
}

function createShapeElement(id: string, shape: "rect" | "circle", x: number, y: number, width: number, height: number, options: Partial<Omit<TestimonialShapeElement, "type">> = {}): TestimonialShapeElement {
  return { fill: "#D1D5DB", height, id, opacity: 1, radius: shape === "circle" ? height / 2 : 24, rotation: 0, shape, stroke: undefined, strokeWidth: undefined, type: "shape", width, x, y, zIndex: 0, ...options };
}

function createImageElement(id: string, x: number, y: number, width: number, height: number, options: Partial<Omit<TestimonialImageElement, "type">> = {}): TestimonialImageElement {
  return { alt: "Client avatar", borderRadius: height / 2, fit: "cover", fallbackLabel: "M", height, id, opacity: 1, rotation: 0, source: null, stroke: "#E2E8F0", strokeWidth: 2, type: "image", width, x, y, zIndex: 0, ...options };
}

function createRatingElement(id: string, x: number, y: number, width: number, height: number, options: Partial<Omit<TestimonialRatingElement, "type">> = {}): TestimonialRatingElement {
  return { emptyStarColor: "#CBD5E1", height, id, maxRating: 5, opacity: 1, rotation: 0, starColor: "#F59E0B", starSize: 20, type: "rating", value: 5, width, x, y, zIndex: 0, ...options };
}

function createWatermarkElement(id: string, text: string, x: number, y: number, width: number, height: number, options: Partial<Omit<TestimonialWatermarkElement, "type">> = {}): TestimonialWatermarkElement {
  return { color: "#64748B", fontSize: 22, height, id, opacity: 0.12, rotation: 0, text, type: "watermark", width, x, y, zIndex: 0, ...options };
}

function createLogoElement(id: string, label: string, x: number, y: number, width: number, height: number, options: Partial<Omit<TestimonialLogoElement, "type">> = {}): TestimonialLogoElement {
  return { backgroundColor: "#FFFFFF", borderRadius: 22, height, id, label, opacity: 1, rotation: 0, source: null, textColor: "#0F172A", type: "logo", width, x, y, zIndex: 0, ...options };
}

function buildCanvas(presetId: TestimonialCanvasPresetId, background: TestimonialCanvasDocument["background"], metadata: TestimonialCanvasDocument["metadata"], elements: TestimonialCanvasDocument["elements"]): TestimonialCanvasDocument {
  return { background, elements, metadata, presetId };
}

const SOLID_VIBRANT_PALETTES: TestimonialTemplatePalette[] = [
  { id: "primary", label: "Primary", capability: "free", backgroundColor: "#005bdd", secondaryColor: "#004ac6", accentColor: "#ffffff", cardColor: "#ffffff", textColor: "#ffffff", mutedTextColor: "#e8f1fb" },
  { id: "accent", label: "Accent", capability: "free", backgroundColor: "#6a1edb", secondaryColor: "#5b16c2", accentColor: "#ffffff", cardColor: "#ffffff", textColor: "#ffffff", mutedTextColor: "#e8f1fb" },
  { id: "success", label: "Success", capability: "free", backgroundColor: "#137333", secondaryColor: "#10632b", accentColor: "#ffffff", cardColor: "#ffffff", textColor: "#ffffff", mutedTextColor: "#e6f4ea" },
];

const GLASS_PALETTES: TestimonialTemplatePalette[] = [
  { id: "glass-light", label: "Glass Light", capability: "free", backgroundColor: "#f2f3f6", secondaryColor: "#eef2f7", accentColor: "#005bdd", cardColor: "rgba(255,255,255,0.4)", textColor: "#191c1e", mutedTextColor: "#64748b" },
  { id: "glass-dark", label: "Glass Dark", capability: "premium", backgroundColor: "#191c1e", secondaryColor: "#111416", accentColor: "#005bdd", cardColor: "rgba(25,28,30,0.4)", textColor: "#ffffff", mutedTextColor: "#9c9c9f" },
];

const NEON_PALETTES: TestimonialTemplatePalette[] = [
  { id: "matrix", label: "Matrix", capability: "premium", backgroundColor: "#000000", secondaryColor: "#000000", accentColor: "#27b77c", cardColor: "#000000", textColor: "#27b77c", mutedTextColor: "#137333" },
  { id: "cyberpunk", label: "Cyberpunk", capability: "premium", backgroundColor: "#000000", secondaryColor: "#000000", accentColor: "#e81e25", cardColor: "#000000", textColor: "#e81e25", mutedTextColor: "#c5221f" },
];

const SPLIT_PALETTES: TestimonialTemplatePalette[] = [
  { id: "monochrome", label: "Monochrome", capability: "free", backgroundColor: "#191c1e", secondaryColor: "#ffffff", accentColor: "#005bdd", cardColor: "#ffffff", textColor: "#ffffff", mutedTextColor: "#64748b" },
  { id: "blue-split", label: "Blue Split", capability: "paid", backgroundColor: "#005bdd", secondaryColor: "#e8f1fb", accentColor: "#ec8d1b", cardColor: "#ffffff", textColor: "#ffffff", mutedTextColor: "#c3c6d7" },
];

const CORPORATE_PALETTES: TestimonialTemplatePalette[] = [
  { id: "corp-light", label: "Light", capability: "free", backgroundColor: "#ffffff", secondaryColor: "#f2f3f6", accentColor: "#005bdd", cardColor: "#ffffff", textColor: "#191c1e", mutedTextColor: "#434655" },
  { id: "corp-dark", label: "Dark", capability: "paid", backgroundColor: "#191c1e", secondaryColor: "#111416", accentColor: "#005bdd", cardColor: "#191c1e", textColor: "#ffffff", mutedTextColor: "#9c9c9f" },
];

const BUBBLE_PALETTES: TestimonialTemplatePalette[] = [
  { id: "bubble-light", label: "Light Theme", capability: "free", backgroundColor: "#f2f3f6", secondaryColor: "#eef2f7", accentColor: "#6a1edb", cardColor: "#ffffff", textColor: "#191c1e", mutedTextColor: "#434655" },
  { id: "bubble-primary", label: "Primary Theme", capability: "paid", backgroundColor: "#e8f1fb", secondaryColor: "#ffffff", accentColor: "#005bdd", cardColor: "#ffffff", textColor: "#005bdd", mutedTextColor: "#434655" },
];

const DARK_SLATE_PALETTES: TestimonialTemplatePalette[] = [
  { id: "slate", label: "Slate", capability: "paid", backgroundColor: "#191c1e", secondaryColor: "#272a2c", accentColor: "#005bdd", cardColor: "#272a2c", textColor: "#ffffff", mutedTextColor: "#9c9c9f" },
  { id: "charcoal", label: "Charcoal", capability: "premium", backgroundColor: "#111416", secondaryColor: "#191c1e", accentColor: "#e81e25", cardColor: "#191c1e", textColor: "#ffffff", mutedTextColor: "#9c9c9f" },
];

const GRID_PALETTES: TestimonialTemplatePalette[] = [
  { id: "grid-light", label: "Blueprint Light", capability: "paid", backgroundColor: "#ffffff", secondaryColor: "#ffffff", accentColor: "#005bdd", cardColor: "#ffffff", textColor: "#191c1e", mutedTextColor: "#64748b" },
];

const POLAROID_PALETTES: TestimonialTemplatePalette[] = [
  { id: "polaroid-wood", label: "Classic", capability: "paid", backgroundColor: "#f2f3f6", secondaryColor: "#eef2f7", accentColor: "#191c1e", cardColor: "#ffffff", textColor: "#191c1e", mutedTextColor: "#737686" },
];

const MAGAZINE_PALETTES: TestimonialTemplatePalette[] = [
  { id: "mag-yellow", label: "Yellow", capability: "premium", backgroundColor: "#ec8d1b", secondaryColor: "#191c1e", accentColor: "#ffffff", cardColor: "#ffffff", textColor: "#191c1e", mutedTextColor: "#434655" },
];

export const TESTIMONIAL_TEMPLATES: TestimonialTemplate[] = [
  {
    accessLevel: TestimonialTemplateAccessLevel.Free,
    category: "Bold",
    canvas: buildCanvas(
      TestimonialCanvasPreset.Square,
      { color: "#E11D48", secondaryColor: "#E11D48", type: "solid" },
      createBaseMetadata("#FFFFFF", "#FFFFFF", "#FFFFFF", "#FDA4AF"),
      [
        createTextElement("quote", "This tool completely changed our workflow.", 80, 250, 920, 400, { binding: "review.text", fill: "#FFFFFF", fontSize: 60, fontStyle: "bold", align: "center", lineHeight: 1.1, fontFamily: "Playfair Display" }),
        createShapeElement("pill", "rect", 240, 750, 600, 120, { fill: "#FFFFFF", radius: 60 }),
        createImageElement("avatar", 260, 770, 80, 80, { binding: "client.avatar" }),
        createTextElement("client-name", "Alex Smith", 360, 785, 400, 40, { binding: "client.name", fill: "#000000", fontSize: 28, fontStyle: "bold" }),
        createTextElement("client-role", "Founder", 360, 825, 400, 30, { binding: "client.role", fill: "#64748B", fontSize: 20 })
      ]
    ),
    description: "Extremely large typography acting as the main hero.",
    id: "bold-typography",
    isDefault: true,
    name: "Bold Typography",
    presetId: TestimonialCanvasPreset.Square,
    scope: TestimonialTemplateScope.System,
    tags: ["bold", "typography", "vibrant"],
    familyId: "bold-designs",
    variationLabel: "Bold Typography",
    palettes: SOLID_VIBRANT_PALETTES,
    previewCapability: "free",
    customizeCapability: "free",
    creditCost: 1,
  },
  {
    accessLevel: TestimonialTemplateAccessLevel.Free,
    category: "Modern",
    canvas: buildCanvas(
      TestimonialCanvasPreset.Square,
      { color: "#F8FAFC", secondaryColor: "#F1F5F9", type: "solid" },
      createBaseMetadata("#3B82F6", "rgba(255,255,255,0.4)", "#0F172A", "#64748B"),
      [
        createShapeElement("blob1", "circle", -100, -100, 600, 600, { fill: "#3B82F6", opacity: 0.1 }),
        createShapeElement("blob2", "circle", 600, 600, 700, 700, { fill: "#E879F9", opacity: 0.1 }),
        createShapeElement("card", "rect", 100, 100, 880, 880, { fill: "rgba(255,255,255,0.6)", radius: 40, stroke: "#FFFFFF", strokeWidth: 2 }),
        createRatingElement("rating", 160, 160, 200, 40, { starColor: "#3B82F6", value: 5 }),
        createTextElement("quote", "An incredible experience from start to finish.", 160, 240, 760, 400, { binding: "review.text", fill: "#0F172A", fontSize: 48, fontStyle: "bold", lineHeight: 1.3 }),
        createImageElement("avatar", 760, 140, 160, 160, { binding: "client.avatar" }),
        createTextElement("client-name", "Taylor Swift", 160, 780, 500, 40, { binding: "client.name", fill: "#0F172A", fontSize: 28, fontStyle: "bold" }),
        createTextElement("client-role", "Musician", 160, 820, 500, 30, { binding: "client.role", fill: "#64748B", fontSize: 22 })
      ]
    ),
    description: "Abstract frosted glass style.",
    id: "glassmorphism",
    isDefault: false,
    name: "Glassmorphism",
    presetId: TestimonialCanvasPreset.Square,
    scope: TestimonialTemplateScope.System,
    tags: ["glass", "modern", "blur"],
    familyId: "glass-designs",
    variationLabel: "Glassmorphism",
    palettes: GLASS_PALETTES,
    previewCapability: "free",
    customizeCapability: "free",
    creditCost: 1,
  },
  {
    accessLevel: TestimonialTemplateAccessLevel.Free,
    category: "Cyber",
    canvas: buildCanvas(
      TestimonialCanvasPreset.Square,
      { color: "#000000", secondaryColor: "#000000", type: "solid" },
      createBaseMetadata("#22C55E", "#000000", "#4ADE80", "#166534"),
      [
        createShapeElement("line", "rect", 60, 100, 4, 880, { fill: "#22C55E" }),
        createTextElement("quote", "> System optimized successfully. Outstanding results.", 120, 200, 800, 400, { binding: "review.text", fill: "#4ADE80", fontSize: 50, fontFamily: "monospace" }),
        createImageElement("avatar", 120, 700, 100, 100, { binding: "client.avatar", borderRadius: 0, stroke: "#22C55E", strokeWidth: 2 }),
        createTextElement("client-name", "Neo", 250, 710, 500, 40, { binding: "client.name", fill: "#4ADE80", fontSize: 32, fontFamily: "monospace" }),
        createTextElement("client-role", "The One", 250, 760, 500, 30, { binding: "client.role", fill: "#166534", fontSize: 24, fontFamily: "monospace" }),
        createRatingElement("rating", 120, 100, 200, 40, { starColor: "#22C55E", value: 5 })
      ]
    ),
    description: "Dark canvas with glowing neon monospaced text.",
    id: "neon-cyber",
    isDefault: false,
    name: "Neon Cyber",
    presetId: TestimonialCanvasPreset.Square,
    scope: TestimonialTemplateScope.System,
    tags: ["cyber", "neon", "dark"],
    familyId: "bold-designs",
    variationLabel: "Neon Cyber",
    palettes: NEON_PALETTES,
    previewCapability: "free",
    customizeCapability: "premium",
    creditCost: 1,
  },
  {
    accessLevel: TestimonialTemplateAccessLevel.Free,
    category: "Dynamic",
    canvas: buildCanvas(
      TestimonialCanvasPreset.Square,
      { color: "#FFFFFF", secondaryColor: "#FFFFFF", type: "solid" },
      createBaseMetadata("#3B82F6", "#FFFFFF", "#000000", "#64748B"),
      [
        createShapeElement("diag", "rect", -500, -1000, 2000, 1540, { fill: "#1D4ED8", rotation: -15 }),
        createTextElement("quote", "This is the most dynamic design we have ever seen.", 100, 560, 880, 240, { binding: "review.text", fill: "#0F172A", fontSize: 44, align: "center", fontStyle: "bold" }),
        createImageElement("avatar", 460, 360, 160, 160, { binding: "client.avatar", stroke: "#FFFFFF", strokeWidth: 8 }),
        createTextElement("client-name", "Diana Prince", 100, 840, 880, 40, { binding: "client.name", fill: "#0F172A", fontSize: 28, align: "center", fontStyle: "bold" }),
        createTextElement("client-role", "Hero", 100, 880, 880, 30, { binding: "client.role", fill: "#64748B", fontSize: 22, align: "center" }),
        createRatingElement("rating", 430, 200, 220, 40, { starColor: "#F59E0B", value: 5 })
      ]
    ),
    description: "Diagonal split background.",
    id: "split-diagonal",
    isDefault: false,
    name: "Split Diagonal",
    presetId: TestimonialCanvasPreset.Square,
    scope: TestimonialTemplateScope.System,
    tags: ["split", "diagonal", "dynamic"],
    familyId: "bold-designs",
    variationLabel: "Split Diagonal",
    palettes: SPLIT_PALETTES,
    previewCapability: "free",
    customizeCapability: "paid",
    creditCost: 1,
  },
  {
    accessLevel: TestimonialTemplateAccessLevel.Free,
    category: "Corporate",
    canvas: buildCanvas(
      TestimonialCanvasPreset.Square,
      { color: "#FFFFFF", secondaryColor: "#FFFFFF", type: "solid" },
      createBaseMetadata("#0284C7", "#FFFFFF", "#0F172A", "#475569"),
      [
        createShapeElement("accent", "rect", 100, 140, 12, 800, { fill: "#0284C7", radius: 6 }),
        createTextElement("quote", "A highly professional and clean approach to our business needs.", 160, 200, 800, 400, { binding: "review.text", fill: "#0F172A", fontSize: 52, fontStyle: "bold", lineHeight: 1.25 }),
        createImageElement("avatar", 160, 740, 80, 80, { binding: "client.avatar", borderRadius: 16 }),
        createTextElement("client-name", "Bruce Wayne", 270, 750, 600, 40, { binding: "client.name", fill: "#0F172A", fontSize: 26, fontStyle: "bold" }),
        createTextElement("client-role", "CEO, Wayne Ent.", 270, 790, 600, 30, { binding: "client.role", fill: "#475569", fontSize: 20 }),
        createRatingElement("rating", 160, 140, 200, 40, { starColor: "#0284C7", value: 5 })
      ]
    ),
    description: "Clean layout with a strong vertical accent line.",
    id: "clean-corporate",
    isDefault: false,
    name: "Clean Corporate",
    presetId: TestimonialCanvasPreset.Square,
    scope: TestimonialTemplateScope.System,
    tags: ["corporate", "clean", "professional"],
    familyId: "minimal-designs",
    variationLabel: "Clean Corporate",
    palettes: CORPORATE_PALETTES,
    previewCapability: "free",
    customizeCapability: "free",
    creditCost: 1,
  },
  {
    accessLevel: TestimonialTemplateAccessLevel.Free,
    category: "Playful",
    canvas: buildCanvas(
      TestimonialCanvasPreset.Square,
      { color: "#FDF2F8", secondaryColor: "#FDF2F8", type: "solid" },
      createBaseMetadata("#EC4899", "#FFFFFF", "#831843", "#F472B6"),
      [
        createShapeElement("b1", "circle", 100, 100, 120, 120, { fill: "#FCE7F3" }),
        createShapeElement("b2", "circle", 800, 200, 180, 180, { fill: "#FBCFE8" }),
        createShapeElement("b3", "circle", 150, 800, 240, 240, { fill: "#FCE7F3" }),
        createShapeElement("b4", "circle", 900, 750, 90, 90, { fill: "#F9A8D4" }),
        createImageElement("avatar", 440, 160, 200, 200, { binding: "client.avatar" }),
        createRatingElement("rating", 440, 400, 200, 40, { starColor: "#EC4899", value: 5 }),
        createTextElement("quote", "Absolutely delightful to work with!", 100, 480, 880, 200, { binding: "review.text", fill: "#831843", fontSize: 56, fontStyle: "bold", align: "center", lineHeight: 1.2 }),
        createTextElement("client-name", "Pinky Pie", 100, 720, 880, 40, { binding: "client.name", fill: "#831843", fontSize: 32, fontStyle: "bold", align: "center" }),
        createTextElement("client-role", "Party Planner", 100, 770, 880, 30, { binding: "client.role", fill: "#F472B6", fontSize: 24, align: "center" })
      ]
    ),
    description: "Soft pastel background with floating circular blobs.",
    id: "floating-bubbles",
    isDefault: false,
    name: "Floating Bubbles",
    presetId: TestimonialCanvasPreset.Square,
    scope: TestimonialTemplateScope.System,
    tags: ["playful", "bubbles", "soft"],
    familyId: "glass-designs",
    variationLabel: "Floating Bubbles",
    palettes: BUBBLE_PALETTES,
    previewCapability: "free",
    customizeCapability: "free",
    creditCost: 1,
  },
  {
    accessLevel: TestimonialTemplateAccessLevel.Free,
    category: "Premium",
    canvas: buildCanvas(
      TestimonialCanvasPreset.Square,
      { color: "#0F172A", secondaryColor: "#1E293B", type: "gradient" },
      createBaseMetadata("#38BDF8", "#1E293B", "#F8FAFC", "#94A3B8"),
      [
        createTextElement("quote", "An exceptional standard of quality.", 100, 240, 860, 400, { binding: "review.text", fill: "#F8FAFC", fontSize: 52, fontStyle: "italic", align: "right", lineHeight: 1.3 }),
        createRatingElement("rating", 760, 160, 200, 40, { starColor: "#38BDF8", value: 5 }),
        createImageElement("avatar", 840, 760, 120, 120, { binding: "client.avatar" }),
        createTextElement("client-name", "James Bond", 100, 780, 700, 40, { binding: "client.name", fill: "#F8FAFC", fontSize: 30, fontStyle: "bold", align: "right" }),
        createTextElement("client-role", "Agent", 100, 830, 700, 30, { binding: "client.role", fill: "#94A3B8", fontSize: 22, align: "right" })
      ]
    ),
    description: "Very dark slate gradient with right-aligned italicized quote.",
    id: "dark-slate",
    isDefault: false,
    name: "Dark Slate",
    presetId: TestimonialCanvasPreset.Square,
    scope: TestimonialTemplateScope.System,
    tags: ["dark", "premium", "slate"],
    familyId: "minimal-designs",
    variationLabel: "Dark Slate",
    palettes: DARK_SLATE_PALETTES,
    previewCapability: "free",
    customizeCapability: "paid",
    creditCost: 1,
  },
  {
    accessLevel: TestimonialTemplateAccessLevel.Free,
    category: "Minimal",
    canvas: buildCanvas(
      TestimonialCanvasPreset.Square,
      { color: "#FFFFFF", secondaryColor: "#FFFFFF", type: "solid" },
      createBaseMetadata("#2563EB", "#FFFFFF", "#1E293B", "#64748B"),
      [
        createShapeElement("line1", "rect", 540, 0, 2, 1080, { fill: "#E2E8F0", radius: 0 }),
        createShapeElement("line2", "rect", 0, 540, 1080, 2, { fill: "#E2E8F0", radius: 0 }),
        createTextElement("quote", "Structurally perfect.", 60, 80, 420, 420, { binding: "review.text", fill: "#1E293B", fontSize: 40, fontStyle: "normal", lineHeight: 1.4 }),
        createImageElement("avatar", 60, 600, 420, 420, { binding: "client.avatar", borderRadius: 0 }),
        createTextElement("client-name", "Ada Lovelace", 600, 600, 420, 40, { binding: "client.name", fill: "#1E293B", fontSize: 32, fontStyle: "bold" }),
        createTextElement("client-role", "Programmer", 600, 650, 420, 30, { binding: "client.role", fill: "#64748B", fontSize: 24 }),
        createRatingElement("rating", 600, 980, 200, 40, { starColor: "#2563EB", value: 5 })
      ]
    ),
    description: "White canvas with thin grid lines.",
    id: "minimal-grid",
    isDefault: false,
    name: "Minimal Grid",
    presetId: TestimonialCanvasPreset.Square,
    scope: TestimonialTemplateScope.System,
    tags: ["grid", "wireframe", "minimal"],
    familyId: "minimal-designs",
    variationLabel: "Minimal Grid",
    palettes: GRID_PALETTES,
    previewCapability: "free",
    customizeCapability: "paid",
    creditCost: 1,
  },
  {
    accessLevel: TestimonialTemplateAccessLevel.Free,
    category: "Vintage",
    canvas: buildCanvas(
      TestimonialCanvasPreset.Square,
      { color: "#D4D4D8", secondaryColor: "#E4E4E7", type: "solid" },
      createBaseMetadata("#18181B", "#FFFFFF", "#18181B", "#71717A"),
      [
        createShapeElement("card", "rect", 140, 100, 800, 880, { fill: "#FFFFFF", radius: 0 }),
        createImageElement("avatar", 180, 140, 720, 560, { binding: "client.avatar", borderRadius: 0 }),
        createTextElement("quote", "A timeless classic design.", 180, 740, 720, 120, { binding: "review.text", fill: "#18181B", fontSize: 36, align: "center", fontStyle: "italic" }),
        createTextElement("client-name", "Clark Kent", 180, 880, 720, 30, { binding: "client.name", fill: "#71717A", fontSize: 20, align: "center" }),
        createRatingElement("rating", 440, 930, 200, 40, { starColor: "#18181B", value: 5 })
      ]
    ),
    description: "Polaroid photo frame layout.",
    id: "polaroid",
    isDefault: false,
    name: "Polaroid",
    presetId: TestimonialCanvasPreset.Square,
    scope: TestimonialTemplateScope.System,
    tags: ["polaroid", "vintage", "photo"],
    familyId: "glass-designs",
    variationLabel: "Polaroid",
    palettes: POLAROID_PALETTES,
    previewCapability: "free",
    customizeCapability: "paid",
    creditCost: 1,
  },
  {
    accessLevel: TestimonialTemplateAccessLevel.Free,
    category: "Editorial",
    canvas: buildCanvas(
      TestimonialCanvasPreset.Square,
      { color: "#FDE047", secondaryColor: "#FDE047", type: "solid" },
      createBaseMetadata("#FFFFFF", "#FFFFFF", "#000000", "#71717A"),
      [
        createShapeElement("bottom-bar", "rect", 0, 700, 1080, 380, { fill: "#000000", radius: 0 }),
        createTextElement("quote", "Bold, unmissable, and makes a statement.", 80, 160, 920, 480, { binding: "review.text", fill: "#000000", fontSize: 72, fontStyle: "bold", align: "center", lineHeight: 1.1 }),
        createTextElement("client-name", "Anna Wintour", 80, 780, 920, 40, { binding: "client.name", fill: "#FFFFFF", fontSize: 36, align: "center", fontStyle: "bold", letterSpacing: 2 }),
        createTextElement("client-role", "Editor in Chief", 80, 840, 920, 30, { binding: "client.role", fill: "#71717A", fontSize: 24, align: "center", letterSpacing: 1 }),
        createRatingElement("rating", 440, 920, 200, 40, { starColor: "#FFFFFF", value: 5 })
      ]
    ),
    description: "Two-tone horizontal split magazine style.",
    id: "magazine",
    isDefault: false,
    name: "Magazine",
    presetId: TestimonialCanvasPreset.Square,
    scope: TestimonialTemplateScope.System,
    tags: ["magazine", "editorial", "bold"],
    familyId: "bold-designs",
    variationLabel: "Magazine",
    palettes: MAGAZINE_PALETTES,
    previewCapability: "free",
    customizeCapability: "premium",
    creditCost: 1,
  }
];

export const TESTIMONIAL_TEMPLATE_FAMILIES: TestimonialTemplateFamily[] = [
  { id: "bold-designs", label: "Bold & Dynamic", variationIds: ["bold-typography", "neon-cyber", "split-diagonal", "magazine"] },
  { id: "glass-designs", label: "Glass & Playful", variationIds: ["glassmorphism", "floating-bubbles", "polaroid"] },
  { id: "minimal-designs", label: "Clean & Minimal", variationIds: ["clean-corporate", "dark-slate", "minimal-grid"] },
];

export const TESTIMONIAL_FAMILY_MAP = Object.fromEntries(
  TESTIMONIAL_TEMPLATE_FAMILIES.map((f) => [f.id, f]),
) as Record<string, TestimonialTemplateFamily>;

export const TESTIMONIAL_TEMPLATE_MAP = Object.fromEntries(
  TESTIMONIAL_TEMPLATES.map((template) => [template.id, template]),
) as Record<string, TestimonialTemplate>;

export function findTestimonialTemplateById(templateId: string | null | undefined) {
  if (!templateId) return null;
  return TESTIMONIAL_TEMPLATE_MAP[templateId] ?? null;
}

export function getTestimonialTemplate(templateId: string | null | undefined) {
  if (!templateId) return TESTIMONIAL_TEMPLATES[0] ?? null;
  return findTestimonialTemplateById(templateId) ?? TESTIMONIAL_TEMPLATES[0] ?? null;
}

export function getTemplatesForFamily(familyId: string): TestimonialTemplate[] {
  const family = TESTIMONIAL_FAMILY_MAP[familyId];
  if (!family) return [];
  return family.variationIds.map((id) => TESTIMONIAL_TEMPLATE_MAP[id]).filter((t): t is TestimonialTemplate => t != null);
}

export function getFamilyForTemplate(templateId: string): TestimonialTemplateFamily | null {
  const template = TESTIMONIAL_TEMPLATE_MAP[templateId];
  if (!template?.familyId) return null;
  return TESTIMONIAL_FAMILY_MAP[template.familyId] ?? null;
}
