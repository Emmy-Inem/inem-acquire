# Capability audit — 7 November 2026

## Implemented and exercised

| Surface | Useful outcome | Verification |
|---|---|---|
| Discovery | 50-business expanded-search target; combine sources rather than stopping after a small result; up to 50 streamed website checks | Automated 50-row result and 50-site stream checks; live catalog pagination |
| Website quality | Match identity, corroborate recovered domains, preserve prior URL and evidence, fill missing published contacts | Recovery positive/negative tests; atomic database test including stale-update rejection; owner-only repair batch |
| Saved businesses | Structured inbox/phone, create a linked contact or deal | Browser creates and persists both |
| Customer profiles | Target audience criteria tied to an offer | Existing validated resource API; explicit guidance distinguishes profiles from contacts |
| Contacts | Named people/business inboxes, phone, notes, business association and permission | Connected workflow and cross-tenant relationship checks |
| Lists | Reusable contact audience with real membership | Browser adds a contact; membership API tests |
| Deals / Pipeline | Qualified opportunity value/stage; linked company | Browser creates a deal; stage mutations and tenant checks |
| Tasks | Due today, overdue, open/completed, dated task, assignment, complete/reopen | Browser and real backend transitions; foreign assignment denied |
| Advisor | Actual question plus company/offers/profiles/activity; explicit file attachments; validated page actions | Controlled model response verifies exact context and document inclusion; fallback answers differ by topic; foreign file rejected |
| Company | Private photo upload/change/remove and company details | Image bytes validation; cross-organization image isolation; rendered mobile views |
| Files | Upload/open/delete private PDF/text/CSV; expiring downloads | Real storage round trip and role denials |
| Reports | Select module and report columns; download actual CSV | Browser downloads and checks task report contents; export bounded to 5,000 rows |
| Team | Guarded role changes, plan seats, invite/revoke | Existing role matrix plus atomic seat allowance/revocation checks |
| Billing / Pricing | Same pricing component on both public pages; atomic monthly credits; active offer/profile and seat allowances; usage shown | Credit concurrency test, plan denial tests and billing route checks |
| Platform console | Tenant management, audited support, guarded website-quality maintenance | Existing platform isolation integration checks; ordinary roles cannot enter owner routes |

Browser coverage includes all workspace routes and rendered 320, 390, 820 and 1440px layouts. Automated functional tests exercise final state and persistence, not simply whether a page renders.

## External launch gates and limits

- Public sources cannot guarantee 50 additional *verified contacts* for every narrow query. The system targets 50 real businesses and reports a shortfall rather than inventing rows, email addresses or websites.
- Historical catalog websites are not all corrected by installing the repair workflow. Corrections require completed reviews; blocked scanning alone is not proof of an invalid domain. The console can work through flagged records in batches.
- AI and web-search quotas/availability belong to the configured provider. Missing or limited AI produces an explicit fallback, never fabricated results. Local model tests use controlled responses; production service calls must also be checked after deployment.
- Paid outbound delivery/inbound email and paid checkout still require their live provider/domain configuration and delivery/payment tests. Auth email configuration does not establish a campaign sender for every organization.
- SSO and custom enterprise integrations are scoped services, not enabled self-service features. Pricing now states this explicitly.
- Do not describe the release as having verified every catalog record or activated billing/email services that remain unconfigured.
## Production verification update

The deployed Advisor returned an AI-assisted answer successfully. Live task completion/reopen, company asset pages, unified public pricing and the research credit meter passed after fixing the billing table's date-column ordering. Google web-search grounding returned provider 429 on the connected account; the tested Lagos/software expanded search therefore returned five additional businesses, not fifty. Treat live web-search capacity as an unresolved launch gate. Do not advertise a guaranteed 50 verified contacts per query.

Website recovery also supports unverified domain hypotheses from the working standard AI model when live search is unavailable. They are never exposed as confirmed domains until the same first-party identity and public phone/location checks succeed. This fallback improves recovery; it does not establish that all historical catalog websites have been corrected.
