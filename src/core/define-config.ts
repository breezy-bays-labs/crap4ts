import { z } from "zod";

const configSchema = z.object({
  threshold: z.number().positive().optional(),
  coverageMetric: z.enum(["line", "branch"]).optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  thresholds: z.record(z.string(), z.number().positive()).optional(),
});

export type Crap4tsConfig = z.infer<typeof configSchema>;

export function defineConfig(config: Crap4tsConfig): Crap4tsConfig {
  return configSchema.parse(config);
}
