# Combinatorial Maximalism as the Closure Discipline for First-Mile and Last-Mile Process Gaps

## A Workflow, Object-Centric, and Information-Theoretic Framework for Turning Intent into Verified Outcome

### Sean Chatman

---

## Abstract

Modern organizations increasingly adopt AI, automation, mobile applications, and process-intelligence systems, yet their highest-cost failures often remain concentrated at the edges of work. The first mile fails when intent, burden, signal, request, arrival, or need is not captured, classified, consented, owned, and routed correctly. The last mile fails when a promised action, care handoff, service delivery, follow-up, receipt, or closure is not verified in the lived process. These failures are not merely user-experience defects. They are process-closure defects.

This paper introduces Combinatorial Maximalism as a doctrine for closing first-mile and last-mile gaps. The method expands any service route into its bounded possibility space, identifies the meaningful axes of variation, classifies every admissible and inadmissible state, and requires each state to resolve into one of a finite set of lawful outcomes: admitted, refused, human-required, pending, verified, hidden-by-policy, failed, tamper-detected, or blocked-from-closure. A route is not complete because its happy path works. A route is complete only when every meaningful state it creates is either admitted, refused, escalated, hidden, receipted, or rendered truthfully.

The paper integrates three research directions: intent-based agentic automation, object-centric process mining, and non-block-structured workflow discovery. Intent-based automation shifts human-machine interaction from command execution to high-level goals decomposed into expectations, conditions, targets, context, and information. Object-centric process mining grounds AI in multi-object event evidence rather than single-case abstractions. POWL 2.0 and choice graphs show why real process behavior requires non-block-structured decision modeling while preserving soundness and scalability. Together, these establish the need for a closure discipline that can bind intent, objects, route decisions, receipts, and last-mile verification.

Combinatorial Maximalism supplies that discipline. It is the missing method for converting intent into operational closure.

---

## Keywords

Combinatorial Maximalism; first-mile gap; last-mile gap; object-centric process mining; process intelligence; intent-based automation; POWL; choice graphs; route closure; receipt-backed systems; workflow calculus; AI operations; service routes.

---

# 1. Introduction

Organizations do not usually fail because no system exists. They fail because the system fails at the edge.

A person submits a request, but the request is not routed.

A patient enters a waiting room, but nonclinical blockers are not removed.

A church visitor asks for prayer, but follow-up is not owned.

A Connect Group interest is submitted, but no one verifies whether the person actually reached community.

A maintenance intent is expressed, but the human operator still must translate the intent into dozens of technical steps.

A release says it is ready, but no post-publish receipt proves the package works from the registry.

These are first-mile and last-mile failures.

The first mile is where reality enters the system. It includes the first signal, first form, first observation, first message, first threshold, first consent decision, first classification, and first route owner.

The last mile is where the system proves that the intended consequence actually happened. It includes the final handoff, receipt, confirmation, follow-up, verification, closure, audit, and replay surface.

Most digital systems invest heavily in the middle: dashboards, records, databases, task boards, reports, and analytics. Yet the most human, expensive, and trust-sensitive failures often happen before the middle begins or after the middle thinks it is done.

This paper argues that first-mile and last-mile failures are not peripheral. They are the central unsolved problem in AI-mediated service systems.

The proposed solution is Combinatorial Maximalism.

Combinatorial Maximalism says: every feature, route, request, or service process creates a bounded possibility space. The system must enumerate the meaningful combinations, classify each state, and prove that each state resolves lawfully. The goal is not more tests. The goal is state-space closure.

---

# 2. Background and Motivation

## 2.1 Intent-Based Agentic Automation

Recent work on agentic AI for industrial automation frames intent-based interaction as a human-centric response to growing industrial complexity. Industry 5.0 emphasizes human-centricity, sustainability, and resilience, and intent-based communication allows operators to express what they want to achieve rather than specifying every technical step. The system interprets high-level intent and determines actions to fulfill it, reducing operational errors and supporting adaptation to changing goals and contexts. 

The intent-based automation literature decomposes user intent into structured components such as expectations, conditions, targets, context, and information. This decomposition is critical because a natural-language request must become actionable without forcing the human operator to manage the technical layer. 

This is directly relevant to first-mile closure. A first-mile intake event is often an intent statement:

“I need prayer.”

“I want to join a group.”

“This machine is at risk.”

“I need help with my family.”

“Publish this package.”

The first-mile problem is that systems often receive the utterance without decomposing it into route obligations. Intent alone is not closure. Intent must become structured expectation, condition, target, context, information, route, evidence, and receipt.

Intent-based systems point toward the right direction, but intent decomposition alone is not enough. The system must also prove that the decomposed intent actually moved through the right process.

That requires process evidence.

---

## 2.2 Object-Centric Process Mining and Process Intelligence

Wil van der Aalst argues that AI requires Process Intelligence, and that object-centric process mining is the grounding layer for generative, predictive, and prescriptive AI in organizations. The “No AI Without PI” position is that AI cannot reliably improve operational processes without access to structured process-related data, process models, and object-centric event evidence. 

Traditional case-centric process mining forces events into a single case notion. This distorts reality because events often involve multiple objects. A payment may relate to an invoice and a customer; a production event may relate to several parts; a care handoff may relate to a person, household, route, message, receipt, and ministry team. Object-centric event data allows one event to reference multiple objects of different types, making it much better suited for real operational processes. 

The paper also identifies recurring challenges in traditional process mining: scattered data, rigid case notions, distorted views, inactionable insights, and organizational resistance. These challenges map directly onto first-mile and last-mile gaps. Scattered data prevents first-mile signal capture. Rigid case notions distort multi-object service routes. Inactionable insights fail the last mile because the system can see a problem but cannot close it. 

Combinatorial Maximalism builds on this insight: a service route is object-centric by nature. A prayer request is not one row. It may involve a person, burden, household, consent policy, route, prayer team, care lead, message draft, receipt, and follow-up. A Connect Group route may involve a person, group, season, schedule, leader, invite, attendance event, missed-meeting follow-up, and membership outcome.

The first-mile and last-mile gaps cannot be closed with a single-case model. They require object-centric route closure.

---

## 2.3 Non-Block-Structured Decisions and POWL 2.0

Real processes do not always fit clean block-structured flowcharts. Work may branch, rejoin, skip, loop, and partially order activities in ways that simple process trees cannot represent. POWL originally addressed non-block-structured concurrency through partial orders. POWL 2.0 extends this by replacing simple XOR choice with choice graphs, allowing more expressive modeling of non-block-structured decisions while preserving desirable guarantees such as soundness. 

The choice-graph paper shows that directly-follows graphs capture complex decision paths but can overgeneralize when concurrency creates cycles. POWL supplies precise partial-order and loop operators, while choice graphs capture complex branching decisions inside the POWL framework. The combination offers more accurate models of real behavior than process trees or standard POWL alone. 

This matters because first-mile and last-mile routes are usually non-block-structured.

A prayer request can be prayer-only, follow-up-enabled, escalated to care, blocked by missing consent, refused by privacy policy, routed to a group, or converted into a provision route.

A hospital intake can route to emergency triage, nonclinical support, language assistance, family update, financial counselor, behavioral health, or discharge support.

A church welcome route can include Bible access, care handoff, Kids ministry connection, exit recognition, and later follow-up.

These are not simple linear workflows. They require choice graphs, partial orders, loops, and explicit refusal states.

POWL 2.0’s importance is that it provides a formal reason to reject oversimplified route models. The first mile and last mile are messy precisely because the real route space is non-block-structured.

---

# 3. Problem Statement: The First-Mile and Last-Mile Gaps

## 3.1 The First-Mile Gap

The first-mile gap is the distance between a real-world signal and a lawful route.

Formally:

First-mile gap = observed signal − admitted route evidence

A signal may be:

A person crying at the door.

A prayer request.

A Connect Group interest.

A patient arrival.

A machine maintenance intent.

A package release claim.

A donor intent.

A youth registration.

The gap exists when the signal is not captured, classified, consented, owned, routed, and receipted.

First-mile defects include:

Unseen need.

Unclassified request.

Missing consent.

No route owner.

Wrong first handoff.

Sensitive context exposed too early.

Request stored but not admitted.

Human-required boundary missed.

AI action taken before policy permits it.

The result is downstream chaos. The system spends the middle mile compensating for a broken intake.

---

## 3.2 The Last-Mile Gap

The last-mile gap is the distance between claimed outcome and verified consequence.

Formally:

Last-mile gap = claimed completion − verified receipt state

A system may claim:

The prayer request was handled.

The person was followed up with.

The group invite was sent.

The route was closed.

The package is ready to publish.

The patient was discharged with instructions.

The care handoff happened.

But unless the route emits evidence, verifies the receipt, renders the proof, and blocks false success, the last mile remains open.

Last-mile defects include:

False completion.

Invisible failure.

Missing receipt.

Unverified message send.

Follow-up not actually completed.

Local-only state claiming remote verification.

Receipt-chain tamper ignored.

Admin not alerted.

User never sees proof.

The last mile fails when the system considers itself done before reality has closed.

---

# 4. Combinatorial Maximalism

## 4.1 Definition

Combinatorial Maximalism is the discipline of closing the bounded possibility space created by a feature, route, or workflow.

It requires:

Identifying the axes of variation.

Crossing those axes into meaningful combinations.

Classifying each combination.

Driving combinations through real system boundaries.

Emitting receipts.

Rendering truthful status.

Blocking forbidden success.

Producing replayable evidence.

It is not brute-force testing. It is state-space closure.

---

## 4.2 Core Principle

The central principle:

A route is not complete when its happy path works. A route is complete when every meaningful state it creates resolves lawfully.

The lawful outcomes are:

Admitted.

Verified.

Pending.

Refused.

Human-required.

Hidden-by-policy.

Verification-failed.

Tamper-detected.

Blocked-from-closure.

These outcomes are not incidental states. They are the closure vocabulary of the route.

---

## 4.3 The First/Last Mile Closure Law

Combinatorial Maximalism closes the first mile by forcing every intake combination to become a lawful route state.

It closes the last mile by forcing every claimed outcome to become a verified receipt state.

The closure law:

For every meaningful route scenario, the system must either admit it, refuse it, escalate it, hide it, verify it, or block closure. No scenario may disappear.

That is the entire doctrine in operational form.

---

# 5. Formal Model

Let a service route R create a bounded state space S.

S is the product of meaningful axes:

S = RouteType × RouteStage × ActorRole × ConsentState × PrivacyLevel × ObjectSet × SourceBoundary × VerificationStatus × MessageOrigin × TransparencyState × ChainIntegrity × SyncState × UISurface

Each concrete state is a scenario σ.

σ ∈ S

Not every mathematically possible σ is meaningful. Let M be the support of meaningful route states.

M ⊆ S

Define an outcome oracle Ω:

Ω: M → O

Where O is:

O = {Admitted, Verified, Pending, Refused, HumanRequired, HiddenByPolicy, VerificationFailed, TamperDetected, BlockedFromClosure}

Define execution E as the real-boundary system execution:

E(σ) = observed route behavior

Define rendering P as the product-visible projection:

P(E(σ)) = visible status, receipt, blocker, or hidden projection

A route is closed when:

For every σ in M, P(E(σ)) = Ω(σ), and no forbidden success state appears.

This final clause is essential. The system must not only show the right thing. It must also prevent invalid success.

A failed receipt must not show Verified.

A pending local state must not show Edge admitted.

A missing-consent route must not show Message sent.

A tampered chain must not show Route closed.

An unauthorized actor must not see sensitive receipt detail.

Thus, Combinatorial Maximalism is both affirmative and prohibitive.

---

# 6. Workflow Calculus for the First Mile

The first mile begins with unstructured or semi-structured reality.

A person arrives.

A request is submitted.

An intent is spoken.

A maintenance warning appears.

A service need is observed.

The first-mile workflow calculus converts this into admitted route evidence.

The stages are:

Signal received.

Minimum context captured.

Intent decomposed.

Objects identified.

Consent checked.

Policy checked.

Route candidates emitted.

Human-required boundary evaluated.

Route admitted or refused.

First receipt emitted.

The first-mile gap is closed only when the system can answer:

What was the signal?

What objects are involved?

What route was opened?

What consent exists?

What policy applies?

Who owns the next step?

What was refused?

What receipt proves intake occurred?

This is precisely where intent-based automation and object-centric process mining must combine. Intent-based systems decompose the human goal into expectations, conditions, targets, context, and information. Object-centric process mining preserves the multi-object evidence trail. Combinatorial Maximalism ensures that every meaningful combination of these elements has a lawful outcome.

---

# 7. Workflow Calculus for the Last Mile

The last mile begins when the system believes a consequence has occurred.

A prayer was offered.

A message was sent.

A route was closed.

A group invite was accepted.

A person attended a first meeting.

A release was published.

A care handoff was completed.

The last-mile workflow calculus asks:

What moved?

Who acted?

Which object changed state?

Which receipt proves it?

Was the source boundary real?

Was the receipt verified?

Was the result visible to the right role?

Did any blocker remain?

Did the system falsely show success?

The last mile is closed only when the claimed outcome has a verified receipt and the product surface renders the correct truth state.

This is why a database update alone is insufficient.

The last mile requires product-visible proof.

---

# 8. Object-Centric Route Closure

Object-centric process mining is essential because first-mile and last-mile gaps almost never involve one object.

A prayer request route can involve:

Person.

Household.

PrayerRequest.

Consent.

PrivacyPolicy.

ServiceRoute.

PrayerTeam.

CareLead.

MessageDraft.

Conversation.

Receipt.

FollowUp.

AdminAndon.

A Connect Group route can involve:

Person.

ConnectGroup.

GroupSeason.

GroupSchedule.

Leader.

Invite.

Attendance.

FollowUp.

Membership.

Receipt.

The route cannot be understood by flattening everything into one case. Object-centric event data allows events to reference multiple objects, preserving the actual structure of lived work. This aligns with van der Aalst’s argument that process intelligence connects data and processes, allowing AI to diagnose and improve operational processes. 

Combinatorial Maximalism adds a closure requirement: each object relation must participate in lawful route states.

For example:

A message cannot be sent without consent.

A receipt cannot verify without a route.

A follow-up cannot close without ownership.

A private prayer cannot appear in a public projection.

A care escalation cannot vanish from Admin Andon.

A group invite cannot be treated as belonging.

The object graph becomes a route graph.

The route graph becomes a proof graph.

---

# 9. Non-Block-Structured Route Closure

POWL 2.0 matters because first-mile and last-mile routes often require decision paths that are not cleanly nested.

A prayer request may branch into prayer-only, care escalation, Connect Group follow-up, provision route, or refusal. These branches may rejoin at shared follow-up surfaces. Some actions may run in partial order: prayer assignment and human-required review may happen while consent clarification is pending. Some loops may repeat: missed meeting, gentle follow-up, retry, alternate group, re-entry.

Simple block-structured trees overfit the clean version of the process.

Directly-follows graphs can capture complex branching but may overgeneralize when cycles and concurrency appear.

POWL 2.0 choice graphs offer a stronger route modeling pattern: preserve expressive decision paths while keeping the model structured and sound. The cited work shows that choice graphs extend POWL to represent non-block-structured decisions and preserve important guarantees, including language equivalence and soundness through conversion to workflow nets. 

Combinatorial Maximalism uses this insight to say:

Do not force the first mile into one intake funnel.

Do not force the last mile into one closure state.

Model the actual route choices, refusals, loops, and partial orders.

Then close the combination space.

---

# 10. The Role of AI

AI in this framework has three roles.

Generative AI can help interpret, summarize, or draft text.

Predictive AI can estimate future risk, delay, drop-off, overload, or route failure.

Prescriptive AI can recommend or enforce next actions under constraints.

Van der Aalst distinguishes generative, predictive, and prescriptive AI and argues that these need process intelligence to operate effectively in organizations. Generative AI creates content, predictive AI forecasts outcomes, and prescriptive AI suggests or enforces actions constrained by rules and goals. 

Combinatorial Maximalism adds the missing governance layer: AI outputs do not become route truth until admitted by route law.

A model may suggest a group match.

A route law admits or refuses the match.

A model may draft a follow-up message.

A human sends it.

A model may flag sensitive language.

A human-required boundary receives it.

A predictive model may forecast route drop-off.

A route owner acts or the system escalates.

AI proposes, predicts, drafts, ranks, or recommends. It does not replace receipts, consent, policy, or closure.

---

# 11. Combinatorial Maximalism and Intent-Based Automation

Intent-based automation simplifies human-machine interaction by allowing users to express desired outcomes instead of technical steps. The industrial automation paper argues that this shift can radically simplify HMI and let LLM agents orchestrate actions through specialized tools. 

Combinatorial Maximalism turns intent-based automation into a closure discipline.

Intent decomposition gives:

Expectation.

Condition.

Target.

Context.

Information.

Combinatorial closure adds:

Object set.

Route stage.

Consent state.

Policy gate.

Refusal path.

Receipt requirement.

Visibility rule.

Last-mile verification.

Therefore, the complete pipeline is:

Intent → decomposition → object-centric route → choice graph → admission → execution → receipt → conformance → visible closure.

Without Combinatorial Maximalism, intent-based systems risk producing action without closure.

With it, every intent becomes a bounded route family.

---

# 12. The First-Mile/Last-Mile Matrix

A first-mile and last-mile closure matrix should include the following axes.

Route type:

Prayer request.

Care handoff.

Connect Group join.

Bible request.

Volunteer interest.

Kids/YTH route.

Provision request.

Event registration.

Release publication.

Route stage:

Intake.

Classification.

Consent.

Admission.

Assignment.

Message.

Follow-up.

Verification.

Closure.

Actor role:

Requester.

Threshholder.

Prayer team.

Care lead.

Facilitator.

Admin.

Unauthorized actor.

Consent state:

Granted.

Missing.

Revoked.

Expired.

Partial.

Guardian required.

Privacy level:

Public.

Team-only.

Private.

Sensitive.

Minor/youth.

Source boundary:

Local app.

SQLite.

Sync queue.

Edge Function.

Supabase.

Realtime.

Storage.

External dependency.

Verification state:

Pending.

Verified.

Failed.

Refused.

Tamper-detected.

Message origin:

Human-written.

Template-prefilled.

AI-assisted.

Imported external.

Transparency state:

Not required.

Present.

Missing.

Malformed.

Chain integrity:

Intact.

Previous hash mismatch.

Receipt hash mismatch.

Missing receipt.

Duplicate receipt.

Reordered chain.

UI surface:

Home.

RouteTimeline.

ReceiptTrail.

AdminAndon.

ReceiptDetail.

Notification.

Outcome:

Admitted.

Verified.

Pending.

Refused.

HumanRequired.

HiddenByPolicy.

VerificationFailed.

TamperDetected.

BlockedFromClosure.

This matrix is the anti-gap instrument.

It prevents the first mile from accepting unknown signals without route classification.

It prevents the last mile from claiming completion without verified proof.

---

# 13. Case Study: Prayer Request as Online Onboarding Pipeline

A prayer request is not merely devotional text. It is an online threshold.

The person reveals:

I am reachable.

I have a burden.

I may want follow-up.

I may need care.

I may need community.

I may need provision.

I may need a human.

The first-mile route begins with the prayer request.

The system must capture minimum context, check privacy, check consent, classify urgency, assign ownership, and emit a receipt.

The last-mile route closes only when the appropriate outcome is verified:

Prayer offered.

Follow-up sent.

Care lead assigned.

Human-required boundary triggered.

Connect Group route opened.

Provision route opened.

Route refused due to missing consent.

Route closed with verified receipt.

Combinatorial Maximalism prevents the church, clinic, service organization, or enterprise from treating the request as an inbox item. It becomes a ServiceRoute.

The route must not disappear.

---

# 14. Case Study: Hospital Intake and Discharge

An emergency room with long waits is not only a medical capacity problem. It is also a first-mile and last-mile process problem.

The first mile includes:

Arrival.

Wayfinding.

Triage readiness.

Administrative readiness.

Language needs.

Family distress.

Behavioral health flags.

Insurance questions.

Escalation signals.

A Combinatorial Maximalist intake route would classify each arrival state and route nonclinical blockers away from clinical capacity.

The last mile includes:

Discharge instructions.

Medication access.

Transport.

Family understanding.

Follow-up appointment.

Return precautions.

A patient is not “done” when discharged in the system. The last mile closes only when the discharge route has verified receipts for the required outcomes.

The doctrine generalizes across care domains because first-mile and last-mile gaps are structural.

---

# 15. Case Study: ZOE LA Mobile and Threshholder Infrastructure

A church welcome system is a useful reference case because it makes the first-mile/last-mile problem visible.

The first mile:

A person arrives.

A need is noticed.

A Bible is requested.

A young woman cries at the edge.

A newcomer wants a group.

A family needs Kids routing.

A person asks for prayer.

The middle mile:

Care handoff.

Ministry association.

Group match.

Message prepared.

Leader notified.

Follow-up assigned.

The last mile:

Message sent.

Receipt emitted.

First meeting attended.

Follow-up completed.

Route closed.

Admin sees unresolved blockers.

The app is not a church directory. It is threshold infrastructure.

Combinatorial Maximalism makes sure no threshold signal can become invisible and no route can claim closure without proof.

---

# 16. Evaluation Framework

A publication-quality evaluation should measure three categories.

## 16.1 First-Mile Closure Metrics

Time to notice.

Time to classify.

Time to consent decision.

Time to first owner.

Wrong-route rate.

Missing-consent rate.

Human-required detection rate.

Unowned intake count.

Repeat-story count.

Intake-to-route conversion.

## 16.2 Last-Mile Closure Metrics

Receipt completeness.

Route closure correctness.

Follow-up completion rate.

False completion rate.

Receipt verification failure rate.

Admin-visible blocker rate.

Pending-sync honesty.

Tamper detection rate.

User-visible proof rate.

## 16.3 Combinatorial Coverage Metrics

Scenario count.

Axis coverage.

Lawful combination coverage.

Unlawful combination refusal coverage.

Role projection coverage.

Sync-state coverage.

Receipt-chain mutation coverage.

UI surface coverage.

Oracle agreement rate.

Forbidden success absence rate.

This evaluation shifts the question from “does the app work?” to “does the route space close?”

---

# 17. Architecture Pattern

The architecture pattern has five layers.

## 17.1 Intent Layer

Captures human intent, need, signal, or request.

## 17.2 Object-Centric Route Layer

Maps the signal into objects, route types, policies, and ownership.

## 17.3 Workflow Choice Layer

Models non-block-structured decisions, partial orders, loops, and refusal paths.

## 17.4 Admission and Receipt Layer

Admits, refuses, verifies, signs, hashes, and records route transitions.

## 17.5 Product-Visible Proof Layer

Renders truthful status to the correct role.

This architecture closes both edges.

The first mile closes through intent decomposition, object routing, and admission.

The last mile closes through receipts, verification, role projection, and visible proof.

---

# 18. Contributions

This paper makes seven contributions.

First, it defines first-mile and last-mile gaps as process-closure defects rather than UX inconveniences.

Second, it introduces Combinatorial Maximalism as a bounded state-space closure discipline.

Third, it formalizes route closure through an outcome oracle over meaningful combinations.

Fourth, it integrates intent-based automation, object-centric process mining, and POWL-style non-block-structured workflow modeling.

Fifth, it frames receipts as last-mile proof objects and product-visible truth surfaces.

Sixth, it proposes evaluation metrics for first-mile closure, last-mile closure, and combinatorial coverage.

Seventh, it provides a general architecture for service systems where AI may assist but route law and receipts govern authority.

---

# 19. Discussion

Combinatorial Maximalism is intentionally demanding. It increases upfront design pressure. It requires teams to enumerate axes, define oracles, build test harnesses, emit receipts, and refuse narrative completion.

But the alternative is worse.

Without this discipline, AI-assisted systems become faster at producing incomplete workflows. They create more screens, more actions, more messages, more automation, and more dashboards without closing the route. The organization gains motion but not proof.

The doctrine is especially important for systems involving care, youth, finance, prayer, safety, industrial automation, healthcare, and AI-assisted decisions. In these domains, false completion is not a minor bug. It is a trust failure.

The first mile and last mile are where trust is either established or lost.

---

# 20. Conclusion

Combinatorial Maximalism is the key to closing first-mile and last-mile gaps because it forces systems to stop treating routes as happy paths and start treating them as bounded possibility spaces.

The first mile closes when every signal becomes an admitted, refused, or human-required route state.

The last mile closes when every claimed outcome becomes a verified, visible, role-correct receipt state.

Intent-based automation explains how human goals can be expressed without technical commands. Object-centric process mining explains how multi-object process evidence grounds AI in real work. POWL 2.0 and choice graphs explain why non-block-structured decisions must be modeled without sacrificing soundness. Combinatorial Maximalism binds these into a closure discipline.

The final thesis is simple:

The future of AI-enabled service systems is not merely better agents, better interfaces, or better analytics. It is route closure.

A system is not intelligent because it can understand intent.

It is intelligent when it can carry intent from first signal to verified consequence without losing the person, the object, the evidence, or the truth.

Combinatorial Maximalism is the method for doing that.