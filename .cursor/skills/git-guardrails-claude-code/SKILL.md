---
name: git-guardrails-claude-code
description: >-
  Set up Claude Code (claude.ai/code) PreToolUse Bash hooks to block dangerous git
  commands before they run. Not Cursor Agent hooks — this repo uses
  .claude/settings.json only. Use when the user wants git safety in Claude Code,
  or to refresh the block-dangerous-git script.
---

# Setup Git Guardrails

Sets up a **Claude Code** `PreToolUse` hook (matcher: Bash) that intercepts and blocks dangerous git commands before Claude Code executes them. **Cursor** agent sessions do not read `.claude/settings.json` for the same mechanism; this skill does not configure `.cursor/hooks/`. For similar automation in Cursor, use Cursor's own hooks / docs (or a global create-hook workflow outside this repo).

## What Gets Blocked

- `git push` (all variants including `--force`)
- `git reset --hard`
- `git clean -f` / `git clean -fd`
- `git branch -D`
- `git checkout .` / `git restore .`

When blocked, Claude sees a message telling it that it does not have authority to access these commands.

## Steps

### 1. Ask scope

**This repository** already ships project hooks: `.claude/settings.json` references `.claude/hooks/block-dangerous-git.sh`. If the user only wants the template updated, compare the bundled [scripts/block-dangerous-git.sh](scripts/block-dangerous-git.sh) with the installed script and merge changes — avoid duplicating `PreToolUse` entries in settings.

Ask the user: install or update for **this project only** (`.claude/settings.json`) or **all projects** (`~/.claude/settings.json`)?

### 2. Copy the hook script

The template script bundled with this skill: [scripts/block-dangerous-git.sh](scripts/block-dangerous-git.sh) (same directory as this `SKILL.md` under `.cursor/skills/git-guardrails-claude-code/`).

Copy it to the target location based on scope:

- **Project**: `.claude/hooks/block-dangerous-git.sh` (this repository may already have a project hook; compare and update if the template changes)
- **Global**: `~/.claude/hooks/block-dangerous-git.sh`

Make it executable with `chmod +x`.

### 3. Add hook to settings

Add to the appropriate settings file:

**Project** (`.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-dangerous-git.sh"
          }
        ]
      }
    ]
  }
}
```

**Global** (`~/.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/block-dangerous-git.sh"
          }
        ]
      }
    ]
  }
}
```

If the settings file already exists, merge the hook into existing `hooks.PreToolUse` array — don't overwrite other settings.

### 4. Ask about customization

Ask if user wants to add or remove any patterns from the blocked list. Edit the copied script accordingly.

### 5. Verify

Run a quick test:

```bash
echo '{"tool_input":{"command":"git push origin main"}}' | <path-to-script>
```

Should exit with code 2 and print a BLOCKED message to stderr.
