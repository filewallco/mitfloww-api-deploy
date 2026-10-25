export const DASHBOARD_WIDGET_KEYS = [
  "metric_cards",
  "attention_banner",
  "revenue_overview",
  "recent_projects",
  "client_activity",
  "recent_transactions",
  "project_status",
  "storage_usage",
  "plan_credits",
  "revision_overview",
  "expiring_soon",
  "assets_revenue",
  "btn_request_payment",
  "btn_request_testimonial",
  "btn_create_project",
] as const;

export type DashboardWidgetKey = (typeof DASHBOARD_WIDGET_KEYS)[number];

export function isValidWidgetKey(key: string): key is DashboardWidgetKey {
  return (DASHBOARD_WIDGET_KEYS as readonly string[]).includes(key);
}

export type PresetItemDefinition = {
  widgetKey: DashboardWidgetKey;
  position: number;
  isVisible: boolean;
};

export const BUILT_IN_PRESET_KEYS = ["all", "project", "assets"] as const;
export type BuiltInPresetKey = (typeof BUILT_IN_PRESET_KEYS)[number];

export function isBuiltInPresetKey(key: string): key is BuiltInPresetKey {
  return (BUILT_IN_PRESET_KEYS as readonly string[]).includes(key);
}

export const DEFAULT_PRESET_LAYOUTS: Record<BuiltInPresetKey, PresetItemDefinition[]> = {
  all: [
    { widgetKey: "btn_request_payment", position: 0, isVisible: true },
    { widgetKey: "btn_request_testimonial", position: 1, isVisible: true },
    { widgetKey: "btn_create_project", position: 2, isVisible: true },
    { widgetKey: "metric_cards", position: 3, isVisible: true },
    { widgetKey: "attention_banner", position: 4, isVisible: true },
    { widgetKey: "revenue_overview", position: 5, isVisible: true },
    { widgetKey: "recent_projects", position: 6, isVisible: true },
    { widgetKey: "client_activity", position: 7, isVisible: true },
    { widgetKey: "recent_transactions", position: 8, isVisible: true },
    { widgetKey: "project_status", position: 9, isVisible: true },
    { widgetKey: "storage_usage", position: 10, isVisible: true },
    { widgetKey: "plan_credits", position: 11, isVisible: true },
    { widgetKey: "revision_overview", position: 12, isVisible: true },
    { widgetKey: "expiring_soon", position: 13, isVisible: true },
    { widgetKey: "assets_revenue", position: 14, isVisible: true },
  ],
  project: [
    { widgetKey: "btn_request_payment", position: 0, isVisible: true },
    { widgetKey: "btn_request_testimonial", position: 1, isVisible: true },
    { widgetKey: "btn_create_project", position: 2, isVisible: true },
    { widgetKey: "metric_cards", position: 3, isVisible: true },
    { widgetKey: "attention_banner", position: 4, isVisible: true },
    { widgetKey: "recent_projects", position: 5, isVisible: true },
    { widgetKey: "project_status", position: 6, isVisible: true },
    { widgetKey: "revision_overview", position: 7, isVisible: true },
    { widgetKey: "client_activity", position: 8, isVisible: true },
    { widgetKey: "revenue_overview", position: 9, isVisible: true },
    { widgetKey: "storage_usage", position: 10, isVisible: true },
    { widgetKey: "recent_transactions", position: 11, isVisible: true },
    { widgetKey: "expiring_soon", position: 12, isVisible: true },
    { widgetKey: "plan_credits", position: 13, isVisible: false },
    { widgetKey: "assets_revenue", position: 14, isVisible: false },
  ],
  assets: [
    { widgetKey: "btn_request_payment", position: 0, isVisible: false },
    { widgetKey: "btn_request_testimonial", position: 1, isVisible: false },
    { widgetKey: "btn_create_project", position: 2, isVisible: false },
    { widgetKey: "metric_cards", position: 3, isVisible: true },
    { widgetKey: "assets_revenue", position: 4, isVisible: true },
    { widgetKey: "storage_usage", position: 5, isVisible: true },
    { widgetKey: "plan_credits", position: 6, isVisible: true },
    { widgetKey: "recent_transactions", position: 7, isVisible: true },
    { widgetKey: "revenue_overview", position: 8, isVisible: true },
    { widgetKey: "expiring_soon", position: 9, isVisible: true },
    { widgetKey: "attention_banner", position: 10, isVisible: false },
    { widgetKey: "recent_projects", position: 11, isVisible: false },
    { widgetKey: "client_activity", position: 12, isVisible: false },
    { widgetKey: "project_status", position: 13, isVisible: false },
    { widgetKey: "revision_overview", position: 14, isVisible: false },
  ],
};
