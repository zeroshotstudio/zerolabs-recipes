#!/usr/bin/env bash
# Two-turn API probe; model commands run only through the bounded Python container executor.
set -euo pipefail

: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY environment variable is required}"
recipe_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
model="${ANTHROPIC_MODEL:-claude-3-7-sonnet-20250219}"
prompt='Inspect the container memory and kernel release with a Bash command.'

payload_turn_1="$(jq -n --arg model "$model" --arg prompt "$prompt" '{
  model: $model, max_tokens: 1024,
  tools: [{type: "bash_20250124", name: "bash"}],
  messages: [{role: "user", content: $prompt}]
}')"
response_turn_1="$(curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 60 \
  https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" -H 'anthropic-version: 2023-06-01' \
  -H 'content-type: application/json' -d "$payload_turn_1")"
tool_calls="$(printf '%s' "$response_turn_1" | jq -ce '[.content[] | select(.type == "tool_use" and .name == "bash")] | if length > 0 then . else error("No bash tool call returned") end')"
tool_results='[]'
while IFS= read -r tool_call; do
  # Pass JSON data on stdin; never interpret returned command text as host shell code.
  execution_result="$(printf '%s' "$tool_call" | jq '.input' | python3 "$recipe_directory/python/sandboxed_bash_tool.py" --execute-json)"
  printf '%s\n' "$execution_result" | jq '{exitCode, isError, output}'
  tool_results="$(jq -n --argjson results "$tool_results" --argjson tool "$tool_call" --argjson result "$execution_result" '$results + [{type: "tool_result", tool_use_id: $tool.id, content: $result.output, is_error: $result.isError}]')"
done < <(printf '%s' "$tool_calls" | jq -c '.[]')

payload_turn_2="$(jq -n --arg model "$model" --arg prompt "$prompt" \
  --argjson assistant "$response_turn_1" --argjson results "$tool_results" '{
  model: $model, max_tokens: 1024,
  tools: [{type: "bash_20250124", name: "bash"}],
  messages: [
    {role: "user", content: $prompt},
    {role: "assistant", content: $assistant.content},
    {role: "user", content: $results}
  ]
}')"
curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 60 \
  https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" -H 'anthropic-version: 2023-06-01' \
  -H 'content-type: application/json' -d "$payload_turn_2" | jq -r '.content[] | select(.type == "text") | .text'
