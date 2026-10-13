# Privacy notice preparation — fact-dependent draft

**Prelaunch preparation, 2026-10-11. This is not an approved privacy policy.**

Do not publish assumptions about vendors, retention, analytics, hosting countries
or data received by the seller. Worldwide sales require a real data map and an
applicability assessment; the Australian small-business exemption does not by
itself exempt EU-directed processing from GDPR.

## Observed existing website — corrections required before launch

Read-only evidence is recorded in the launch-preparation CMS file
`legal-dataflow-inventory.md`. The live `/privacy-policy` page currently gives
“Jimmy Goode • ZeroShot Studio”, Berlin, Deutschland and
`contact@zeroshot.studio`, which do not match the confirmed Australian seller
details. Its broad GDPR-compliance label and generic aggregated-analytics text
must not be reused as proof of compliance. The existing `/terms-of-service`
page is educational/general-resource text with a different contact, not the
completed paid Agent Kit sales contract. These are Next.js application pages;
their corrections require the actual application build/deployment route.

| Observed source flow | Known collection/behavior | Still unverified |
| --- | --- | --- |
| GA4 / Google tag | Global layout loads the Google script and initializes `gtag('config', ...)` after interaction; no consent condition appears around it. | Production regional behavior, consent controls, account settings, retention, Google agreement/transfers and cookies must be checked. Source observation is not proof of a lawful consent flow. |
| First-party analytics | Page-view beacon; PostgreSQL stores path, permitted UTM/ref query parameters, referrer, user agent, IP hash, visitor type and event metadata. | Actual retention, IP-hashing behavior/linkability, access, hosting country, purpose/basis and deletion must be verified. Hashing does not itself establish anonymity. |
| Contact | Name, email, optional subject and message plus truncated IP hash stored; IP used for rate limiting. | Retention, mailbox/hosting, security/access, onward use and notice at collection. |
| Cloudflare Turnstile | Optional contact verification forwards `remoteip` when configured. | Actual production binding/site key and processor terms/transfer/notice. Do not claim it is active solely from optional code. |
| Newsletter | Email, optional name, status, IP hash and segment memberships stored; endpoint activates subscriptions. | Actual mailbox verification, marketing permission, lawful basis, campaign vendor and unsubscribe. No unproved double-opt-in claim. |
| Public MCP | RPC context can include IP-derived context, client/user-agent and optional session identifier. | Actual stored fields, purposes, retention and access controls. |

The kit's local dashboard does not contain the seller site's GA4 script or
newsletter/contact handlers. Its task/document/result/artifact/auth/audit data
is kept in the operator's PostgreSQL installation; provider calls may send
task prompts and tool-selected documents to the operator-configured provider.
The current standalone kit marketing page has empty checkout configuration and
no lead-collection form. These observations do not establish a payment provider,
delivery platform, hosting region, retention schedule or compliant consent flow.
Describe site and product flows separately; inspect any actual seller support
access before claiming the seller never receives installation data.

## Verified operator and draft notice opening

James John Goode, ABN 30 285 930 662, 10 Vernon Court, Epping VIC 3076, Australia,
hello@jimmygoode.com, is the operator identified for this draft. The notice must
state whether he is a controller for each flow. [REQUIRED: if a merchant of
record also independently controls purchase/payment data, give its actual
identity and privacy-notice URL; do not call it merely our processor.]

Proposed opening, after the table below is completed:

> This notice explains how the identified parties handle personal information
> when you visit our product website, buy or receive Agent Kit, or contact us.
> Agent Kit runs on a customer's own infrastructure. We distinguish information
> actually received by us from data kept in that installation or sent directly
> by it to a model provider. The relevant customer operator and providers are
> responsible for their own processing. This notice describes our actual sales,
> website and support flows.

## Required processing inventory

| Flow | Fields and purpose to verify | Parties and lawful basis to record | Retention / transfers to verify |
| --- | --- | --- | --- |
| Website request/security logs | IP, user agent, request/time, security events; actual cookies and local storage | Actual host/CDN/controller/processor; necessary security interest or other applicable basis, with assessment | Actual log duration, countries and safeguards |
| Website usage/Google analytics | Observed GA4 and PostgreSQL usage events above; campaign/referrer/IP-derived data | Actual controller/Google role, purpose/basis, relevant cookie consent and transfer terms | Actual analytics/vendor retention, anonymization assessment and countries |
| Checkout and payment | Name/contact/billing country, invoice information, order/value/tax status; whether card details ever reach James | Actual retailer/MoR/payment gateway and separate-controller roles; contract / applicable legal obligation or assessed legitimate interest as appropriate | Processor countries, accounting and chargeback retention, tax requirements |
| Entitlement and delivery | Order identifier, purchaser email, version/checksum, download link/events | Actual delivery vendor and access scope; contract performance | Actual link expiry, redelivery retention and logs |
| Support/refund/withdrawal | Email, correspondence, order reference, requested remedy; avoid passwords, API keys and unnecessary sensitive data | Responsible seller/support mailbox/vendors; contractual/mandatory-rights handling and appropriate basis | Claim/complaint retention, email-host location, immediate receipt evidence |
| Marketing | Actual signup fields, preferences, campaign data, tracking | Optional separate permission where required; unsubscribe route; no default advertising consent with purchase | Consent record, suppression record, vendor/countries |
| Product telemetry | Whether any seller-directed analytics/crash reporting exists in the delivered version | Verify code/network behavior; do not assert no collection solely because it is self-hosted | Fields, vendors, opt-in/default, transfers and retention if any |
| Customer installation | Documents/tasks/provider usage on customer host; direct provider API calls | Customer-controlled installation and direct provider flow unless seller actually accesses it | Do not pretend this data is collected by James automatically; disclose any real support access separately |

## Notice sections that must be completed

1. Controller identity/contact, any joint controllers, and any applicable EU
   representative/DPO details. GDPR Article 27 requires an EU representative for
   relevant non-EU controllers unless a documented exception applies. Recurring
   worldwide EU sales must not be assumed “occasional”.
2. Categories, sources, purposes and specific legal bases. Explain legitimate
   interests where relied on. Do not seek compulsory marketing consent as a
   condition of the contract. A legal obligation under GDPR Article 6(1)(c) must
   have the legal basis required by Article 6(3); do not automatically equate an
   Australian-only accounting rule with an EU/Member-State legal obligation.
3. Actual recipients/categories and each supplier's role, relevant contracts,
   security obligations and any GDPR Article 28 processing agreements.
4. Storage periods or meaningful criteria per purpose, including actual tax and
   claim requirements. Do not choose fictional “30 days” or “forever” defaults.
5. International transfer mechanism where needed under GDPR Chapter V. Australia
   is not covered by a blanket EU adequacy decision; identify applicable clauses,
   transfer assessment and supplementary measures, not generic “secure servers”.
6. Access, correction, erasure, restriction, objection, portability and consent
   withdrawal rights where applicable, their lawful limits and a real request
   channel. State the applicable supervisory complaint right and authority route.
7. Whether providing data is required by law/contract and consequences of not
   providing it. Describe automated decisions/profiling only if actually used.
8. Actual cookies/analytics. Before enabling nonessential access/storage for EU
   users, implement the required prior consent and withdrawal controls; a privacy
   link alone is not consent. Essential-only claims require a technical check.
9. Australian Privacy Act applicability, including turnover and exceptions, and
   any applicable breach/complaint requirements. No exemption has been established
   from ABN/GST status alone. Also review other served markets' privacy rules.
10. Notice effective date, available languages and material-change communication.

For actual commercial-email/newsletter activity, separately verify the Australian
Spam Act and relevant recipient-country marketing rules. Prove consent before
sending; accurately identify the legal sender and contact; provide a no-cost
unsubscribe that needs no login or extra personal data; keep that facility
functional for at least 30 days and action requests within five working days.
An ordinary purchase is not assumed to be marketing consent. The observed
subscription endpoint is not proof that the entire consent/unsubscribe flow
passes these requirements, nor proof that unlawful email has been sent.

## Release evidence

Complete the inventory against the live provider agreements, browser network and
storage inspection, checkout privacy screens, receipt/delivery events and support
mailbox. Test a data request and marketing withdrawal if marketing is used. Log
only redacted identifiers and results; never publish buyer/card data, API keys,
signed download tokens or private correspondence as acceptance evidence.
