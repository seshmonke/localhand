import { z } from "zod";

export const SmsProviderSchema = z.enum(["dev", "smsru"]);

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("localhand-api"),
  version: z.string().min(1),
  // Operational probe for smoke/e2e: which SMS adapter the API actually uses.
  // It is configuration metadata, not a secret; clients must not depend on it
  // for product behaviour.
  smsProvider: SmsProviderSchema,
});

export type SmsProvider = z.infer<typeof SmsProviderSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
