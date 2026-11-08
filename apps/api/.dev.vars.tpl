# Secret references, resolved by 1Password at run time (see docs/architecture/secrets.md).
# SENTRY_DSN is left out on purpose: the Worker runs without it locally.
# Safe to commit: it holds paths, never values. Items live in the "Employee" vault.
ENVIRONMENT=development

DATABASE_URL=op://Employee/diade-api-dev/DATABASE_URL

BETTER_AUTH_URL=http://localhost:8787
BETTER_AUTH_SECRET=op://Employee/diade-api-dev/BETTER_AUTH_SECRET

GOOGLE_CLIENT_ID=op://Employee/diade-api-dev/GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=op://Employee/diade-api-dev/GOOGLE_CLIENT_SECRET