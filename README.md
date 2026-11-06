# Inem Acquire

A multi-organization customer acquisition platform with a React frontend, a Node API, and Supabase authentication, PostgreSQL, private file storage and Edge Functions.

## Start locally

```sh
npm ci
# Configure server values in .env.local using .env.example.
npm run dev
```

Open http://127.0.0.1:5173. Sign up, verify your email, then create an organization.

## Connected core

- HttpOnly cookie authentication and verified-email registration.
- Separate organization ownership, admin, manager, member and viewer roles.
- A verified platform-owner identity with time-limited, audited organization support access.
- Persistent offers, ideal customer profiles, prospects, contacts, lists, campaigns, deals, tasks and reports.
- CSV imports/exports, private company documents, invitations and an audit trail.
- Record-based dashboards, a rules-based sales diagnosis and a sourced workspace advisor.
- Approval-gated email delivery and signed payment/email webhook adapters, ready for provider configuration.

All 25 application tables use row-level security. The core Edge Functions and schema are deployed to Supabase. The local application is connected; a public frontend deployment and external provider activation are separate next steps.

## Verify

```sh
npm test
npm run test:integration
node tests/browser.js
npm run build
```

Integration tests use uniquely named temporary accounts and clean up their own records. They do not send campaign mail or charge cards.

See [backend operations](docs/BACKEND.md) for API routes, roles, deployment, provider setup, and operational limits. Secrets belong in server environment variables, never in GitHub or browser bundles.
