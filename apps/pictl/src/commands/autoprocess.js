"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoprocess = void 0;
var citty_1 = require("citty");
var fs = require("fs/promises");
var path = require("path");
var output_js_1 = require("../output.js");
var exit_codes_js_1 = require("../exit-codes.js");
var engine_1 = require("@pictl/engine");
var AUTOPROCESS_STATE_FILE = '.pictl/autoprocess-state.json';
function ensureStateDir() {
    return __awaiter(this, void 0, void 0, function () {
        var dir, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    dir = path.dirname(AUTOPROCESS_STATE_FILE);
                    return [4 /*yield*/, fs.mkdir(dir, { recursive: true })];
                case 1:
                    _b.sent();
                    return [3 /*break*/, 3];
                case 2:
                    _a = _b.sent();
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function loadState(wasm) {
    return __awaiter(this, void 0, void 0, function () {
        var content, state, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fs.readFile(AUTOPROCESS_STATE_FILE, 'utf-8')];
                case 1:
                    content = _a.sent();
                    state = JSON.parse(content);
                    // Restore RL state
                    if (state.rl_state) {
                        wasm.restore_rl_state(JSON.stringify(state.rl_state));
                    }
                    // Restore SPC history
                    if (state.spc_history) {
                        wasm.set_spc_history(JSON.stringify(state.spc_history));
                    }
                    // Restore circuit breaker state
                    if (state.circuit_breaker_state) {
                        wasm.circuit_breaker_set_state(JSON.stringify(state.circuit_breaker_state));
                    }
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _a.sent();
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function saveState(wasm) {
    return __awaiter(this, void 0, void 0, function () {
        var rl_state, spc_history, circuit_breaker_state, fullState, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    rl_state = JSON.parse(wasm.serialize_rl_state());
                    spc_history = JSON.parse(wasm.get_spc_history());
                    circuit_breaker_state = JSON.parse(wasm.circuit_breaker_get_state());
                    fullState = {
                        rl_state: rl_state,
                        spc_history: spc_history,
                        circuit_breaker_state: circuit_breaker_state,
                        saved_at: new Date().toISOString(),
                    };
                    return [4 /*yield*/, ensureStateDir()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, fs.writeFile(AUTOPROCESS_STATE_FILE, JSON.stringify(fullState, null, 2))];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_2 = _a.sent();
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
exports.autoprocess = (0, citty_1.defineCommand)({
    meta: {
        name: 'autoprocess',
        description: 'Run AutoProcess: Perception → Decision → Protection → Optimization',
    },
    args: {
        input: {
            type: 'positional',
            description: 'Path to XES event log',
            required: true,
        },
        'activity-key': {
            type: 'string',
            description: 'Activity attribute key (default: concept:name)',
            default: 'concept:name',
            alias: 'k',
        },
        config: {
            type: 'string',
            description: 'AutoProcess configuration (JSON)',
        },
        format: {
            type: 'string',
            description: 'Output format (human or json)',
            default: 'human',
        },
        verbose: {
            type: 'boolean',
            description: 'Enable verbose output',
            alias: 'v',
        },
        quiet: {
            type: 'boolean',
            description: 'Suppress non-error output',
            alias: 'q',
        },
    },
    run: function (ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var formatter, loader, wasm, inputPath, xesContent, logHandle, cycleConfig, rawResult, result, cycle, timing, spc, spcEntries, _i, spcEntries_1, _a, metric, status_1, icon, error_3, exitCode;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        formatter = (0, output_js_1.getFormatter)({
                            format: ctx.args.format,
                            verbose: ctx.args.verbose,
                            quiet: ctx.args.quiet,
                        });
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 6, , 7]);
                        loader = engine_1.WasmLoader.getInstance();
                        return [4 /*yield*/, loader.init()];
                    case 2:
                        _b.sent();
                        wasm = loader.get();
                        // 2. Load persisted state (RL, SPC, circuit breaker)
                        return [4 /*yield*/, loadState(wasm)];
                    case 3:
                        // 2. Load persisted state (RL, SPC, circuit breaker)
                        _b.sent();
                        inputPath = ctx.args.input;
                        return [4 /*yield*/, fs.readFile(inputPath, 'utf-8')];
                    case 4:
                        xesContent = _b.sent();
                        logHandle = wasm.load_eventlog_from_xes(xesContent);
                        cycleConfig = ctx.args.config || '{}';
                        rawResult = wasm.autonomic_execute_cycle(logHandle, ctx.args['activity-key'], cycleConfig);
                        result = typeof rawResult === 'string'
                            ? JSON.parse(rawResult)
                            : rawResult;
                        // 4. Format output
                        if (formatter instanceof output_js_1.JSONFormatter) {
                            formatter.success('AutoProcess cycle completed', result);
                        }
                        else {
                            cycle = result.cycle_result;
                            timing = result.timing;
                            formatter.info('AutoProcess Results');
                            formatter.log('');
                            // Perception
                            formatter.log('  Perception:');
                            formatter.log("    Events: ".concat(cycle.perception.event_count));
                            formatter.log("    Activities: ".concat(cycle.perception.unique_activities));
                            formatter.log("    Traces: ".concat(cycle.perception.trace_count));
                            formatter.log("    Health: ".concat(cycle.perception.health_state, " (score ").concat(cycle.perception.health_score, ")"));
                            formatter.log('');
                            // Decision
                            formatter.log('  Decision:');
                            formatter.log("    Guard: ".concat(cycle.decision.guard_result ? 'PASS' : 'FAIL'));
                            formatter.log("    Pattern: ".concat(cycle.decision.pattern_result, " (").concat(cycle.decision.pattern_ticks, " ticks)"));
                            formatter.log('');
                            // Protection
                            formatter.log('  Protection:');
                            formatter.log("    Circuit: ".concat(cycle.protection.circuit_state));
                            spc = cycle.protection.spc_results;
                            if (spc) {
                                spcEntries = Object.entries(spc);
                                for (_i = 0, spcEntries_1 = spcEntries; _i < spcEntries_1.length; _i++) {
                                    _a = spcEntries_1[_i], metric = _a[0], status_1 = _a[1];
                                    icon = status_1 === 'OK' ? '+' : status_1 === 'ALERT' ? '!' : '-';
                                    formatter.log("    SPC ".concat(metric, ": ").concat(icon, " ").concat(status_1));
                                }
                            }
                            formatter.log("    Special Causes: ".concat(cycle.protection.special_causes.length));
                            formatter.log('');
                            // Optimization
                            formatter.log('  Optimization:');
                            formatter.log("    Action: ".concat(cycle.optimization.rl_action));
                            formatter.log('');
                            // Timing
                            formatter.log('  Timing:');
                            formatter.log("    Total: ".concat(timing.total_ns, " ns (see benchmarks for nanosecond measurements)"));
                            formatter.log('');
                            // Success indicator
                            if (cycle.success) {
                                formatter.log('  Result: Cycle completed successfully');
                            }
                            else {
                                formatter.log('  Result: Cycle completed with warnings');
                            }
                        }
                        // 5. Save persisted state (RL, SPC, circuit breaker)
                        return [4 /*yield*/, saveState(wasm)];
                    case 5:
                        // 5. Save persisted state (RL, SPC, circuit breaker)
                        _b.sent();
                        // 6. Cleanup
                        wasm.delete_object(logHandle);
                        // Use process.exit() to prevent citty from printing help text
                        // The formatter uses synchronous console.log for output that flushes immediately
                        process.exit(exit_codes_js_1.EXIT_CODES.success);
                        return [3 /*break*/, 7];
                    case 6:
                        error_3 = _b.sent();
                        exitCode = exit_codes_js_1.EXIT_CODES.execution_error;
                        // File not found or read errors are source errors
                        if (error_3 instanceof Error) {
                            if ('code' in error_3 && error_3.code === 'ENOENT') {
                                exitCode = exit_codes_js_1.EXIT_CODES.source_error;
                            }
                        }
                        if (formatter instanceof output_js_1.JSONFormatter) {
                            formatter.error('AutoProcess failed', error_3);
                        }
                        else {
                            formatter.error("AutoProcess failed: ".concat(error_3 instanceof Error ? error_3.message : String(error_3)));
                        }
                        process.exit(exitCode);
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/];
                }
            });
        });
    },
});
