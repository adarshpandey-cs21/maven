import type { Violation } from '../schema/index.js';
import { getAllRules, incrementViolations } from '../store/rule-store.js';
import { parseDiff } from './diff-parser.js';

export function validateDiff(repo: string, diff: string): Violation[] {
	const rules = getAllRules(repo);
	if (rules.length === 0) return [];

	const files = parseDiff(diff);
	const violations: Violation[] = [];

	const regexRules = rules.filter((r) => r.match);

	for (const file of files) {
		for (const rule of regexRules) {
			if (!rule.match) continue;

			let regex: RegExp;
			try {
				regex = new RegExp(rule.match, 'gi');
			} catch {
				continue;
			}

			for (const line of file.additions) {
				const match = regex.exec(line.content);
				if (match) {
					violations.push({
						rule_id: rule.id,
						rule_text: rule.rule,
						severity: rule.severity,
						file: file.path,
						line: line.lineNumber,
						matched_text: match[0],
						fix_hint: rule.fix,
					});
				}
				regex.lastIndex = 0;
			}
		}
	}

	// Increment violation counters for each rule that was violated
	const violatedRuleIds = [...new Set(violations.map((v) => v.rule_id))];
	incrementViolations(violatedRuleIds);

	return violations;
}

export function formatViolations(violations: Violation[]): string {
	if (violations.length === 0) return 'No violations found.';

	const lines: string[] = [`Found ${violations.length} violation(s):`, ''];

	const bySeverity = groupBy(violations, (v) => v.severity);
	const order = ['critical', 'important', 'suggestion', 'nit'] as const;

	for (const severity of order) {
		const group = bySeverity[severity];
		if (!group?.length) continue;

		lines.push(`## ${severity.toUpperCase()} (${group.length})`);
		for (const v of group) {
			lines.push(`- **${v.file}${v.line ? `:${v.line}` : ''}**: ${v.rule_text}`);
			if (v.matched_text) lines.push(`  Matched: \`${v.matched_text}\``);
			if (v.fix_hint) lines.push(`  Fix: ${v.fix_hint}`);
		}
		lines.push('');
	}

	return lines.join('\n').trim();
}

function groupBy<T>(items: T[], fn: (item: T) => string): Record<string, T[]> {
	const groups: Record<string, T[]> = {};
	for (const item of items) {
		const key = fn(item);
		if (!groups[key]) groups[key] = [];
		groups[key].push(item);
	}
	return groups;
}
