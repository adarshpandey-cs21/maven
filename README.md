# @adarsh-pandey/maven

[![npm version](https://img.shields.io/npm/v/@adarsh-pandey/maven.svg)](https://www.npmjs.com/package/@adarsh-pandey/maven)
[![CI](https://github.com/adarshpandey-cs21/maven/actions/workflows/ci.yml/badge.svg)](https://github.com/adarshpandey-cs21/maven/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

MCP server that learns coding conventions from PR review comments and enforces them.

- Learn conventions from Bitbucket PR comments and tasks
- Store rules in a local SQLite database
- Validate diffs against rules
- One database per machine, keyed by repo — share it and the whole team benefits

## Install

```bash
npm install -g @adarsh-pandey/maven
```

Or use directly with npx — no install needed:

```bash
npx -y @adarsh-pandey/maven      # or: pnpm dlx @adarsh-pandey/maven
```

Requires Node.js 20 or newer.

## Setup

Add to your Claude Code config (`~/.claude.json` under `mcpServers`):

```json
{
  "maven-mcp": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@adarsh-pandey/maven"]
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
sqlite3 ~/.maven-mcp/maven.db "SELECT * FROM rules;"
```

## Where rules are stored

One database for everything, at `~/.maven-mcp/maven.db`. Rules carry a `repo`
column, so a single file holds the conventions for every repository you work on —
there is no per-project database to keep track of, and nothing to commit.

Point `MAVEN_DB_PATH` at a different absolute path to override it.

## Sharing rules with your team

The database is a plain SQLite file, so sharing it is a file copy. Export with
`VACUUM INTO` rather than `cp` — a plain copy can miss recent writes still sitting
in the write-ahead log:

```bash
rm -f /tmp/team-rules.db   # VACUUM INTO refuses to overwrite an existing file
sqlite3 ~/.maven-mcp/maven.db "VACUUM INTO '/tmp/team-rules.db'"
```

Send that file to a teammate. They can either drop it in as their database:

```bash
mkdir -p ~/.maven-mcp && cp team-rules.db ~/.maven-mcp/maven.db
```

or keep their own and point at yours for a single project:

```json
{
  "maven-mcp": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@adarsh-pandey/maven"],
    "env": { "MAVEN_DB_PATH": "/abs/path/to/team-rules.db" }
  }
}
```

Rules and reviewer tiers carry across as-is — nothing in the schema is tied to a
machine or a user.

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
| `MAVEN_DB_PATH` | `~/.maven-mcp/maven.db` | Override database location. Use an absolute path. |
| `MAVEN_DEBUG` | unset | Set to enable debug logging |

## Contributing

Issues and PRs welcome at [adarshpandey-cs21/maven](https://github.com/adarshpandey-cs21/maven).

This project uses [pnpm](https://pnpm.io), **version 10 or newer**. The exact
version is pinned in the `packageManager` field, and pnpm 10+ reads that field and
switches itself to the pinned version automatically — so any recent pnpm will do:

```bash
git clone https://github.com/adarshpandey-cs21/maven.git
cd maven
pnpm install
pnpm build
pnpm lint
```

pnpm 9 and older will not work: they ignore both `packageManager` and the
`allowBuilds` setting below, and will silently produce a broken install.

`better-sqlite3` and `biome` both run install scripts, which pnpm blocks by
default. They are approved in `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  better-sqlite3: true
  '@biomejs/biome': true
```

That file is required even though this is not a monorepo — pnpm 11 moved its
settings out of `package.json` into `pnpm-workspace.yaml`, and an `allowBuilds`
block in `package.json` is silently ignored. Skipping it leaves `better-sqlite3`
without its native binding and the server crashes on startup with
`Could not locate the bindings file`.

Releases are automated: merge into the `release` branch and the
[release workflow](.github/workflows/release.yml) bumps the version from the
commit message (Conventional Commits), publishes to npm via trusted publishing,
tags, and cuts a GitHub Release.

## License

[MIT](./LICENSE) © Adarsh Pandey
