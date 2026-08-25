Here is a much stronger version of your prompt. I’ve made the **codebase the only source of truth**, explicitly separated **observed behavior from assumptions**, and added a **verification/audit phase** so the agent doesn’t just rewrite the existing documentation based on what it already says.

# Deep Codebase Research & Documentation Reconstruction

Perform a **deep, evidence-driven codebase audit** of this project and completely update:

* `docs/project.md`
* `README.md`

The objective is **not** to improve the existing documentation based on what it currently claims.

The objective is to **reconstruct the documentation from the actual implementation in the repository**.

## 1. Absolute Source-of-Truth Rule

The **actual executable/source code is the primary and authoritative source of truth**.

Do NOT assume the existing documentation is correct.

Do NOT assume comments are correct.

Do NOT assume variable names, class names, function names, configuration names, or folder names accurately describe the behavior.

Do NOT infer intended behavior merely from architecture diagrams, TODOs, comments, docstrings, README content, project.md, or configuration descriptions.

When documentation/comments and implementation disagree:

> **Trust the implementation and document what the code actually does.**

If the implementation itself is ambiguous, incomplete, unreachable, dead, or contradictory, explicitly document that uncertainty instead of inventing an explanation.

---

# 2. Existing Documentation Must NOT Drive Your Analysis

Before researching the codebase, treat:

* `README.md`
* `docs/project.md`
* Other `.md` files
* Architecture diagrams
* Design documents
* Comments
* Docstrings
* TODOs
* Variable/function/class names

as **unverified claims**, not facts.

You may read them to understand what the previous documentation claimed, but you must independently verify every meaningful claim against the implementation.

Do not "connect the dots" between documentation statements and code and then assume the system works that way.

Instead:

> Trace the actual execution path through the code.

---

# 3. Perform a Deep Codebase Investigation

Do not perform a superficial scan.

Systematically inspect the repository and understand:

### Repository Structure

Identify:

* All major directories
* All source-code directories
* Entry points
* Applications/services
* Libraries
* Modules
* Workers
* CLI commands
* Scripts
* Background jobs
* API endpoints
* Controllers
* Routes
* Middleware
* Services
* Data-access layers
* Models
* Database layers
* Integrations
* Providers
* Adapters
* Configuration
* Authentication/authorization
* Caching
* Queues
* Messaging
* Scheduling
* Logging
* Error handling
* Monitoring
* Testing
* Build/deployment infrastructure

Do not merely list folders.

Determine **what each component actually does based on its implementation**.

---

# 4. Trace Actual Execution Paths

For every important subsystem, trace the real execution flow.

For example:

```text
Entry Point
    ↓
Route / Command / Trigger
    ↓
Controller / Handler
    ↓
Service
    ↓
Business Logic
    ↓
Repository / Provider
    ↓
Database / External API
    ↓
Response / Side Effect
```

However, **do not assume this architecture exists**.

Construct the flow only after verifying it from the code.

For important workflows, identify:

* Where execution begins
* What invokes it
* What functions/classes are called
* What conditions affect execution
* What data is passed between components
* What transformations occur
* What external systems are contacted
* What database operations occur
* What happens on success
* What happens on failure
* What gets logged
* What gets retried
* What gets cached
* What gets persisted
* What happens asynchronously
* What happens synchronously

Follow the implementation far enough that you can explain the complete flow without guessing.

---

# 5. Trace Dependencies Instead of Assuming Them

For important classes/functions/modules, determine:

* Who calls them
* What they call
* What data they consume
* What data they produce
* Which configuration controls them
* Which external services they depend on
* Which database tables/collections they access
* Which queues/topics/jobs they interact with
* Whether they are actually reachable/executed

Do not document a component merely because it exists.

A class that exists but is never referenced should not be described as an active production subsystem without evidence.

Distinguish between:

* **Implemented and actively referenced**
* **Implemented but apparently unused**
* **Partially implemented**
* **Dead/unreachable code**
* **Configuration-only capability**
* **Experimental code**
* **Test-only code**

---

# 6. Verify Configuration From Actual Usage

Inspect configuration files and then trace every important configuration value into the code.

For each significant configuration:

* Identify where it is defined
* Identify where it is read
* Identify how it changes behavior
* Identify its default value
* Identify whether it is required
* Identify whether it is actually used

Do NOT document environment variables or configuration options simply because they exist.

Only document them as functional configuration when you can verify their usage in code.

---

# 7. Verify Database Behavior

Inspect database-related code deeply.

Identify:

* Database engines
* Connections
* Database configuration
* Tables
* Collections
* Schemas
* Models
* Repositories
* Queries
* Inserts
* Updates
* Deletes
* Transactions
* Indexes where relevant
* Migrations
* Data relationships
* Data lifecycle

For important data flows, explain:

```text
Input
  ↓
Validation
  ↓
Transformation
  ↓
Persistence
  ↓
Subsequent Consumers
```

Do not infer database relationships simply from naming conventions.

Verify them from actual queries, models, migrations, joins, foreign keys, or equivalent implementation evidence.

---

# 8. Verify External Integrations

For every external integration, identify from code:

* Service/provider name
* API/client implementation
* Authentication mechanism
* Endpoints
* Request construction
* Parameters
* Headers
* Payloads
* Response handling
* Error handling
* Retry behavior
* Timeout behavior
* Fallback behavior
* Caching
* Persistence of external data

Do not assume an integration is functional merely because an SDK/package/configuration exists.

Determine whether the integration is actually invoked.

---

# 9. Identify the Real Architecture

After analyzing the implementation, reconstruct the architecture **from evidence**.

Create a clear explanation of:

* Major components
* Component responsibilities
* Component dependencies
* Data flows
* Control flows
* External dependencies
* Storage systems
* Asynchronous processing
* Runtime boundaries

If useful, include Mermaid diagrams.

But every architecture diagram must represent **verified implementation behavior**, not an idealized architecture.

Do not create diagrams simply because they look architecturally correct.

---

# 10. Identify Actual vs Intended Architecture

Where appropriate, explicitly distinguish:

### Actually Implemented

What the code currently does.

### Partially Implemented

What exists but is incomplete or only partially wired.

### Apparently Intended

What comments/documentation suggest, but which cannot be verified from implementation.

### Dead / Unused

Code that exists but does not appear to participate in the active execution path.

This distinction is extremely important.

Never silently convert "intended architecture" into "current architecture."

---

# 11. Find Contradictions

Actively search for contradictions between:

* README
* project.md
* Comments
* Configuration
* Code
* Tests
* Actual execution paths

Create an internal list of contradictions during your research.

Examples:

```text
Documentation says X
Code actually does Y
```

or:

```text
Comment claims feature A exists
No executable path was found that invokes feature A
```

or:

```text
Configuration exposes setting X
No code path appears to consume setting X
```

Use these findings to correct the documentation.

Do not preserve incorrect legacy documentation just because it already exists.

---

# 12. Do Not Trust Comments

Comments are **contextual hints only**.

A comment such as:

```
// Fetches data from Provider A
```

does NOT prove that the implementation fetches data from Provider A.

Verify:

* The actual provider/client
* Actual endpoint
* Actual execution path
* Actual response handling

If the comment and code disagree, document the code's behavior.

---

# 13. Do Not Trust Naming

Do not assume:

```text
UserService
```

actually manages users.

Do not assume:

```text
CacheManager
```

actually provides caching.

Do not assume:

```text
Repository
```

is the only database access layer.

Do not assume:

```text
Provider
```

is interchangeable with another provider.

Names are clues.

Implementation is evidence.

---

# 14. Evidence-Based Documentation

Every important architectural statement in the new documentation should be traceable to actual code.

When useful, reference implementation locations such as:

```text
src/services/XService.ts
src/controllers/YController.ts
config/database.ts
workers/processJob.ts
```

For complex systems, include relevant:

* File paths
* Class names
* Function names
* Entry points
* Configuration keys
* Database tables
* API endpoints

This allows another engineer to verify the documentation.

---

# 15. README.md Requirements

Rewrite `README.md` as the **high-level entry point to the project**.

It should explain:

1. What the project actually does
2. The actual capabilities discovered in the code
3. Major components
4. High-level architecture
5. Important data flows
6. Technology stack actually used
7. Dependencies
8. Installation/setup based on actual repository configuration
9. How to run the project
10. How to run tests, if implemented
11. Important configuration
12. Key commands/scripts
13. Major integrations
14. Known limitations
15. Important operational notes
16. Link/reference to `docs/project.md`

Keep the README high-level enough to remain useful.

Do not turn it into a massive code dump.

A README should be the project's front door, while deeper architectural detail belongs in `project.md`. ([GitHub Docs][1])

---

# 16. project.md Requirements

Rewrite `docs/project.md` as the **deep technical documentation of the actual system**.

It should provide enough detail for a new senior engineer to understand the system without having to reverse-engineer the entire repository from scratch.

Include, where applicable:

## 16.1 Executive Overview

* What the system actually does
* Primary purpose
* Major capabilities
* Current implementation scope

## 16.2 Repository Structure

Explain important directories and their actual responsibilities.

## 16.3 System Architecture

Provide verified architecture diagrams and explanations.

## 16.4 Component Architecture

For each major component:

* Purpose
* Entry points
* Responsibilities
* Dependencies
* Inputs
* Outputs
* Important implementation files

## 16.5 Execution Flows

Document major workflows step-by-step.

## 16.6 Data Architecture

Document:

* Data sources
* Transformations
* Storage
* Retrieval
* Processing
* Consumers

## 16.7 Configuration Architecture

Document configuration and how it actually affects runtime behavior.

## 16.8 Integration Architecture

Document external services and actual interaction flows.

## 16.9 Error Handling

Document actual error handling, retries, fallbacks, logging, and failure behavior.

## 16.10 Background Processing

Document:

* Workers
* Queues
* Scheduled jobs
* Cron jobs
* Async processing
* Retry mechanisms

## 16.11 Security

Only document security mechanisms that actually exist in the implementation.

## 16.12 Testing

Document:

* Test frameworks
* Test locations
* Test types
* What is actually tested
* Important gaps if clearly identifiable

## 16.13 Deployment / Runtime

Document deployment and runtime behavior based on actual configuration/scripts/infrastructure.

## 16.14 Known Gaps and Technical Debt

Document issues discovered during the audit, but clearly distinguish:

* Verified problem
* Missing implementation
* Unused code
* Documentation mismatch
* Unclear behavior

Do not invent technical debt.

---

# 17. Real-Life Examples

Where the system has complex behavior, explain it using concrete examples.

For example:

```text
Suppose a request enters through X.

The request is first handled by A.
A validates B.
B calls C.
C transforms the data into D.
D is persisted into E.
F later consumes E.
```

Only use examples that accurately represent the implementation.

Do not create fictional business behavior merely to make the documentation easier to understand.

---

# 18. Important: Do Not Fill Gaps With Assumptions

If you cannot verify something, say so.

Use language such as:

> "The repository contains configuration for X, but no active execution path consuming this configuration was identified."

or:

> "The intended behavior cannot be established from the current implementation."

or:

> "This component exists in the repository but appears to be unused based on the references identified during the audit."

Never convert uncertainty into certainty.

---

# 19. Validation Pass

After rewriting both documents, perform a **second independent validation pass**.

For every major section, ask:

1. Is this statement supported by actual code?
2. Did I accidentally rely on the old documentation?
3. Did I infer behavior from naming?
4. Did I rely on a comment instead of implementation?
5. Did I assume an unused component is active?
6. Did I describe intended behavior instead of actual behavior?
7. Did I invent any architecture?
8. Did I claim a feature exists without finding its execution path?
9. Did I document configuration that is never consumed?
10. Did I describe an integration that is never actually invoked?

Correct anything that fails this validation.

---

# 20. Final Consistency Check

Before finishing:

* Ensure `README.md` and `docs/project.md` do not contradict each other.
* Ensure both reflect the current codebase.
* Remove outdated claims.
* Remove unsupported assumptions.
* Remove fictional architecture.
* Remove obsolete components.
* Correct incorrect terminology.
* Correct incorrect dependency descriptions.
* Correct incorrect execution flows.
* Ensure links and file paths are valid.
* Ensure Mermaid diagrams represent actual implementation.
* Ensure examples match real behavior.

The final documentation should describe:

> **WHAT THE CODE CURRENTLY DOES**

not:

> **WHAT THE PROJECT WAS INTENDED TO DO**

and not:

> **WHAT THE EXISTING DOCUMENTATION CLAIMS IT DOES.**

---

# 21. Research Standard

Treat this as a **reverse-engineering and documentation reconstruction task**, not a documentation editing task.

Do not stop after inspecting the obvious files.

Follow references across the repository.

Trace important execution paths.

Inspect callers and callees.

Inspect configuration usage.

Inspect database access.

Inspect integrations.

Inspect background workers.

Inspect scripts.

Inspect tests.

Inspect entry points.

Inspect build/deployment configuration.

The goal is to build a reliable mental model of the actual system before writing the documentation.

---

# 22. Final Deliverable

Directly modify:

```text
docs/project.md
README.md
```

Do not merely provide recommendations.

Do not provide a proposed outline instead of updating the files.

Do not preserve incorrect existing documentation for compatibility.

Do not ask me to explain how the system works.

**You are responsible for discovering how it works from the codebase.**

The final result should be documentation that a senior engineer can trust because it is derived from **implementation evidence rather than assumptions, comments, or legacy documentation.**

This version also deliberately keeps the **README high-level** and `project.md` deep/technical, which aligns with common documentation architecture guidance: the README should orient users quickly, while detailed architecture belongs in deeper documentation. ([docs.readme.com][2])

[1]: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes?utm_source=chatgpt.com "About the repository README file - GitHub Docs"
[2]: https://docs.readme.com/main/docs/structuring-your-docs?utm_source=chatgpt.com "Structuring Your Documentation"
