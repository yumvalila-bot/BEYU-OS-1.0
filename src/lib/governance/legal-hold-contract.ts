import { z } from "zod";

export const ApplyLegalHoldSchema = z.object({
  bodyId: z.string().min(1).max(100).optional(),
  holdTitle: z.string().trim().min(5).max(300),
  holdReason: z.string().trim().min(10).max(2000),
  matterReference: z.string().trim().min(3).max(100),
}).strict();
export type ApplyLegalHoldInput = z.infer<typeof ApplyLegalHoldSchema>;

export const ReleaseLegalHoldSchema = z.object({
  holdId: z.string().min(1).max(100),
  releaseJustification: z.string().trim().min(10).max(2000),
}).strict();
export type ReleaseLegalHoldInput = z.infer<typeof ReleaseLegalHoldSchema>;
