import { z } from 'zod';
import { SeverityEnum } from './rule.js';

export const ViolationSchema = z.object({
	rule_id: z.string(),
	rule_text: z.string(),
	severity: SeverityEnum,
	file: z.string(),
	line: z.number().nullable(),
	matched_text: z.string().nullable(),
	fix_hint: z.string().nullable(),
});
export type Violation = z.infer<typeof ViolationSchema>;

export const ValidateDiffInputSchema = z.object({
	repo: z.string().describe('Repository slug'),
	diff: z.string().describe('Unified diff text'),
});
export type ValidateDiffInput = z.infer<typeof ValidateDiffInputSchema>;
