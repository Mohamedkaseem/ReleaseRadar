import "dotenv/config";
import { z } from "zod";
export const config = z
  .object({
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4310),
    FALKORDB_HOST: z.string().default("127.0.0.1"),
    FALKORDB_PORT: z.coerce.number().int().default(6387),
    FALKORDB_PASSWORD: z.string().optional(),
    LLM_BASE_URL: z.string().optional(),
    LLM_API_KEY: z.string().optional(),
    LLM_MODEL: z.string().optional(),
  })
  .parse(process.env);
export const modelConfigured = Boolean(config.LLM_BASE_URL && config.LLM_MODEL);

export const INVESTIGATION_TIMEOUT_MS = 180_000;
