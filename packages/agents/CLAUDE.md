# agents

Agent prompts, tools, and evaluations for the 8-agent trading network (analyst, strategist, risk manager, portfolio manager, execution coordinator, sentiment analyst, macro analyst, grounding agent).

## Skills
Always activate: `modern-javascript`, `ai-sdk`, `clean-ddd-hexagonal`

## Key Dependencies

- **@google/genai** - Gemini SDK for structured outputs, tool use, long-context reasoning
  - Use context7 for latest API patterns, model capabilities, safety settings
  - Web search for Gemini 2.0/2.5 feature updates and best practices

## Related Plans

- `/docs/plans/05-agents.md` - Agent architecture and responsibilities
- `/docs/plans/48-grok-grounding-agent.md` - Real-time fact verification
- `/docs/plans/50-runtime-constraints-to-agents.md` - Dynamic constraint injection

## Structure

- `src/prompts/` - System prompts per agent role
- `src/tools/` - Agent tool definitions and handlers
- `src/evaluations/` - Agent output quality metrics
