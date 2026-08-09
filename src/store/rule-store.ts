import { getDb } from '../core/db.js';
import { generateId } from '../core/id.js';
import type { Rule, RuleSource, Severity } from '../schema/index.js';

export function getAllRules(repo: string, status = 'active'): Rule[] {
	const db = getDb();
	return db
		.prepare('SELECT * FROM rules WHERE repo = ? AND status = ?')
		.all(repo, status) as Rule[];
}

export function getRulesByCategory(repo: string, category: string, status = 'active'): Rule[] {
	const db = getDb();
	return db
		.prepare('SELECT * FROM rules WHERE repo = ? AND category = ? AND status = ?')
		.all(repo, category, status) as Rule[];
}

export function getRulesBySource(repo: string, source: RuleSource): Rule[] {
	const db = getDb();
	return db
		.prepare("SELECT * FROM rules WHERE repo = ? AND source = ? AND status = 'active'")
		.all(repo, source) as Rule[];
}

export function getRuleById(id: string): Rule | undefined {
	const db = getDb();
	return db.prepare('SELECT * FROM rules WHERE id = ?').get(id) as Rule | undefined;
}

export function listAllRepos(): string[] {
	const db = getDb();
	const rows = db
		.prepare("SELECT DISTINCT repo FROM rules WHERE status = 'active'")
		.all() as Array<{ repo: string }>;
	return rows.map((r) => r.repo);
}

export function getRulesFormatted(
	repo: string,
	opts?: { category?: string; source?: RuleSource },
): string {
	let rules: Rule[];

	if (opts?.category && opts?.source) {
		const db = getDb();
		rules = db
			.prepare(
				"SELECT * FROM rules WHERE repo = ? AND category = ? AND source = ? AND status = 'active'",
			)
			.all(repo, opts.category, opts.source) as Rule[];
	} else if (opts?.category) {
		rules = getRulesByCategory(repo, opts.category);
	} else if (opts?.source) {
		rules = getRulesBySource(repo, opts.source);
	} else {
		rules = getAllRules(repo);
	}

	if (rules.length === 0) {
		const filters = [repo, opts?.category, opts?.source].filter(Boolean).join(' / ');
		return `No rules found for ${filters}.`;
	}

	const grouped: Record<string, Record<string, Rule[]>> = {};
	for (const r of rules) {
		const cat = r.category;
		const sev = r.severity;
		if (!grouped[cat]) grouped[cat] = {};
		if (!grouped[cat][sev]) grouped[cat][sev] = [];
		grouped[cat][sev].push(r);
	}

	const lines: string[] = [];
	for (const [category, severities] of Object.entries(grouped)) {
		for (const [severity, categoryRules] of Object.entries(severities)) {
			lines.push(`[${repo} / ${category} / ${severity}]`);
			for (const r of categoryRules) {
				lines.push(`- ${r.rule}`);
			}
			lines.push('');
		}
	}
	return lines.join('\n').trim();
}

export function getRulesDetailed(
	repo?: string,
	opts?: { category?: string; source?: RuleSource },
): string {
	const db = getDb();
	let rules: Rule[];

	if (repo) {
		if (opts?.category && opts?.source) {
			rules = db
				.prepare(
					"SELECT * FROM rules WHERE repo = ? AND category = ? AND source = ? AND status = 'active' ORDER BY category, severity",
				)
				.all(repo, opts.category, opts.source) as Rule[];
		} else if (opts?.category) {
			rules = db
				.prepare(
					"SELECT * FROM rules WHERE repo = ? AND category = ? AND status = 'active' ORDER BY severity",
				)
				.all(repo, opts.category) as Rule[];
		} else if (opts?.source) {
			rules = db
				.prepare(
					"SELECT * FROM rules WHERE repo = ? AND source = ? AND status = 'active' ORDER BY category, severity",
				)
				.all(repo, opts.source) as Rule[];
		} else {
			rules = db
				.prepare(
					"SELECT * FROM rules WHERE repo = ? AND status = 'active' ORDER BY category, severity",
				)
				.all(repo) as Rule[];
		}
	} else {
		rules = db
			.prepare("SELECT * FROM rules WHERE status = 'active' ORDER BY repo, category, severity")
			.all() as Rule[];
	}

	if (rules.length === 0) return 'No rules found.';

	const lines: string[] = [`${rules.length} rule(s):`, ''];

	for (const r of rules) {
		lines.push(
			`**${r.id}** [${r.repo} / ${r.category} / ${r.severity}] source=${r.source} violations=${r.violations}`,
			`  ${r.rule}`,
			r.match ? `  match: \`${r.match}\`` : '',
			r.fix ? `  fix: ${r.fix}` : '',
			'',
		);
	}

	return lines.filter((l) => l !== '').join('\n');
}

export function upsertRule(params: {
	id?: string;
	repo: string;
	category: string;
	severity: Severity;
	rule: string;
	match?: string | null;
	fix?: string | null;
	confidence: number;
	source?: RuleSource;
	status?: string;
}): Rule {
	const db = getDb();
	const now = new Date().toISOString();
	const id = params.id ?? generateId();

	const existing = getRuleById(id);
	if (existing) {
		db.prepare(
			'UPDATE rules SET repo=?, category=?, severity=?, rule=?, match=?, fix=?, confidence=?, status=?, updated_at=? WHERE id=?',
		).run(
			params.repo,
			params.category,
			params.severity,
			params.rule,
			params.match ?? null,
			params.fix ?? null,
			params.confidence,
			params.status ?? existing.status,
			now,
			id,
		);
	} else {
		db.prepare(
			'INSERT INTO rules (id, repo, category, severity, rule, match, fix, confidence, violations, source, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?)',
		).run(
			id,
			params.repo,
			params.category,
			params.severity,
			params.rule,
			params.match ?? null,
			params.fix ?? null,
			params.confidence,
			params.source ?? 'manual',
			params.status ?? 'active',
			now,
			now,
		);
	}

	return getRuleById(id) as Rule;
}

export function disableRule(id: string): boolean {
	const db = getDb();
	const result = db
		.prepare("UPDATE rules SET status = 'disabled', updated_at = ? WHERE id = ?")
		.run(new Date().toISOString(), id);
	return result.changes > 0;
}

export function incrementViolations(ruleIds: string[]): void {
	if (ruleIds.length === 0) return;
	const db = getDb();
	const stmt = db.prepare('UPDATE rules SET violations = violations + 1 WHERE id = ?');
	for (const id of ruleIds) {
		stmt.run(id);
	}
}
