export interface DiffFile {
	path: string;
	additions: DiffLine[];
	deletions: DiffLine[];
}

export interface DiffLine {
	lineNumber: number;
	content: string;
}

export function parseDiff(diff: string): DiffFile[] {
	const files: DiffFile[] = [];
	const fileChunks = diff.split(/^diff --git /m).filter(Boolean);

	for (const chunk of fileChunks) {
		const headerMatch = chunk.match(/a\/(.+?)\s+b\/(.+)/);
		if (!headerMatch) continue;

		const path = headerMatch[2];
		const additions: DiffLine[] = [];
		const deletions: DiffLine[] = [];

		const lines = chunk.split('\n');
		let currentLine = 0;

		for (const line of lines) {
			const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
			if (hunkMatch) {
				currentLine = Number.parseInt(hunkMatch[1], 10);
				continue;
			}

			if (line.startsWith('+') && !line.startsWith('+++')) {
				additions.push({ lineNumber: currentLine, content: line.slice(1) });
				currentLine++;
			} else if (line.startsWith('-') && !line.startsWith('---')) {
				deletions.push({ lineNumber: currentLine, content: line.slice(1) });
			} else if (!line.startsWith('\\')) {
				currentLine++;
			}
		}

		files.push({ path, additions, deletions });
	}

	return files;
}
