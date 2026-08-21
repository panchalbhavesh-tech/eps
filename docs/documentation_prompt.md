# Institutional-Grade Quant Platform — Full Codebase Architecture Audit & Documentation

You are analyzing the codebase of a **large-scale institutional quantitative trading and research platform**.

Treat this system as if it were the technology platform of a **$5B institutional investment firm / quantitative hedge fund**.

Your job is **not** to create a simple developer README.

Your job is to perform a **deep architectural reverse-engineering exercise** and produce a professional PDF that explains what has actually been built, how the system works, how its components interact, how data flows through it, and how large and sophisticated the platform currently is.

The documentation must make it possible for a senior engineer, quantitative researcher, CTO, architect, or institutional investment-technology team to understand the platform **without having to manually inspect the entire source code themselves**.

---

# 1. SOURCE OF TRUTH — ABSOLUTE RULE

The **implemented source code is the ONLY source of truth**.

You must derive the documentation exclusively from actual implementation.

### Completely ignore:

* `README.md`
* `README` files
* `PROJECT.md`
* Architecture documents
* Design documents
* Planning documents
* Markdown documentation
* Wiki files
* Developer notes
* TODO documents
* Comments
* Docblocks
* Inline comments
* Function descriptions written in comments
* Architectural explanations written in comments
* Any other documentation

Do not use these sources to determine what the system does.

### Critical rule

If documentation says:

> "The system supports X"

but the source code does not actually implement X:

**X does not exist for the purposes of this documentation.**

If a comment says:

> "This service provides real-time market data"

but the implementation does something else:

**Document what the implementation actually does.**

If documentation and implementation disagree:

> **IMPLEMENTATION WINS.**

If comments and implementation disagree:

> **IMPLEMENTATION WINS.**

---

# 2. THINK LIKE AN INSTITUTIONAL ARCHITECT

Do not analyze this as a small application.

Analyze it as if you were reviewing the technology architecture of a **$5B institutional quantitative investment platform**.

Think in terms of:

* Research infrastructure
* Market-data infrastructure
* Quantitative research
* Signal generation
* Alpha research
* Portfolio construction
* Backtesting
* Simulation
* Risk
* Data lineage
* Point-in-time correctness
* Reproducibility
* Historical data integrity
* Execution architecture
* Model lifecycle
* Scalability
* Reliability
* Fault tolerance
* Data quality
* Observability
* Governance
* Dependency management
* Infrastructure boundaries
* Separation of concerns
* Operational workflows

Do not assume these capabilities exist.

**Investigate whether they actually exist in the code.**

---

# 3. COMPLETE CODEBASE REVERSE ENGINEERING

Perform a repository-wide scan.

Do not stop after identifying the obvious application entry point.

Inspect the entire implemented system, including:

* Applications
* Services
* Engines
* Modules
* Libraries
* Packages
* Classes
* Interfaces
* Abstract classes
* Functions
* Controllers
* APIs
* Workers
* Consumers
* Producers
* Jobs
* Cron processes
* Scripts
* CLI commands
* Database access
* SQL
* ORM
* Repositories
* Models
* Schemas
* Migrations
* Queues
* Event systems
* Caches
* File storage
* External APIs
* Data providers
* Data ingestion
* Data transformation
* Feature engineering
* Quant calculations
* Indicators
* Strategies
* Signals
* Backtesting
* ML
* Model training
* Model inference
* Configuration actually consumed by code
* Environment variables actually consumed by code
* Docker/container configuration
* Infrastructure directly required by the implementation
* Tests where they reveal actual behavior

Trace relationships between these components.

---

# 4. DO NOT DOCUMENT FILES — DOCUMENT THE SYSTEM

Do not produce a catalog such as:

> `service.py` contains class X.

That is not sufficient.

Instead explain:

> `service.py` implements the data normalization stage used by Provider A and Provider B. It converts provider-specific market data into the internal normalized representation consumed by the analysis engine.

The objective is to reconstruct:

```text
Business Capability
        ↓
System Component
        ↓
Implementation
        ↓
Data
        ↓
Dependencies
        ↓
Execution Flow
        ↓
Output
```

---

# 5. RECONSTRUCT THE ACTUAL ARCHITECTURE

Create an institutional-grade architecture model from the code.

Identify actual:

* Domain boundaries
* Service boundaries
* Data boundaries
* Infrastructure boundaries
* Provider boundaries
* Processing boundaries
* Research boundaries
* Analytics boundaries
* Storage boundaries

Determine which components are:

* Core
* Supporting
* Shared
* Peripheral
* Legacy
* Experimental
* Unused
* Partially implemented

---

# 6. BUILD AN INSTITUTIONAL SYSTEM MAP

Create a high-level map of the entire platform.

For example:

```text
                    ┌──────────────────────────┐
                    │     External Markets     │
                    │ Exchanges / Providers    │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │     Market Data Layer    │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │   Data Normalization     │
                    │   Validation / Quality   │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │   Historical Data Store  │
                    └────────────┬─────────────┘
                                 │
               ┌─────────────────┼─────────────────┐
               ▼                 ▼                 ▼
        Quant Research      Backtesting       ML Research
               │                 │                 │
               └─────────────────┼─────────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │ Signal / Alpha Layer     │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │ Portfolio / Decision     │
                    │ Layer                    │
                    └──────────────────────────┘
```

**This is only an example.**

Do not copy this architecture.

Build the actual architecture from the codebase.

If the real architecture differs significantly, show the real architecture.

---

# 7. QUANTITATIVE RESEARCH ARCHITECTURE

Analyze the platform specifically from a quantitative-research perspective.

Determine how the implementation handles:

### Market Data

* Historical data
* Intraday data
* OHLCV
* Corporate actions
* Fundamentals
* Instruments
* Symbols
* Constituents
* Market metadata
* Provider-specific data
* Normalized data

### Quant Research

Identify:

* Indicators
* Factors
* Features
* Signals
* Alpha calculations
* Momentum
* Ranking
* Scoring
* Screening
* Statistical calculations
* Technical analysis
* Fundamental analysis
* Derived metrics

### Backtesting

Trace:

```text
Historical Data
      ↓
Strategy
      ↓
Signal
      ↓
Order Generation
      ↓
Execution Simulation
      ↓
Portfolio
      ↓
PnL
      ↓
Performance Metrics
```

Only include stages that are actually implemented.

Investigate:

* Look-ahead bias
* Survivorship bias
* Point-in-time data
* Corporate actions
* Delisted securities
* Transaction costs
* Slippage
* Liquidity assumptions
* Execution assumptions
* Portfolio accounting
* Position sizing
* Cash management
* Drawdowns
* Risk metrics
* Benchmarking
* Reproducibility

Do not assume these features exist.

Explicitly state which are implemented, partially implemented, or absent.

---

# 8. POINT-IN-TIME DATA INTEGRITY

Because this is an institutional quant platform, investigate historical correctness extremely carefully.

Determine whether the code actually supports:

* Point-in-time data
* Historical fundamentals
* Historical constituents
* Historical symbol mappings
* Corporate-action adjustments
* Delisted stocks
* Historical metadata
* Data versioning
* Effective dates
* Publication dates
* As-of dates
* Data availability timestamps

Determine whether the architecture prevents:

```text
Future Information
        ↓
Historical Backtest
        ↓
False Alpha
```

If the platform does not prevent this, explicitly identify the limitation.

Do not claim institutional-grade point-in-time correctness unless the implementation proves it.

---

# 9. DATA LINEAGE

For important datasets, trace the complete lineage:

```text
External Source
      ↓
Raw Data
      ↓
Parser
      ↓
Validation
      ↓
Normalization
      ↓
Storage
      ↓
Transformation
      ↓
Derived Dataset
      ↓
Quant Feature
      ↓
Signal
      ↓
Backtest / Analysis
```

Identify the actual lineage implemented in the code.

For major datasets, explain:

* Origin
* Format
* Ingestion
* Transformation
* Storage
* Consumers
* Derived datasets
* Final usage

---

# 10. REAL-LIFE INSTITUTIONAL EXAMPLES

Use realistic institutional examples throughout the document.

For example:

### Example — Researcher Evaluating Momentum

A quantitative researcher wants to determine whether a stock is developing an unusual momentum profile.

Explain exactly what happens in the implemented system:

```text
Research Request
      ↓
Data Retrieval
      ↓
Historical Market Data
      ↓
Feature Calculation
      ↓
Momentum Analysis
      ↓
Signal
      ↓
Research Result
```

Explain which actual components perform each stage.

---

### Example — Backtesting a Strategy

Show a realistic workflow:

```text
Strategy Definition
        ↓
Historical Universe
        ↓
Point-in-Time Data
        ↓
Signal Generation
        ↓
Portfolio Construction
        ↓
Trade Simulation
        ↓
PnL
        ↓
Performance Analysis
```

Again, only document stages actually implemented.

---

# 11. SYSTEM DEPENDENCY GRAPH

Build a dependency graph showing the major components.

Identify:

* Central components
* Highly connected components
* Shared infrastructure
* Critical dependencies
* Provider dependencies
* Database dependencies
* Cross-service dependencies
* Circular dependencies
* Potential bottlenecks
* Single points of failure

Highlight components where:

```text
Many Components
       ↓
Depend On
       ↓
One Component
```

These are architecturally important.

---

# 12. COMPLEXITY AND SCALE

Measure the actual codebase where possible.

Report:

* Total source files
* Lines of code
* Major modules
* Services
* Engines
* Data providers
* APIs
* Databases
* Tables
* Queues
* Workers
* Scheduled jobs
* Strategies
* Indicators
* Models
* External integrations
* Major pipelines
* Entry points

Do not invent measurements.

If a metric cannot be reliably calculated, say:

> "Not reliably measurable from the repository."

---

# 13. ARCHITECTURAL MATURITY ASSESSMENT

Provide an objective assessment of the current implementation.

Evaluate areas such as:

| Area                      | Assessment                      |
| ------------------------- | ------------------------------- |
| Market Data               | Implemented / Partial / Missing |
| Data Normalization        | ...                             |
| Data Quality              | ...                             |
| Point-in-Time Correctness | ...                             |
| Backtesting               | ...                             |
| Strategy Framework        | ...                             |
| Portfolio Simulation      | ...                             |
| Risk                      | ...                             |
| ML                        | ...                             |
| Scalability               | ...                             |
| Fault Tolerance           | ...                             |
| Observability             | ...                             |
| Reproducibility           | ...                             |
| Data Lineage              | ...                             |
| Provider Abstraction      | ...                             |

Do not assign ratings based on what "should" exist.

Base every assessment on actual implementation.

---

# 14. IMPLEMENTED VS UNUSED VS PARTIAL

Every major subsystem should be classified.

Use:

### 🟢 Implemented & Used

Code exists and is actively connected to system workflows.

### 🟡 Implemented but Limited

Code exists but functionality is incomplete or restricted.

### 🟠 Implemented but Apparently Unused

Implementation exists but no meaningful runtime path to it could be established.

### 🔴 Referenced but Missing

Other code expects it, but implementation is absent or incomplete.

### ⚪ Documentation Only

Mentioned in documentation/comments but not implemented.

Documentation-only functionality must **not** be presented as part of the current platform.

---

# 15. IDENTIFY ARCHITECTURAL RISKS

Without redesigning the system, identify risks observable from the code.

Examples:

* Tight coupling
* Duplicate logic
* Large monolithic components
* Excessive dependencies
* Missing abstractions
* Hard-coded providers
* Data integrity risks
* Look-ahead bias risks
* Survivorship bias risks
* Non-deterministic behavior
* Lack of reproducibility
* Race conditions
* Concurrency problems
* Scaling bottlenecks
* Single points of failure
* Missing validation
* Inconsistent schemas
* Provider lock-in
* Excessive database dependency
* Memory-intensive processing
* Inefficient data movement

Separate:

**Observed Fact**

from

**Architectural Interpretation**

---

# 16. DO NOT TURN THIS INTO A CODE REVIEW

This is primarily an **architecture and system documentation exercise**.

Do not spend most of the document reviewing coding style.

The primary question is:

> **What system has actually been built?**

Code-quality observations should only be included when they affect:

* Architecture
* Reliability
* Scalability
* Data correctness
* Maintainability
* Quant research correctness
* System behavior

---

# 17. EXECUTIVE "WHAT HAVE WE BUILT?" SECTION

The final document must contain a powerful executive summary answering:

> **What exactly is this platform today?**

Explain it in plain language.

For example:

> "The platform is not simply a stock-analysis application. It currently consists of X major subsystems connected through Y data pipelines..."

Then explain the actual discovered architecture.

This section should allow an executive or investor to understand the **scale and breadth of the technology platform in 5–10 minutes**.

---

# 18. FINAL ARCHITECTURAL MAP

End with a consolidated diagram representing:

```text
                    ENTIRE QUANT PLATFORM

                         ┌─────────┐
                         │ Markets │
                         └────┬────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Market Data     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Data Platform   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
          Research       Backtesting       ML
              │              │              │
              └──────────────┼──────────────┘
                             ▼
                       Alpha / Signals
                             │
                             ▼
                       Portfolio Layer
```

Again, **do not assume this structure**.

Generate the actual consolidated architecture from the repository.

---

# 19. FINAL STANDARD

The finished PDF should feel like an **institutional technology architecture document**, not a README.

It should be suitable for:

* CTO review
* Principal engineer review
* Quant researcher onboarding
* Architecture review
* Engineering planning
* Investment technology due diligence
* System modernization planning
* Future development planning

It should be:

* Deep
* Accurate
* Evidence-based
* Visually structured
* Diagram-heavy
* Easy to navigate
* Technically precise
* Understandable
* Honest about limitations

---

# ABSOLUTE FINAL INSTRUCTION

Before generating the PDF, mentally reconstruct the entire platform from the implementation.

Do not ask:

> "What does the README say the system is?"

Ask:

> **"If all documentation disappeared tomorrow and only the source code remained, what system would actually exist?"**

That is the system you must document.

Treat the codebase as the architecture of a **$5B institutional quant platform undergoing a technology due-diligence review**.

Be rigorous.

Be skeptical.

Do not assume.

Do not fill gaps with imagination.

Do not promote planned functionality to implemented functionality.

Do not allow comments or documentation to influence your understanding of implementation.

**Code is truth. Everything else is evidence of intent, not evidence of existence.**
