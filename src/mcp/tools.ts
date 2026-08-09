import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { formatViolations, validateDiff } from '../engine/validator.js';
import { ReviewerTierEnum, RuleSourceEnum, SeverityEnum } from '../schema/index.js';
import {
	getReviewer,
	isBlocked,
	listReviewers,
	removeReviewer,
	upsertReviewer,
} from '../store/reviewer-store.js';
import {
	disableRule,
	getRuleById,
	getRulesDetailed,
	getRulesFormatted,
	listAllRepos,
	upsertRule,
} from '../store/rule-store.js';

export function registerTools(server: McpServer): void {
	// 1. learn
	server.tool(
		'learn',
		`Filters PR comments (removes blocked users) and returns ALL comments grouped by reviewer.

BEFORE calling this tool: When fetching PR data from Bitbucket, make sure to include tasks (include_tasks=true) and all comments. Tasks are often the most actionable review feedback.

YOU (Claude) must then read the returned comments, extract coding conventions/patterns, and propose rules to the user.
DO NOT auto-save rules. Present proposed rules to the user and wait for them to say which to save.
Only after user confirms (e.g. "save all", "save 1,3,5", "save all except 2") should you call save_rule with source="learned".`,
		{
			repo: z.string().describe('Repository slug (e.g. "backend-api")'),
			comments: z
				.array(
					z.object({
						pr_id: z.number(),
						comment_id: z.number(),
						reviewer: z.string(),
						comment_text: z.string(),
						resolved: z.boolean(),
						file_path: z.string().optional().nullable(),
						repo: z.string(),
					}),
				)
				.describe('PR review comments and tasks to learn from'),
			only_from: z
				.array(z.string())
				.optional()
				.describe('Only learn from these usernames (overrides default filtering)'),
			exclude: z.array(z.string()).optional().describe('Exclude these usernames (e.g. bots)'),
		},
		async ({ repo, comments, only_from, exclude }) => {
			let filtered = comments;

			if (only_from && only_from.length > 0) {
				const allowed = new Set(only_from);
				filtered = filtered.filter((c) => allowed.has(c.reviewer));
			} else {
				filtered = filtered.filter((c) => !isBlocked(c.reviewer));
			}

			if (exclude && exclude.length > 0) {
				const blocked = new Set(exclude);
				filtered = filtered.filter((c) => !blocked.has(c.reviewer));
			}

			if (filtered.length === 0) {
				return {
					content: [
						{
							type: 'text' as const,
							text: `No comments left after filtering (${comments.length} total, all filtered out). Check your blocked reviewers or only_from/exclude lists.`,
						},
					],
				};
			}

			// Reviewer breakdown from ALL comments (before filtering)
			const reviewerCounts = new Map<string, number>();
			for (const c of comments) {
				reviewerCounts.set(c.reviewer, (reviewerCounts.get(c.reviewer) ?? 0) + 1);
			}
			const sortedReviewers = [...reviewerCounts.entries()].sort((a, b) => b[1] - a[1]);

			const skipped = comments.length - filtered.length;
			const lines: string[] = [
				`## Reviewer breakdown (${comments.length} total, ${skipped} filtered out)`,
				'',
			];

			for (const [username, count] of sortedReviewers) {
				const reviewer = getReviewer(username);
				const tier = reviewer ? reviewer.tier : 'no-tier';
				const label = tier === 'blocked' ? 'BLOCKED' : tier === 'no-tier' ? 'peer (default)' : tier;
				lines.push(`- **${username}**: ${count} comments — ${label}`);
			}

			lines.push('');

			// Group filtered comments by reviewer
			const byReviewer = new Map<string, typeof filtered>();
			for (const c of filtered) {
				if (!byReviewer.has(c.reviewer)) byReviewer.set(c.reviewer, []);
				byReviewer.get(c.reviewer)?.push(c);
			}

			lines.push(`## All comments (${filtered.length} after filtering)`, '');

			for (const [reviewer, reviewerComments] of byReviewer) {
				lines.push(`### ${reviewer}`);
				for (const c of reviewerComments) {
					const file = c.file_path ? ` (${c.file_path})` : '';
					const status = c.resolved ? ' [resolved]' : '';
					lines.push(`- PR#${c.pr_id}${file}${status}: ${c.comment_text}`);
				}
				lines.push('');
			}

			lines.push(
				'---',
				`IMPORTANT: Read ALL the comments above and extract coding conventions/patterns for repo "${repo}".`,
				'Present a numbered list of proposed rules to the user.',
				'DO NOT save anything yet — wait for the user to tell you which rules to save.',
				'When saving, use source="learned" to mark these as learned from PRs.',
			);

			return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
		},
	);

	// 2. get_rules
	server.tool(
		'get_rules',
		'Returns rules for a repo. Use "detailed" view to see IDs, violation counts, source (manual/learned). Filter by category or source.',
		{
			repo: z.string().optional().describe('Repository slug. Omit to see all repos.'),
			category: z
				.string()
				.optional()
				.describe('Filter by category (e.g. "typescript", "svelte", "general")'),
			source: RuleSourceEnum.optional().describe(
				'Filter by source: "manual" (admin-added) or "learned" (from PRs)',
			),
			view: z
				.enum(['compact', 'detailed'])
				.default('compact')
				.describe('compact = plain text rules. detailed = IDs, violations, source, metadata.'),
		},
		async ({ repo, category, source, view }) => {
			if (!repo) {
				const repos = listAllRepos();
				if (repos.length === 0)
					return { content: [{ type: 'text' as const, text: 'No rules in database.' }] };
				const text = `Rules exist for these repos: ${repos.join(', ')}\n\nSpecify a repo to see its rules.`;
				return { content: [{ type: 'text' as const, text }] };
			}

			const opts = { category: category ?? undefined, source: source ?? undefined };

			if (view === 'detailed') {
				const text = getRulesDetailed(repo, opts);
				return { content: [{ type: 'text' as const, text }] };
			}

			const text = getRulesFormatted(repo, opts);
			return { content: [{ type: 'text' as const, text }] };
		},
	);

	// 3. save_rule — supports batch add (array of rules in one call)
	server.tool(
		'save_rule',
		'Add, update, or disable rules. Supports batch: pass "rules" array to add multiple at once. Only call AFTER user explicitly approves.',
		{
			action: z.enum(['add', 'update', 'disable']).describe('Action'),
			id: z.string().optional().describe('Rule ID (required for update/disable)'),
			repo: z.string().optional().describe('Repository slug (required for add)'),
			category: z.string().optional().describe('Category (required for single add)'),
			severity: SeverityEnum.optional().describe('Severity (required for single add)'),
			rule: z.string().optional().describe('Rule text (required for single add)'),
			match: z.string().optional().describe('Regex pattern for auto-detection in diffs'),
			fix: z.string().optional().describe('Fix hint shown with violations'),
			confidence: z.number().min(0).max(1).optional().describe('Confidence score'),
			source: RuleSourceEnum.optional().describe('manual or learned. Defaults to manual.'),
			rules: z
				.array(
					z.object({
						category: z.string(),
						severity: SeverityEnum,
						rule: z.string(),
						match: z.string().optional(),
						fix: z.string().optional(),
						confidence: z.number().min(0).max(1).optional(),
						source: RuleSourceEnum.optional(),
					}),
				)
				.optional()
				.describe('Batch add: array of rules to save at once. Requires repo to be set.'),
		},
		async (params) => {
			const { action, id, repo, category, severity, rule, match, fix, confidence, source, rules } =
				params;

			if (action === 'disable') {
				if (!id) {
					return { content: [{ type: 'text' as const, text: 'ID required for disable.' }] };
				}
				const ok = disableRule(id);
				return {
					content: [
						{
							type: 'text' as const,
							text: ok ? `Rule ${id} disabled.` : `Rule ${id} not found.`,
						},
					],
				};
			}

			if (action === 'add') {
				// Batch add
				if (rules && rules.length > 0) {
					if (!repo) {
						return {
							content: [{ type: 'text' as const, text: 'repo is required for batch add.' }],
						};
					}
					const created = rules.map((r) =>
						upsertRule({
							repo,
							category: r.category,
							severity: r.severity,
							rule: r.rule,
							match: r.match,
							fix: r.fix,
							confidence: r.confidence ?? 1.0,
							source: r.source ?? source ?? 'manual',
						}),
					);
					const lines = [`Saved ${created.length} rules:`, ''];
					for (const c of created) {
						lines.push(`- ${c.id} [${c.category} / ${c.severity}] ${c.rule}`);
					}
					return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
				}

				// Single add
				if (!repo || !category || !severity || !rule) {
					return {
						content: [
							{
								type: 'text' as const,
								text: 'repo, category, severity, and rule are required for add. Or pass "rules" array for batch.',
							},
						],
					};
				}
				const created = upsertRule({
					repo,
					category,
					severity,
					rule,
					match,
					fix,
					confidence: confidence ?? 1.0,
					source: source ?? 'manual',
				});
				return {
					content: [
						{
							type: 'text' as const,
							text: `Rule created: ${created.id} [${created.source}]\n[${created.category} / ${created.severity}] ${created.rule}`,
						},
					],
				};
			}

			// update
			if (!id) {
				return { content: [{ type: 'text' as const, text: 'ID required for update.' }] };
			}
			const existing = getRuleById(id);
			if (!existing) {
				return { content: [{ type: 'text' as const, text: `Rule ${id} not found.` }] };
			}

			const updated = upsertRule({
				id,
				repo: repo ?? existing.repo,
				category: category ?? existing.category,
				severity: severity ?? existing.severity,
				rule: rule ?? existing.rule,
				match: match !== undefined ? match : existing.match,
				fix: fix !== undefined ? fix : existing.fix,
				confidence: confidence ?? existing.confidence,
			});
			return {
				content: [
					{
						type: 'text' as const,
						text: `Rule updated: ${updated.id}\n[${updated.category} / ${updated.severity}] ${updated.rule}`,
					},
				],
			};
		},
	);

	// 4. validate_diff
	server.tool(
		'validate_diff',
		'Check a unified diff against rules and return violations. Increments violation counter for matched rules.',
		{
			repo: z.string().describe('Repository slug'),
			diff: z.string().describe('Unified diff text'),
		},
		async ({ repo, diff }) => {
			const violations = validateDiff(repo, diff);
			const text = formatViolations(violations);
			return { content: [{ type: 'text' as const, text }] };
		},
	);

	// 5. manage_reviewers
	server.tool(
		'manage_reviewers',
		'List, add, update, or remove reviewer tiers. Use "blocked" to ignore bot comments during learn.',
		{
			action: z.enum(['list', 'add', 'remove']).describe('Action'),
			username: z.string().optional().describe('Reviewer username'),
			tier: ReviewerTierEnum.optional().describe(
				'Trust tier: senior (2x), lead (3x), blocked (ignored). Everyone else = peer (1x).',
			),
		},
		async ({ action, username, tier }) => {
			if (action === 'list') {
				const reviewers = listReviewers();
				if (reviewers.length === 0) {
					return {
						content: [
							{
								type: 'text' as const,
								text: 'No reviewers configured. Everyone is treated as peer (1x). Add leads/seniors for boost, bots as "blocked" to filter.',
							},
						],
					};
				}
				const lines = reviewers.map(
					(r) => `- ${r.username}: ${r.tier} (since ${r.created_at.split('T')[0]})`,
				);
				return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
			}

			if (!username) {
				return { content: [{ type: 'text' as const, text: 'Username required.' }] };
			}

			if (action === 'remove') {
				const ok = removeReviewer(username);
				return {
					content: [
						{
							type: 'text' as const,
							text: ok ? `Removed ${username}.` : `${username} not found.`,
						},
					],
				};
			}

			if (!tier) {
				return { content: [{ type: 'text' as const, text: 'Tier required for add.' }] };
			}
			const reviewer = upsertReviewer(username, tier);
			return {
				content: [
					{
						type: 'text' as const,
						text: `Reviewer ${reviewer.username} set to ${reviewer.tier}.`,
					},
				],
			};
		},
	);
}
