#!/bin/bash

# Schema generation script
# Generates OpenAPI schemas and TypeScript types for contracts

set -e

echo "========================================"
echo "Schema and Type Generation"
echo "========================================"

SCHEMA_DIR=".github/schemas"
mkdir -p "$SCHEMA_DIR"

# Generate OpenAPI schema from package.json exports
echo ""
echo "Generating OpenAPI schema..."

cat > "$SCHEMA_DIR/openapi.json" << 'EOF'
{
  "openapi": "3.0.0",
  "info": {
    "title": "wasm4pm API",
    "version": "26.4.5",
    "description": "High-performance process mining algorithms in WebAssembly",
    "contact": {
      "name": "wasm4pm Contributors",
      "url": "https://github.com/seanchatmangpt/wasm4pm"
    },
    "license": {
      "name": "MIT OR Apache-2.0"
    }
  },
  "servers": [
    {
      "url": "https://npm.js.org",
      "description": "npm Registry"
    }
  ],
  "paths": {
    "/wasm4pm": {
      "get": {
        "summary": "Get wasm4pm package",
        "operationId": "getWasm4pm",
        "responses": {
          "200": {
            "description": "wasm4pm package metadata",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "name": {
                      "type": "string",
                      "example": "wasm4pm"
                    },
                    "version": {
                      "type": "string",
                      "example": "26.4.5"
                    },
                    "description": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "EventLog": {
        "type": "object",
        "description": "Process mining event log",
        "properties": {
          "traces": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Trace"
            }
          },
          "attributes": {
            "type": "object",
            "additionalProperties": true
          }
        }
      },
      "Trace": {
        "type": "object",
        "description": "Single trace (sequence of events)",
        "properties": {
          "events": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Event"
            }
          },
          "caseId": {
            "type": "string"
          }
        }
      },
      "Event": {
        "type": "object",
        "description": "Single event",
        "properties": {
          "activity": {
            "type": "string"
          },
          "timestamp": {
            "type": "string",
            "format": "date-time"
          },
          "attributes": {
            "type": "object",
            "additionalProperties": true
          }
        }
      },
      "PetriNet": {
        "type": "object",
        "description": "Petri net model",
        "properties": {
          "places": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "transitions": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "arcs": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "source": { "type": "string" },
                "target": { "type": "string" }
              }
            }
          }
        }
      },
      "DFG": {
        "type": "object",
        "description": "Directly-Follows Graph",
        "properties": {
          "nodes": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "edges": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "source": { "type": "string" },
                "target": { "type": "string" },
                "frequency": { "type": "integer" }
              }
            }
          }
        }
      }
    }
  }
}
EOF

echo "✓ OpenAPI schema generated: $SCHEMA_DIR/openapi.json"

# Generate TypeScript interface definitions
echo ""
echo "Generating TypeScript type definitions..."

cat > "$SCHEMA_DIR/types.ts" << 'EOF'
/**
 * wasm4pm Type Definitions
 * Generated from schema verification
 */

export interface EventLog {
  traces: Trace[];
  attributes?: Record<string, unknown>;
}

export interface Trace {
  caseId: string;
  events: Event[];
  attributes?: Record<string, unknown>;
}

export interface Event {
  activity: string;
  timestamp?: Date | string;
  attributes?: Record<string, unknown>;
  resource?: string;
  cost?: number;
}

export interface PetriNet {
  places: string[];
  transitions: string[];
  arcs: Arc[];
  initialMarking?: Map<string, number>;
  finalMarkings?: Map<string, number>[];
}

export interface Arc {
  source: string;
  target: string;
  weight?: number;
}

export interface DFG {
  nodes: string[];
  edges: DFGEdge[];
  startActivities?: Map<string, number>;
  endActivities?: Map<string, number>;
}

export interface DFGEdge {
  source: string;
  target: string;
  frequency: number;
}

export interface ProcessModel {
  model: PetriNet | DFG;
  fitness: number;
  precision: number;
  simplicity: number;
  generalization: number;
}

export interface AlgorithmOptions {
  timeout?: number;
  maxIterations?: number;
  populationSize?: number;
  mutationRate?: number;
  crossoverRate?: number;
  [key: string]: unknown;
}

export interface AnalysisResult {
  model: ProcessModel;
  executionTime: number;
  tracesFitted: number;
  warnings?: string[];
}
EOF

echo "✓ TypeScript types generated: $SCHEMA_DIR/types.ts"

# Generate JSON Schema for validation
echo ""
echo "Generating JSON Schema..."

cat > "$SCHEMA_DIR/event-log.schema.json" << 'EOF'
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Event Log",
  "description": "Process mining event log in XES or JSON format",
  "type": "object",
  "required": ["traces"],
  "properties": {
    "traces": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["caseId", "events"],
        "properties": {
          "caseId": {
            "type": "string",
            "description": "Unique trace identifier"
          },
          "events": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["activity", "timestamp"],
              "properties": {
                "activity": {
                  "type": "string",
                  "description": "Activity/event name"
                },
                "timestamp": {
                  "type": "string",
                  "format": "date-time",
                  "description": "Event occurrence time"
                },
                "resource": {
                  "type": "string",
                  "description": "Resource/user performing activity"
                },
                "cost": {
                  "type": "number",
                  "description": "Cost of this event"
                },
                "attributes": {
                  "type": "object",
                  "description": "Additional event attributes"
                }
              }
            }
          },
          "attributes": {
            "type": "object",
            "description": "Trace-level attributes"
          }
        }
      }
    },
    "attributes": {
      "type": "object",
      "description": "Log-level attributes"
    }
  }
}
EOF

echo "✓ JSON Schema generated: $SCHEMA_DIR/event-log.schema.json"

# Generate contract checksum
echo ""
echo "Generating contract checksums..."

cat > "$SCHEMA_DIR/CHECKSUMS" << EOF
# Schema Checksums
# Generated: $(date -u +'%Y-%m-%dT%H:%M:%SZ')
# Version: 26.4.5

$(sha256sum "$SCHEMA_DIR"/*.json "$SCHEMA_DIR"/*.ts 2>/dev/null | head -20)
EOF

echo "✓ Contract checksums generated"

echo ""
echo "========================================"
echo "✓ Schema generation complete"
echo "========================================"
echo ""
echo "Generated files:"
echo "  - $SCHEMA_DIR/openapi.json"
echo "  - $SCHEMA_DIR/types.ts"
echo "  - $SCHEMA_DIR/event-log.schema.json"
echo "  - $SCHEMA_DIR/CHECKSUMS"
echo ""
