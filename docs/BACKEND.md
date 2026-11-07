# Backend operations

## What is connected

The Supabase project `iblhpkoxlcttwhspiduu` hosts PostgreSQL, authentication, a private document bucket, and three deployed Edge Functions:

- `workspace-api`: authenticated organization-scoped listing, creation, editing and deletion.
- `sales-intelligence`: a persisted diagnosis and sourced, rules-based advisor using actual records. It is deliberately labeled rules-based; no external language model is connected.
- `campaign-delivery`: manager-approved sending to opted-in contacts through Resend. A batch is limited to 10 recipients. Provider credentials must be supplied before sending is enabled.

Each function validates the bearer token with Supabase Auth inside the function. Gateway `verify_jwt = false` does **not** make the handlers anonymous: missing or invalid user credentials are rejected by the handler. This supports current Supabase signing keys while retaining explicit authentication checks.

The Node API is a backend-for-frontend. The browser receives HttpOnly, SameSite cookies; Supabase access and refresh tokens are never persisted to localStorage. Production cookies are Secure and host-only. State-changing browser requests must carry an allowed Origin. The browser stores only the selected organization ID as a preference.

## Run locally

1. `npm ci`.
2. Copy `.env.example` to `.env.local` and set the Supabase keys on the server. The local installation is already configured. Never add `VITE_` to privileged keys.
3. `npm run dev` runs the API on 8787 and the website on 5173. Open `http://127.0.0.1:5173`.
4. Sign up, verify the email, sign in and create an organization.

`npm run build` builds the client. `npm start` runs the API. The Vite preview command previews static assets and is not a substitute for the API server.

## Roles and tenant isolation

| Role | Read | Edit records | Approve campaigns / delete | Manage team / settings |
|---|---|---|---|---|
| Organization owner | Yes | Yes | Yes | Yes; can assign admins |
| Admin | Yes | Yes | Yes | Yes; cannot appoint or alter admins |
| Manager | Yes | Yes | Yes | No |
| Member | Yes | Yes | No | No |
| Viewer | Yes | No | No | No |

Organization ownership cannot be assigned through the ordinary member-role endpoint. Composite foreign keys prevent a contact, deal, task or recipient from referencing another tenant's record. Public application tables have RLS. Tables with security or workflow state are written through guarded functions or server handlers rather than arbitrary browser updates.

Platform ownership is a separate role, never a client-controlled profile field. The configured owner email is held in a private database allowlist, not committed in source. A database trigger assigns the role only after the matching Auth email is verified. For a new installation, set `PLATFORM_OWNER_EMAIL` in the deployment shell, run `node scripts/register-owner.js`, review the generated ignored SQL, then apply it with `supabase db query --linked --file work/register-owner.sql`.

The platform console at `/platform` shows a limited organization directory. Actual memberships open in `/app` under their organization role. Supporting another organization requires a reason and opens `/support/:organizationId` for one hour. The session ID must accompany organization requests in `x-support-session-id`. It is bound to the requesting owner and selected organization, and grants read and ordinary write access. Administration, approvals, billing and CSV exports require the corresponding membership capability. Start, end and workspace changes are audited.

The console directory pages all organizations and supports name search and follow-up status filters. The organization detail shows membership counts, billing summaries, support history and private follow-up notes. Platform-only changes are recorded separately and use a revision check to prevent overwriting a concurrent edit.

## Core API

All browser endpoints start with `/api`. Protected organization endpoints require `x-organization-id`. Pagination uses `limit` (max 100) and `offset`; search uses `search`.

| Endpoint | Purpose |
|---|---|
| `POST /auth/signup`, `/auth/login`, `/auth/logout` | Registration and cookie sessions |
| `POST /auth/forgot-password`, `/auth/password` | Reset flow and authenticated password update |
| `POST /auth/session`, `/auth/exchange` | Confirmation callback into HttpOnly cookies |
| `GET /bootstrap` | Identity, memberships, platform role and active support sessions |
| `POST /organizations`, `PATCH /organization` | Create organization and edit company context |
| `GET/POST /resources/:resource` | List or create records |
| `PATCH/DELETE /resources/:resource/:id` | Edit or remove a record within the current organization |
| `GET /dashboard` | Current record-based metrics, capped at 1,000 recent rows per module |
| `POST /diagnosis`, `/advisor` | Grounded workspace review |
| `POST /campaigns/:id/approve`, `/send` | Approval and explicit real email send |
| `GET /team`, `PATCH /team/:userId` | Team directory and guarded role updates |
| `POST /invitations`, `/invitations/accept` | Expiring links bound to the invited verified email |
| `GET /platform/organizations` | Platform-owner directory |
| `POST /platform/support`, `DELETE /platform/support/:orgId` | Audited support access |
| `GET/POST /documents`, `GET /documents/:id` | Private files and 60-second signed downloads |
| `POST /import/prospects`, `GET /export/:resource` | Validated CSV import and formula-safe CSV export |
| `GET /integrations` | Actual server configuration status |
| `POST /billing/checkout`, `/billing/portal` | Stripe-hosted checkout and management |
| `POST /webhooks/stripe`, `/webhooks/resend` | Signed, deduplicated provider events |
| `POST /prospects/discover` | Apollo company lookup; results require review before saving |
| `POST /demo` | Persist public demo requests |

Writable resources: `offers`, `icps`, `prospects`, `contacts`, `lists`, `list_contacts`, `campaigns`, `campaign_recipients`, `deals`, `tasks`, `reports`. Campaign recipients can only be added while the campaign is a draft; modifying an approved message clears approval. Delivery states cannot be forged through the generic API.

## Deploy

The Supabase migrations and Edge Functions are already deployed. To reproduce:

```sh
supabase link --project-ref iblhpkoxlcttwhspiduu
supabase db push --linked
supabase functions deploy workspace-api
supabase functions deploy sales-intelligence
supabase functions deploy campaign-delivery
```

The production website is https://inem-acquire.vercel.app. Set server environment variables from `.env.example`; `APP_URL` must match the actual HTTPS website origin. Supabase Auth uses this production Site URL, with `/auth/callback` and `/reset-password` allowed on both production and local development origins. Passwords require at least six characters in the forms, API and hosted Supabase Auth configuration. Recovery links are exchanged into HttpOnly session cookies before password updates, and expired/used links offer a new reset request.

## Deferred provider activation

External services are intentionally not activated yet. The core app fails explicitly when a provider is unconfigured; it does not mark unsent email as sent or incomplete checkout as paid.

- **Temporary authentication sender:** Gmail SMTP is configured using the user's approved sending account, with host `smtp.gmail.com`, port `465`, and sender name `Inem Acquire`. The Google app password is stored only in Supabase, never in the repository. On 7 November 2026, live recovery-email sending and a disposable signup-email test succeeded. Live sign-in, verification enforcement, secure session cookies and bootstrap were also checked. Resend remains deferred until a user-owned sending domain is available. Routine password-reset integration checks generate real recovery links without sending email.
- **Email:** server and Edge Function secrets `RESEND_API_KEY`, `OUTBOUND_FROM`; use a verified sender. Add `INBOUND_DOMAIN` for replies routed to `reply+<organization UUID>@<domain>`. On the Node server set `RESEND_WEBHOOK_SECRET`; register `/api/webhooks/resend` and route inbound mail in Resend. Only known contacts are associated with workspace messages. Unsubscribe replies are recorded as opt-outs.
- **Billing:** set server-only `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`; register signed subscription events at `/api/webhooks/stripe`. Provider event IDs are deduplicated in the same database transaction as account updates; older events cannot overwrite newer state.
- **Research:** Nigerian Discovery queries the protected Overture catalog by keyword, location or industry. It pages results and labels records that need category review. The catalog is shared and separate from saved prospects and contacts. Refresh it with `node scripts/import-discovery-catalog.js <business-candidates.csv> <needs-review.csv>` using the server environment. The import upserts by Overture place ID. Foursquare snapshot rows use a namespaced ID and retain their release and Apache 2.0 notice. The website scanner checks one business per domain and checkpoints results in a local JSONL file. Its importer fills empty contact fields and keeps the published source URL and check date. Run `node scripts/scan-discovery-websites.js` or `node scripts/extend-discovery-catalog.js` without arguments for the input formats. Source licenses and notices are in `public/data-notices/overture`. Searches outside the catalog use Wikidata company headquarters by city, country and industry. OpenStreetMap through Overpass supplies a second source when Wikidata has no matching companies. Results retain source links and are cached for 30 minutes per running server. Set `OVERPASS_URL` to use a dedicated instance. The lead table streams public website results for up to 12 companies per batch with four concurrent sites. The reader uses Cheerio for HTML and organization markup, and libphonenumber-js to normalize published numbers. It checks up to four permitted pages per company and records source URLs with emails, phone numbers, and any address, headcount, or company profile found. A published address does not grant email consent. The legacy Apollo endpoint remains available if configured.
- **Gemini:** set `GEMINI_API_KEY` as a server-only Vercel variable from [Google AI Studio](https://aistudio.google.com/api-keys), then redeploy. The default model is `gemini-3.1-flash-lite`. It ranks public industry categories and generates next steps from fixed playbook topics. Names, contact details, record counts, notes and the advisor's free-text question stay out of the Gemini request. The evidence rules and directory search work without Gemini. Discovery’s separate Search beyond catalog action sends only the submitted public business keyword or industry label to Gemini. It searches OpenStreetMap and Wikidata, falls back to a separately imported Overture website-candidate set in Nigeria, and removes catalog matches before showing results. The catalog response contains page rows and a next-page flag. The app checks websites independently for published contacts. API quotas apply according to the Google project.

## Operational limits

Metrics are bounded snapshots. Invitations are shareable links. Diagnosis scores use evidence rules, with optional Gemini suggestions. Recurring email scheduling, autonomous outreach, CRM OAuth synchronization, subscription entitlement enforcement and production monitoring are outside the current setup.

Delivery is explicit, approval-gated and idempotent per recipient. Ambiguous provider outcomes are left for review; there is no automatic retry that could duplicate mail. A process interruption during a batch can leave a job requiring operator review. Audit logs must be reviewed and retention/backup policies set for a production launch.

## Verification

The 7 November workspace audit added a consistent compact header, organization switching, account profile editing, workspace search, contact-list and campaign-recipient review/removal, provider-aware prospect research and the existing Stripe customer portal. The shared capability matrix denies unknown roles/actions. Database guards enforce organization membership for task assignments and prevent deleting sent or approved campaign history. Migration `202611070007_role_and_assignment_guards.sql` and `workspace-api` are deployed.

The integration suite exercises all five organization roles, tenant isolation, assignment protection, draft-only recipient removal and time-limited audited platform support. Browser tests cover saved profile edits, filtered search results, list membership changes, viewer controls and selecting a newly created second organization. The mobile audit checks 84 route/viewport combinations at 320, 390 and 768px; it found no horizontal page overflow, small mobile form inputs or browser errors.

```sh
npm test
npm run test:integration
node tests/browser.js
node tests/password-reset.integration.js
node tests/auth-session.browser.js
```

Integration tests create and remove uniquely named fixture users and organizations in the configured project. They do not send emails, charge a card or run provider searches. Browser checks require installed Chrome and the local API/Vite servers. RLS, roles, cross-tenant references, support access, campaign approval, signature checks, cookies and real record persistence are covered. Production-provider delivery and payment capture remain untested until those services are activated.

## November launch review

The 10-organization smoke run created 10 temporary accounts and populated offers, profiles, prospects, contacts, lists, campaign drafts, deals, tasks and reports. Parallel read, diagnosis and Discovery requests passed, and foreign-organization requests were denied. Fixtures were removed. This is a functional pilot check, not a sustained traffic benchmark.

Discovery source licenses are linked at /data-sources. Published website links require a recent match to the business name or company markup. Unreviewed, unmatched, inaccessible and parked pages show a verification state. Contact information can still be reviewed independently. The verify-discovery-websites script reviews a resumable batch, and catalog website changes invalidate previous checks.

Campaign delivery and paid billing require configured live providers and an end-to-end provider test before those features are offered. Auth email uses its separately configured Supabase SMTP sender.
