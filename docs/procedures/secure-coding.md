# Secure Coding Procedure

Security checklist for modifying authentication, authorization, or sensitive data handling.

## When to use

When modifying code that handles: authentication, authorization, user input, tokens, secrets, file uploads, or external API calls.

## Checklist

### Authentication & Authorization

- [ ] All endpoints/pages require authentication (unless explicitly public)
- [ ] Authorization checks are performed server-side, not just in UI
- [ ] Role/permission checks use the project's authorization framework (from AGENTS.md)
- [ ] No endpoint allows privilege escalation

### Secrets & Tokens

- [ ] No secrets hardcoded in source (use environment variables or secret managers)
- [ ] Tokens are never logged, even at debug level
- [ ] Tokens are stored securely (follow project's token storage approach from AGENTS.md)
- [ ] Token validation is performed server-side on every request

### Input Validation

- [ ] All user input is validated at the boundary (controller/endpoint level)
- [ ] Validation uses the project's validation framework (from AGENTS.md)
- [ ] No SQL injection vectors (use parameterized queries or ORM)
- [ ] No XSS vectors (no unsafe HTML rendering, sanitize user content)
- [ ] No command injection (no unsanitized input in shell commands)

### API Security

- [ ] CORS is configured restrictively (only allowed origins)
- [ ] Rate limiting is considered for public-facing endpoints
- [ ] Error responses don't leak internal details (stack traces, SQL errors)
- [ ] File uploads validate size, type, and content

### Data Protection

- [ ] PII is not logged
- [ ] Sensitive data is not exposed in API responses beyond what's needed
- [ ] Database queries don't over-fetch (select only needed fields)

## Response to violations

- If you find a security issue in existing code while implementing a feature: note it in the Issues Register as a WARNING
- If your own code introduces a security issue: fix it immediately before proceeding
- When in doubt about a security decision: ask the user, don't guess
