# @adarshpandey/maven

[![npm version](https://img.shields.io/npm/v/@adarshpandey/maven.svg)](https://www.npmjs.com/package/@adarshpandey/maven)
[![CI](https://github.com/adarshpandey-cs21/maven/actions/workflows/ci.yml/badge.svg)](https://github.com/adarshpandey-cs21/maven/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

MCP server that learns coding conventions from PR review comments and enforces them.

- Learn conventions from Bitbucket PR comments and tasks
- Store rules in a local SQLite database
- Validate diffs against rules
- Team shares the DB — extract once, everyone benefits

## Install

```bash
npm install -g @adarshpandey/maven
```

Or use directly with npx — no install needed:

```bash
npx -y @adarshpandey/maven
```

Requires Node.js 20 or newer.

## Setup

Add to your Claude Code config (`~/.claude.json` under `mcpServers`):

```json
{
  "maven-mcp": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@adarshpandey/maven"]
  }
}
```

Or if installed globally (the package exposes a `maven-mcp` binary):

```json
{
  "maven-mcp": {
    "type": "stdio",
    "command": "maven-mcp"
  }
}
```

## Tools

| Tool | What it does |
|------|-------------|
| `learn` | Takes PR comments, filters blocked users, returns all comments for Claude to extract conventions |
| `get_rules` | Returns rules for a repo — filter by category, source, compact/detailed view |
| `save_rule` | Add/update/disable rules — supports batch save (multiple rules in one call) |
| `validate_diff` | Check a diff against rules, return violations, increment violation counter |
| `manage_reviewers` | Set reviewer tiers: lead (3x), senior (2x), blocked (ignored) |

## Usage

### 1. Block bots (one-time)

```
Block sonarqube-bot in maven-mcp, it's a bot
```

### 2. Set trusted reviewers (one-time)

```
Add john.smith as lead in maven-mcp
```

### 3. Learn from PRs

```
Fetch all comments and tasks from PR #142 in backend-api (project PROJ)
and learn conventions from them using maven-mcp
```

Claude will:
1. Fetch comments + tasks from Bitbucket (with `include_tasks=true`)
2. Pass them to `learn` — blocked users filtered out
3. Read all comments and propose a numbered list of rules
4. Wait for you to pick: `"save all"`, `"save 1,3,5"`, `"save all except 2"`
5. Batch-save your picks

### 4. Validate a PR

```
Review PR #205 against maven-mcp rules
```

### 5. View stored rules

```
Show me all rules for backend-api in detail
Show only typescript rules for backend-api
Show my manual rules for backend-api
```

Or query SQLite directly:

```bash
sqlite3 maven-db/maven.db "SELECT * FROM rules;"
```

## Schema

```sql
rules (
  id, repo, category, severity, rule, match, fix,
  confidence, violations, source, status, created_at, updated_at
)

reviewers (
  username, tier, created_at
)
```

**Rules fields:**
- `category` — typescript, svelte, general, css, etc.
- `severity` — nit, suggestion, important, critical
- `source` — `manual` (you added it) or `learned` (from PR comments)
- `violations` — counter incremented each time `validate_diff` catches a hit
- `match` — optional regex for auto-detection in diffs
- `fix` — optional fix hint shown with violations

**Reviewer tiers:**
- `lead` — 3x weight in scoring
- `senior` — 2x weight
- `blocked` — comments ignored during learn
- Everyone else — peer, 1x weight (no entry needed)

## How rules look to Claude

Plain text, zero overhead:

```
[backend-api / typescript / critical]
- Always handle default case in switch
- Use Result<T,E> pattern, never throw from service functions

[backend-api / general / important]
- PR must have ticket ID in title
- Clear naming — function names must match what they return
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `MAVEN_DB_PATH` | `<cwd>/maven-db/maven.db` | Override database location. Set this to an absolute path so the DB does not move with your shell's working directory. |
| `MAVEN_DEBUG` | unset | Set to enable debug logging |

## Contributing

Issues and PRs welcome at [adarshpandey-cs21/maven](https://github.com/adarshpandey-cs21/maven).

```bash
git clone https://github.com/adarshpandey-cs21/maven.git
cd maven
npm install
npm run build
npm run lint
```

Releases are automated: merge into the `release` branch and the
[release workflow](.github/workflows/release.yml) bumps the version from the
commit message (Conventional Commits), publishes to npm via trusted publishing,
tags, and cuts a GitHub Release.

## License

[MIT](./LICENSE) © Adarsh Pandey
