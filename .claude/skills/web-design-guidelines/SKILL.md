---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the guidelines from `reglas.md`, in this skill's folder
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the fetched guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

The rules are pinned in `reglas.md`, next to this file: a copy of
`vercel-labs/web-interface-guidelines/command.md` (commit 434b7f9, 05/10/2026).
Do NOT fetch them from the internet: a remote file that changes would change what this skill does.
In Spanish copy, ignore the "Title Case" rule: Spanish uses sentence case.

## Usage

When a user provides a file or pattern argument:
1. Read `reglas.md` from this skill's folder
2. Read the specified files
3. Apply all rules from the fetched guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.
