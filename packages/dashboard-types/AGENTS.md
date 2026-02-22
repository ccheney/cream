# dashboard-types

Shared TypeScript types for dashboard UI and API communication. Ensures type safety across client-server boundary.

## Skills
Always activate: `modern-javascript`

## Key Dependencies

- **zod v4** - Schema validation for API contracts
  - Use context7 for Zod v4 schema inference and validation patterns
  - Web search for Zod v4 discriminated unions and runtime validation

## Related Plans

- `/docs/plans/22-self-service-dashboard.md` - Dashboard architecture and features

## Structure

- `src/api/` - API request/response types
- `src/ui/` - UI component prop types
- `src/websocket.ts` - WebSocket message types
