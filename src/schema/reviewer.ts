import { z } from 'zod';

export const ReviewerTierEnum = z.enum(['senior', 'lead', 'blocked']);
export type ReviewerTier = z.infer<typeof ReviewerTierEnum>;

export const ReviewerSchema = z.object({
	username: z.string(),
	tier: ReviewerTierEnum,
	created_at: z.string(),
});
export type Reviewer = z.infer<typeof ReviewerSchema>;

export const TIER_WEIGHTS: Record<ReviewerTier, number> = {
	senior: 2,
	lead: 3,
	blocked: 0,
};
