import { z } from "zod";
import { locales } from "@/i18n/config";

export const onDemandTranslationBodySchema = z
  .object({
    targetLocale: z.enum(locales).optional(),
    text: z
      .string({
        invalid_type_error: "text must be a string.",
        required_error: "text is required.",
      })
      .refine((value) => value.trim().length > 0, {
        message: "text is required.",
      }),
  })
  .strict();

export type OnDemandTranslationBody = z.infer<
  typeof onDemandTranslationBodySchema
>;
