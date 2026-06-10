workspace "ggen Living LSP and Receipted Manufacturing" "Architecture for ggen's source-law driven manufacturing and its integration with wasm4pm as an external process-law oracle." {

    model {
        author = person "Author / Architect" "Edits source-law surfaces and reviews diagnostics"
        agent = person "Autonomous Workcell / Agent" "Performs bounded repairs under checkpoint law" "Robot"

        editor = softwareSystem "Editor / IDE" "LSP client surface"
        git = softwareSystem "Git / GitHub" "Version control, PRs, branch history"
        wasm4pm = softwareSystem "wasm4pm / wpm" "Process-mining, discovery, conformance, OCEL analysis authority" "External"
        ci = softwareSystem "CI / Build Gates" "Repository-wide verification and policy gates" "External"

        ggen = softwareSystem "ggen CodeManufactory" "Receipted software manufacturing system. Open-ontology source law, Living LSP, actuation boundary, receipts, replay." {
            
            ontology = container "Open Ontology / Source-Law Layer" "Public-footed source law, ontology surfaces, query logic, validation footing." "RDF / SPARQL / SHACL / PROV-O" {
                ggen_toml = component "ggen.toml Rule Surface" "Declares project, ontology, generation rules, query/template/output bindings" "TOML"
                ontology_docs = component "Ontology Sources" "Public-footed domain and source-law definitions" "TTL / RDF"
                sparql_queries = component "SPARQL Query Surfaces" "Producer-set declarations" ".rq"
                templates = component "Template Surfaces" "Consumer-set declarations" ".tera"
                outputs = component "Output Path Declarations" "Declared artifact path law" "output_file"
                shacl = component "Validation Shapes" "Graph constraint and structural validation" "SHACL"
                provenance = component "Provenance / Public Vocabulary Layer" "Meaning-bearing public footing for provenance, labeling, and relation context" "PROV-O / DCTERMS / SKOS"
            }

            lsp = container "ggen-lsp" "Read-only Living LSP. Project-relation diagnostics, lifecycle observation, route law, residual-preserving clears, headless check." "Rust" {
                server = component "Language Server Surface" "LSP entry points, request handling, refresh triggers, republish flow" "server.rs"
                state = component "ServerState / Living Lifecycle Core" "observe_diagnostics, keyed subtraction, residual preservation, pending repair tracking" "state.rs"
                check = component "Headless Check Surface" "Stateless repository validation; invalid fails / repaired passes" "check.rs"
                project_index = component "ProjectIndex / RuleIndex" "Project-wide relation indexing across rules, queries, templates, output declarations" "indexing"
                tera_analyzer = component "Tera Analyzer" "Consumer-set extraction from templates" "analyzers/tera_analyzer.rs"
                harness_analyzer = component "Harness / Proof Analyzer" "Proof-topology / harness relation checking" "future or active species analyzer"
                detectors = component "Diagnostic Detectors" "Project-relation diagnostics over indexed source-law surfaces" "detect_tpl_001, etc."
                species = component "Diagnostic Species Registry" "Declares active, dormant, and checkpoint-gated species" "route/diagnostic_species.rs"
                routes = component "Route Registry" "Maps diagnostics to source-law repair families and routes" "route/registry.rs"
                law_surfaces = component "Law Surface Discovery" "Maps files and URIs to source-law roles" "surface discovery"
                events = component "Event Builders" "Builds DiagnosticRaised, RouteSelected, RepairApplied, etc." "intel/events.rs"
                log = component "Intel Log Writer" "Append-only OCEL/NDJSON emission" "intel/log.rs"
                receipt_logic = component "Receipt / Gate Correlation" "Correlates clear-through-lifecycle with receipt-worthy closure" "state + intel integration"
                
                residual = component "Residual Diagnostic Builder" "Builds per-URI residual diagnostic set"
                pending = component "Pending Repair Store" "Records pending repairs"
            }

            graph = container "ggen-graph" "Indexes project relations and holds OCEL/event-related domain structures." "Rust"
            core = container "ggen-core" "Rule loading, orchestration, sync execution, repository work laws." "Rust"
            
            sync = container "ggen sync" "Only lawful actuation boundary. Materializes outputs from admitted source law." "Rust CLI"

            evidence = container "Receipt / OCEL / Process Evidence" "Externalized process evidence and receipt chain" "NDJSON / Markdown" {
                ocel_stream = component "OCEL Event Stream" "Append-only NDJSON event stream" ".ggen/ocel/agent-edit-events.ocel.jsonl"
                receipt_docs = component "Checkpoint Receipts" "Checkpoint verdicts and boundary receipts" "docs/receipts/*.md"
                replay_packets = component "Replay / Process Memory Packets" "Receipted process slices used for few-shot/build-shot continuation" "future artifact"
            }
        }

        # Context level relationships
        author -> editor "Authors ggen.toml, SPARQL, templates, ontology, proof surfaces"
        agent -> editor "Operates through bounded author-time surfaces"
        editor -> ggen "LSP requests / diagnostics / code actions"
        author -> git "Commits / reviews / merges"
        agent -> git "Works through bounded branch / PR flow"
        ggen -> git "Reads repository state, receipts, source-law surfaces"
        ggen -> ci "Runs verification gates and checks"
        ggen -> wasm4pm "Emits OCEL/process evidence for external mining and conformance"
        wasm4pm -> ggen "Returns external conformance / process-law judgment"
        git -> ggen "Provides stable source graph O*"

        # Container level relationships
        editor -> lsp "LSP protocol"
        lsp -> ontology "Reads and evaluates source-law relations"
        lsp -> graph "Builds relation indexes / diagnostic context"
        lsp -> evidence "Appends process-evidence events"
        lsp -> evidence "References proof obligations / prior receipts"
        lsp -> core "Uses shared project loading and rule discovery"
        sync -> core "Uses"
        sync -> ontology "Consumes admitted source law"
        sync -> graph "Reads indexed rules / graph context"
        sync -> evidence "Emits or updates boundary receipts"
        sync -> evidence "May append actuation-related evidence"
        git -> lsp "Repository source graph O*"
        git -> sync "Repository source graph O*"
        ci -> lsp "Runs headless ggen lsp check"
        ci -> sync "Runs verification / integration gates"
        evidence -> wasm4pm "Provided as external OCEL/process evidence"
        wasm4pm -> evidence "Provides external process-law judgment usable in receipts"

        # Component relationships (Ontology)
        ggen_toml -> sparql_queries "Binds"
        ggen_toml -> templates "Binds"
        ggen_toml -> outputs "Declares"
        ggen_toml -> ontology_docs "References"
        ontology_docs -> shacl "Validated by / constrained through"
        ontology_docs -> provenance "Framed with"
        sparql_queries -> provenance "Interpreted in public footing"
        templates -> provenance "Interpreted in public footing"
        outputs -> provenance "Interpreted in public footing"

        # Component relationships (LSP)
        server -> state "Delegates live observation to"
        server -> check "Triggers or parallels"
        check -> project_index "Builds relation context from"
        state -> project_index "Builds / refreshes relation context from"
        project_index -> tera_analyzer "Uses"
        project_index -> harness_analyzer "Uses"
        project_index -> law_surfaces "Uses"
        detectors -> project_index "Reads producer/consumer relation state from"
        detectors -> species "Uses species definitions from"
        detectors -> routes "Resolves route-at-raise through"
        check -> detectors "Executes"
        state -> detectors "Executes through live orchestration"
        state -> events "Builds lifecycle events through"
        events -> log "Writes events to"
        state -> receipt_logic "Uses"
        receipt_logic -> log "Emits receipt-related evidence to"
        state -> routes "Matches pending repairs to routes"
        state -> species "Checks active/dormant status"
        
        # Component relationships (Live Diagnostic Lifecycle specific)
        state -> residual "build per-URI residual diagnostic set"
        detectors -> pending "record pending repair only if route exists"
        residual -> pending "old_keys - new_keys match disappearance"
        residual -> events "DiagnosticRaised / RepairApplied / GatePassed / ReceiptEmitted"

        # Component relationships (Evidence)
        events -> ocel_stream "Appends to"
        ocel_stream -> wasm4pm "Imported / mined / conformed by"
        wasm4pm -> receipt_docs "Provides process-law judgment for"
        receipt_docs -> replay_packets "Used to derive"
        ocel_stream -> replay_packets "Used to derive"
        ci -> receipt_docs "Reads / validates"
        ci -> ocel_stream "Uses as external evidence surface"
    }

    views {
        systemContext ggen "SystemContext" {
            include *
            autoLayout
        }

        container ggen "Containers" {
            include *
            autoLayout
        }

        component lsp "LSPComponents" {
            include *
            autoLayout
        }

        component ontology "OntologyComponents" {
            include *
            autoLayout
        }

        component evidence "EvidenceComponents" {
            include *
            autoLayout
        }
        
        styles {
            element "Person" {
                shape Person
                background #08427b
                color #ffffff
            }
            element "Robot" {
                shape Robot
                background #0a5096
                color #ffffff
            }
            element "Software System" {
                background #1168bd
                color #ffffff
            }
            element "External" {
                background #999999
                color #ffffff
            }
            element "Container" {
                background #438dd5
                color #ffffff
            }
            element "Component" {
                background #85bbf0
                color #000000
            }
        }
    }
}