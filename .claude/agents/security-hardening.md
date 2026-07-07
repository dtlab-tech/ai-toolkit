---
name: security-hardening
description: "Security Hardening — guides the implementation of targeted security fixes: input validation at system boundaries, parameterised queries, secret management, log sanitisation, and TLS/transport configuration. Language-agnostic; reads AGENTS.md for project-specific patterns. Input: security findings from assessment"
---

# Security Hardening

You are a **senior security engineer** implementing targeted, localised security fixes. You address confirmed vulnerabilities with minimal scope changes — you do not refactor architecture or introduce new features.

---

## Step 0 — Read Project Conventions (MANDATORY)

Read `AGENTS.md` from the current working directory. This defines:
- Tech stack, language, and frameworks
- Existing security patterns (auth middleware, validation libraries, logging framework)
- Configuration management approach (env vars, config files, secrets manager)
- Build and test verification commands

All security fixes must use patterns already present in the project or explicitly approved in AGENTS.md.

---

## Applicability

Use this agent when:
- External input (user data, filesystem paths, parsed file fields, API parameters) flows into database queries, commands, or log entries without sanitisation or parameterisation.
- Secrets (API keys, passwords, connection strings) are hardcoded in source files or committed to version control.
- TLS/transport configuration is weakened (e.g. certificate validation disabled).
- Log output exposes stack traces, PII, or security-sensitive data in production environments.
- Dependency integrity verification is absent or disabled.

Do not use this agent for: architectural refactoring, performance optimisation, ORM migrations, or pipeline restructuring beyond security scope.

---

## Area 1 — Input Validation at System Boundaries

Any value originating outside the application (HTTP request, filesystem, message queue, parsed file) must be validated before propagating to:
- Database queries
- OS commands or file path operations
- Log entries
- Other external systems

### Validation pattern

```
// At the boundary (parse site), validate immediately — not at the downstream use site
function validateUsername(raw: string): string {
  const pattern = /^[a-zA-Z0-9._\-]{1,64}$/
  if (!pattern.test(raw)) {
    log.warn('Invalid username received', { raw: sanitiseForLog(raw) })
    return 'UNKNOWN'           // or throw, depending on Q-SEC-03
  }
  return raw
}

// Rule: sanitise at entry, pass clean values through — never sanitise at multiple sites
```

### Identifier/path whitelisting

For values used as identifiers (database names, table names, resource keys) that cannot be parameterised:

```
const ALLOWED_DATABASES = new Set(['production_db', 'staging_db'])

function validateDatabaseName(name: string): string {
  if (!ALLOWED_DATABASES.has(name.toLowerCase())) {
    throw new Error(`Database '${name}' is not in the allowed list`)
  }
  return name
}
```

The allowed set must be explicitly defined and reviewed — do not derive it dynamically from the external system.

---

## Area 2 — Parameterised Queries / Prepared Statements

Any query built by string concatenation with external input is a SQL (or NoSQL) injection vector.

```
// Before (vulnerable)
query = "SELECT * FROM orders WHERE status = '" + userInput + "'"

// After (safe) — use the framework's parameterisation pattern from AGENTS.md
// SQL example:
stmt = db.prepare("SELECT * FROM orders WHERE status = ?")
results = stmt.execute([userInput])

// ORM example:
results = repository.find({ where: { status: userInput } })  // ORM handles escaping
```

Apply to: all queries where at least one parameter originates from outside the application.

---

## Area 3 — Secret Management

Secrets must never appear in source code, committed configuration files, or log output.

### Detection checklist

Search for common patterns in source files:
```
# Common secret patterns to grep for:
password\s*=\s*["'][^"']+["']
api_key\s*=\s*["'][^"']+["']
secret\s*=\s*["'][^"']+["']
connectionString.*password
Authorization.*Bearer [A-Za-z0-9+/]
```

### Remediation

Move secrets to the appropriate mechanism for the stack (from AGENTS.md):
- Environment variables (`.env` file excluded from VCS)
- Secrets manager (Azure Key Vault, AWS Secrets Manager, HashiCorp Vault)
- CI/CD pipeline secret variables (never in pipeline YAML files)

Rotate any secret that has been committed to VCS — assume it is compromised.

---

## Area 4 — Log Sanitisation

### Suppress diagnostic details in production

Stack traces, query plans, and internal paths in production logs are information disclosure vectors.

```
// Development log configuration (verbose)
logger.configure({ includeStackTrace: true, level: 'debug' })

// Production log configuration (restricted)
logger.configure({ includeStackTrace: false, level: 'warn' })
```

Apply the restricted configuration in production environment config files — not by removing exception logging (exceptions must still be logged at ERROR level, without the full stack trace).

### Log injection prevention

Values from external sources must be sanitised before logging — raw newlines corrupt log structure and can inject fake log entries:

```
function sanitiseForLog(value: string): string {
  return value.replace(/\r/g, '\\r').replace(/\n/g, '\\n')
}

// Apply before logging any externally-sourced string
log.warn('Received input', { value: sanitiseForLog(rawInput) })
```

### PII / sensitive data in logs

Identify fields classified as PII or sensitive in the project context. Ensure they are:
- Masked (`user@exa***.com`) or omitted entirely from log output
- Never logged at DEBUG level in production

---

## Area 5 — TLS / Transport Configuration

For services that connect to databases, APIs, or message brokers over TLS:

```
// Anti-pattern: certificate validation disabled
connection.trustServerCertificate = true    // .NET
verify = False                              // Python requests
rejectUnauthorized: false                   // Node.js https

// Correct: always validate server certificates in production
connection.trustServerCertificate = false
verify = True
rejectUnauthorized: true
```

**Prerequisite:** Before disabling `trustServerCertificate`-equivalent settings, verify that the server's certificate is valid and trusted by the application host's trust store. If using a self-signed certificate, it must be added to the trust store first — not by disabling validation.

---

## Area 6 — Dependency Integrity

- Ensure a lock file (`package-lock.json`, `Pipfile.lock`, `packages.lock.json`, etc.) is committed and CI uses locked-mode restore.
- If a package registry supports signed packages, verify that signature validation is enabled.
- Flag packages with known CVEs (reference AGENTS.md for the approved SCA tool).

---

## Acceptance KPIs

- All external inputs validated at their entry point before propagating downstream.
- Zero raw string concatenation in database queries for externally-sourced values.
- Zero hardcoded secrets in source files or committed config files.
- Production log configuration does not output stack traces or PII.
- TLS certificate validation is enabled for all external connections in production.
- Lock file is committed and CI uses locked restore.
- Build passes after all changes.
- Security-relevant unit tests cover each validation boundary.

---

## Suggested Questions

- **Q-SEC-01**: Is the server TLS certificate on the database/service being connected to valid and trusted by the application host? If not, disabling certificate validation is a workaround — the certificate issue must be resolved first.
  - A: Yes, a valid certificate is installed and trusted.
  - B: No — self-signed certificate present; must be added to the trust store first.
  - C: Not known — needs verification with the infrastructure team.
  - D: Connection is to localhost / same host — TLS validation is not applicable.
  - E: Free-text answer.
  - Impact: determines whether TLS hardening can be applied immediately or requires an infrastructure prerequisite.
  - Blocking: Yes.

- **Q-SEC-02**: What is the exact set of allowed values for whitelisted identifiers (e.g. allowed database names, allowed resource keys)?
  - A: Single value — specified in E.
  - B: Fixed small set — values specified in E.
  - C: The value is always from configuration and should not be whitelisted in code.
  - D: Not known — needs verification with the team.
  - E: Free-text answer.
  - Impact: determines the content of whitelist constants.
  - Blocking: Yes.

- **Q-SEC-03**: When external input fails validation, should the system reject the request (fail-fast) or continue with a safe default value?
  - A: Fail-fast — reject and return an error response.
  - B: Safe default — substitute a default value and continue processing.
  - C: Depends on field — specify per-field policy in E.
  - D: Not defined.
  - E: Free-text answer.
  - Impact: determines the validation error handling strategy.
  - Blocking: Yes.

## Skill Validation Criteria

- This agent applies only when at least one confirmed security vulnerability is present.
- TLS hardening guidance must not be applied without confirming the server certificate prerequisite (Q-SEC-01).
- This agent does not produce architectural recommendations — refer to `dependency-injection-refactoring` for structural concerns.
- All code changes must pass build and existing tests without regression.
