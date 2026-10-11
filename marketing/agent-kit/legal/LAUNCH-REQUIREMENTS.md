# Legal and commerce release requirements

**Prelaunch record — 2026-10-11. Unchecked items are open release gates.**

The user approved an Australian seller and worldwide sales including EU. The
following decisions/configuration remain absent; preparing draft wording does
not substitute for them or for a working purchase/refund flow.

## Seller and offer inputs

- [ ] Recheck official ABN identity, active status and GST registration at launch.
      Seller supplied: James John Goode, ABN 30 285 930 662, 10 Vernon Court,
      Epping VIC 3076, Australia, hello@jimmygoode.com.
- [ ] Verify ASIC business-name registration for any trading brand actually used.
      No registered “ZeroShot Studio” claim is approved by this package.
- [ ] Provide the actual contracting seller's genuine telephone required for
      relevant German precontract consumer information: James for a direct sale,
      or the genuine MoR's contact when it is the contracting retailer. Do not
      automatically demand James's phone for the MoR's sale; separately assess
      any independent consumer contract supplied by James. Complete other
      applicable identity notices; invent no number, ACN, VAT number or EU address.
- [ ] Select actual storefront, seller vs merchant-of-record agreement, store and
      product identifiers. Record the legal contracting seller, license/content
      supplier, support/withdrawal/refund responsibilities and tax allocation.
- [ ] Approve price, currency, billing basis, exact version/deliverables, geographic
      restrictions, optional extras and update/support promises. No price in a
      test fixture is an approved offer; no lifetime update or response SLA is inferred.
- [ ] Approve whether to offer a voluntary Australian/worldwide change-of-mind
      refund policy. The recommendation can be a separate 14-day policy, but it
      must not be published as approved or confused with mandatory EU withdrawal.
- [ ] Define actual delivery deadline, entitlement/download/redelivery route,
      access duration and failed-delivery support. Match the current ZIP checksum
      and version; do not claim a purchase path is live until tested.
- [ ] Decide/verify EU and other overseas tax collection/registration. Non-GST
      registration of the Australian supplier does not remove EU digital B2C VAT.
      Do not apply the €10,000 EU-established-supplier threshold to this Australian
      business. Use a genuine MoR only after verifying its retailer/tax obligations,
      or establish the applicable non-Union OSS/local arrangements with an adviser.

## Consumer information and terms

- [ ] Select/remove the inapplicable seller branch; fill every required field.
      Make terms, seller identity, product requirements, total price, delivery,
      statutory digital guarantees and updates, withdrawal notice and form clear
      before order. Provide the concluded terms/consumer information on a durable
      medium. Implement the real order-acceptance and payment-button wording.
- [ ] Keep the EU withdrawal right unwaived after download. Remove provider-default
      early-expiry checkboxes and “no refunds after download” copy. If the flow
      cannot preserve that right, fix the flow or restrict the relevant sales;
      do not silently add a waiver. The exceptional current German digital-content
      rule is § 356(6), not old § 356(5).
- [ ] Implement and disclose the actual online withdrawal function required for
      relevant online consumer contracts since 19 June 2026. It must be prominent,
      readable and easily accessible during the period, labelled “Vertrag widerrufen”
      or an equivalent clear formulation. Collect/confirm name, contract identifier
      and electronic receipt channel; then provide “Widerruf bestätigen” or
      equivalent. Immediately send a durable acknowledgment containing the
      declaration and receipt date/time. An email link/static model form alone
      does not satisfy the function requirement.
- [ ] Accept clear lawful withdrawal declarations outside that function too.
      Refund promptly, within the statutory 14-day limit after receipt, through
      the original payment method unless expressly agreed otherwise; no refund
      fee or download-use deduction. Do not block the refund on a deletion certificate.
- [ ] Implement defect/non-delivery/update remedies separately from withdrawal
      and any voluntary refund deadline. Australian business buyers may have ACL
      rights; a B2B selection does not automatically exclude them. EU conformity
      and required security updates must not be disclaimed.
- [ ] Verify license/rights chain and earlier public MIT grants. Preserve existing
      permitted commercial/client deployments and third-party licenses/notices.
      The repository LICENSE now has a mandatory-rights carveout; verify it is in
      the actual sold ZIP and that sales/checkout terms do not contradict it.
- [ ] Review any standard-form limitation/cancellation/indemnity clause for unfair
      terms. Do not add a broad consumer indemnity, blanket foreseeable-loss
      exclusion, compulsory distant court or unilateral retrospective changes.
- [ ] Verify German/EU supplier information (including relevant DDG information),
      total pricing, complaint/ADR notices and accessibility applicability.
      VSBG §§ 36/37 application and actual participation statements require a
      facts-based check. Do not link the defunct EU ODR platform.
- [ ] Assess BFSG/e-commerce accessibility duties. A services microenterprise
      exemption requires fewer than 10 employees **and** either annual turnover
      <= €2m or annual balance-sheet total <= €2m; sole-trader status/no GST does
      not establish the conditions.
      Record the evidence or the required accessibility information/testing.
- [ ] Review language and additional mandatory requirements for each served market,
      including UK digital-content/withdrawal rules and other local sales taxes.
      “Worldwide” is a market choice, not a legal exemption or all-country certification.

## Privacy and operational evidence

- [ ] Complete PRIVACY-PREPARATION.md against actual data flows/vendors/retention.
      Assess GDPR scope, Article 27 representative, lawful bases, processing
      agreements, Chapter V transfers and cookie consent. Do not infer an
      Australian Privacy Act exemption or no seller telemetry without checking.
- [ ] Correct the existing website's stale Berlin identity/contact and incomplete
      analytics description through its actual Next.js deployment route. Review
      the observed unconditionally initialized GA4, PostgreSQL usage events,
      contact/newsletter storage, optional Turnstile and public MCP telemetry.
      Do not copy its existing GDPR-compliance claim into the product launch.
- [ ] For actual newsletter/commercial email, verify Australian Spam Act and
      relevant recipient-country rules: consent before sending, accurate sender
      identity/contact, no-cost unsubscribe without login or extra personal data,
      a facility remaining functional for at least 30 days, and requests actioned
      within five working days. Do not infer marketing consent from an ordinary
      purchase. Confirm actual behavior before claiming the existing flow passes.
- [ ] Place the finalized notices where customers can read/save them and link them
      from marketing/checkout/receipt; keep versioned acceptance records.
- [ ] Test mailbox and telephone availability, complaint/refund handling and update
      notifications. Define who can authorize refunds and ensure platform rules
      do not prevent legally required remedies.

## End-to-end acceptance cases

Use the actual product and provider's approved test mode first, then a documented
real authorized purchase/refund where required. Capture only redacted evidence.

| Case | Evidence needed |
| --- | --- |
| Australian consumer purchase | Correct legal seller, currency, total/mandatory fees, actual GST treatment, accepted terms version, receipt and working entitlement. |
| German/EU consumer purchase | Correct seller phone/address/email, destination tax/total, clear paid-order button, compatibility/updates/guarantee notice, durable terms/withdrawal form, immediate delivery without waiver. |
| Exact download | Authorized buyer receives identified ZIP; checksum matches release; LICENSE carveout/notices present; unauthorized access is refused without exposing tokens. |
| Online withdrawal after download | Prominent accessible function; fields/confirmation work; immediate dated durable acknowledgment; full timely refund without use deduction; entitlement disposition lawful. |
| Email withdrawal | Clear declaration accepted without requiring proprietary form or reasons; same refund protection; case identifier and redacted timestamp evidence. |
| Defect or non-delivery | Complaint reaches responsible seller; appropriate statutory assessment/remedy; no 14-day cutoff for defect claims. Do not create a fraudulent live chargeback as a test. |
| Repeated/failed events | Idempotent payment/delivery/refund callbacks, safe retry, actual tax/refund amounts reconciled, no duplicate charge or entitlement leakage. |
| Privacy request and optional marketing | Real request channel and responsible parties; no mandatory marketing permission; consent withdrawal/unsubscribe works if used. |

## Three drafting/source reviews and separate implementation gate

| Pass | Status | Required evidence |
| --- | --- | --- |
| 1. Current primary-law drafting | Prepared 2026-10-11 | PRIMARY-SOURCES.md and these drafts; open facts visibly marked. |
| 2. Independent clause/source review | Completed 2026-10-11 | No substantive invalid clause or missing mandatory-rights coverage found; MoR supplier-contact cross-reference clarified. Current withdrawal model and §357(8)/§327p cessation-of-use cross-reference confirmed. Not legal certification. |
| 3. Lead draft/source review | Completed 2026-10-11 | All seven drafts read; current §356a/§327f checked; review status and contracting-seller telephone conditions clarified. No substantive clause blocker found; not legal certification. |
| Separate actual seller/checkout/data implementation review | **Open** | Completed fields, qualified advice where needed, live/test purchase/withdrawal/refund/data evidence. None of the three draft reviews completes this gate. |

Do not mark the release legally/commerce ready while any applicable gate remains
open. No publication, business registration, tax registration or binding business
policy is performed by these preparation files.
