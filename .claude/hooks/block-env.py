#!/usr/bin/env python3
"""PreToolUse hook: stop Claude from reading or changing .env files. .env.example is allowed."""
import json
import re
import sys

# ".env" or ".env.<suffix>" as a file name (not process.env, .envrc or .env.example)
ENV_FILE = re.compile(r"(?:^|[\s/\\\"'=<>(:;|&`])\.env(?:\.(?!example\b)[\w.-]+)?(?![\w.-])")

# Only the fields that name a file or run a command; file contents (Write/Edit) may mention .env freely
FIELDS = {
    "Read": ["file_path"],
    "Edit": ["file_path"],
    "MultiEdit": ["file_path"],
    "Write": ["file_path"],
    "NotebookEdit": ["notebook_path"],
    "Grep": ["path", "glob"],
    "Bash": ["command"],
}

data = json.load(sys.stdin)
tool_input = data.get("tool_input") or {}
for field in FIELDS.get(data.get("tool_name"), []):
    value = tool_input.get(field)
    if isinstance(value, str) and ENV_FILE.search(value):
        print("Blocked by project hook: Claude may not access .env files (.env.example is fine). "
              "Ask the user to run this themselves if needed.", file=sys.stderr)
        sys.exit(2)
