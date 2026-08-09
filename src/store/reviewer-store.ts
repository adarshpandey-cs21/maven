import { getDb } from '../core/db.js';
import type { Reviewer, ReviewerTier } from '../schema/index.js';

export function getReviewer(username: string): Reviewer | undefined {
	const db = getDb();
	return db.prepare('SELECT * FROM reviewers WHERE username = ?').get(username) as
		| Reviewer
		| undefined;
}

export function listReviewers(): Reviewer[] {
	const db = getDb();
	return db.prepare('SELECT * FROM reviewers ORDER BY username').all() as Reviewer[];
}

export function upsertReviewer(username: string, tier: ReviewerTier): Reviewer {
	const db = getDb();
	const now = new Date().toISOString();
	const existing = getReviewer(username);
	if (existing) {
		db.prepare('UPDATE reviewers SET tier = ? WHERE username = ?').run(tier, username);
	} else {
		db.prepare('INSERT INTO reviewers (username, tier, created_at) VALUES (?, ?, ?)').run(
			username,
			tier,
			now,
		);
	}
	return getReviewer(username) as Reviewer;
}

export function removeReviewer(username: string): boolean {
	const db = getDb();
	const result = db.prepare('DELETE FROM reviewers WHERE username = ?').run(username);
	return result.changes > 0;
}

export function isBlocked(username: string): boolean {
	const reviewer = getReviewer(username);
	return reviewer?.tier === 'blocked';
}

export function getReviewerWeight(username: string): number {
	const reviewer = getReviewer(username);
	if (!reviewer) return 1; // unknown = peer = 1x
	const weights: Record<string, number> = { senior: 2, lead: 3, blocked: 0 };
	return weights[reviewer.tier] ?? 1;
}
