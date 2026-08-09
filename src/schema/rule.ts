import { z } from 'zod';

export const SeverityEnum = z.enum(['nit', 'suggestion', 'important', 'critical']);
export type Severity = z.infer<typeof SeverityEnum>;

export const RuleStatusEnum = z.enum(['active', 'disabled']);
export type RuleStatus = z.infer<typeof RuleStatusEnum>;

export const RuleSourceEnum = z.enum(['manual', 'learned']);
export type RuleSource = z.infer<typeof RuleSourceEnum>;

export const RuleSchema = z.object({
	id: z.string(),
	repo: z.string(),
	category: z.string(),
	severity: SeverityEnum,
	rule: z.string(),
	match: z.string().nullable(),
	fix: z.string().nullable(),
	confidence: z.number().min(0).max(1),
	violations: z.number().default(0),
	source: RuleSourceEnum,
	status: RuleStatusEnum,
	created_at: z.string(),
	updated_at: z.string(),
});
export type Rule = z.infer<typeof RuleSchema>;
