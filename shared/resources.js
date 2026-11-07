import { z } from "zod";
const text = z.string().trim().min(1).max(200);
const notes = z.string().max(20000).default("");
const optionalText = z.string().trim().max(500).nullable().optional();
const uuid = z.string().uuid().nullable().optional();
const website = z
  .union([
    z
      .string()
      .url()
      .refine((v) => /^https?:\/\//i.test(v), "Use an http or https URL"),
    z.literal(""),
  ])
  .nullable()
  .optional()
  .transform((v) => v || null);
export const resourceSchemas = {
  offers: z
    .object({
      name: text,
      description: notes,
      status: z.enum(["active", "archived"]).default("active"),
      price: z.number().min(0).max(1e12).nullable().optional(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default("NGN"),
    })
    .strict(),
  icps: z
    .object({
      name: text,
      offer_id: uuid,
      criteria: z.record(z.string(), z.unknown()).default({}),
      status: z.enum(["draft", "active", "archived"]).default("draft"),
    })
    .strict(),
  prospects: z
    .object({
      name: text,
      website,
      email: z.string().email().nullable().optional(),
      phone: optionalText,
      industry: optionalText,
      country: optionalText,
      source_url: website,
      fit_score: z.number().int().min(0).max(100).nullable().optional(),
      notes,
      verification_status: z
        .enum(["unverified", "verified", "stale"])
        .default("unverified"),
    })
    .strict(),
  contacts: z
    .object({
      full_name: text,
      phone: optionalText,
      notes,
      email: z.string().email().nullable().optional(),
      job_title: optionalText,
      prospect_id: uuid,
      consent_status: z
        .enum(["unknown", "opted_in", "legitimate_interest", "opted_out"])
        .default("unknown"),
    })
    .strict(),
  lists: z.object({ name: text, description: notes }).strict(),
  list_contacts: z
    .object({ list_id: z.string().uuid(), contact_id: z.string().uuid() })
    .strict(),
  campaigns: z
    .object({
      name: text,
      subject: z.string().max(300).default(""),
      body: notes,
    })
    .strict(),
  campaign_recipients: z
    .object({ campaign_id: z.string().uuid(), contact_id: z.string().uuid() })
    .strict(),
  deals: z
    .object({
      title: text,
      prospect_id: uuid,
      value: z.number().min(0).max(1e12).default(0),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default("NGN"),
      stage: z
        .enum([
          "qualified",
          "meeting",
          "proposal",
          "negotiation",
          "won",
          "lost",
        ])
        .default("qualified"),
      expected_close: z.string().date().nullable().optional(),
      notes,
    })
    .strict(),
  tasks: z
    .object({
      title: text,
      deal_id: uuid,
      status: z.enum(["open", "done"]).default("open"),
      priority: z.enum(["low", "medium", "high"]).default("medium"),
      due_at: z.string().datetime({ offset: true }).nullable().optional(),
      assigned_to: uuid,
    })
    .strict(),
  reports: z
    .object({
      name: text,
      definition: z.record(z.string(), z.unknown()).default({}),
    })
    .strict(),
};
export const readResources = [
  ...Object.keys(resourceSchemas),
  "messages",
  "diagnoses",
  "jobs",
  "integration_connections",
  "billing_accounts",
  "audit_events",
  "memberships",
];
export const serviceWriteResources = ["campaigns", "campaign_recipients"];
export function parseResource(resource, data, partial = false) {
  const schema = resourceSchemas[resource];
  if (!schema) throw new Error("Unsupported resource");
  const parsed = (partial ? schema.partial() : schema).parse(data);
  return partial
    ? Object.fromEntries(
        Object.entries(parsed).filter(([key]) => Object.hasOwn(data, key)),
      )
    : parsed;
}
export { canRole } from "./permissions.js";
