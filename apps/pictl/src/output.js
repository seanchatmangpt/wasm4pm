"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamingOutput = exports.JSONFormatter = exports.HumanFormatter = void 0;
exports.getFormatter = getFormatter;
var consola_1 = require("consola");
/**
 * Human-readable formatter using consola
 */
var HumanFormatter = /** @class */ (function () {
    function HumanFormatter(options) {
        if (options === void 0) { options = {}; }
        var _a, _b;
        this.verbose = (_a = options.verbose) !== null && _a !== void 0 ? _a : false;
        this.quiet = (_b = options.quiet) !== null && _b !== void 0 ? _b : false;
    }
    HumanFormatter.prototype.success = function (message) {
        if (!this.quiet) {
            consola_1.consola.success(message);
        }
    };
    HumanFormatter.prototype.info = function (message) {
        if (!this.quiet) {
            consola_1.consola.info(message);
        }
    };
    HumanFormatter.prototype.warn = function (message) {
        consola_1.consola.warn(message);
    };
    HumanFormatter.prototype.error = function (message) {
        consola_1.consola.error(message);
    };
    HumanFormatter.prototype.debug = function (message) {
        if (this.verbose) {
            consola_1.consola.log("[DEBUG] ".concat(message));
        }
    };
    HumanFormatter.prototype.box = function (message) {
        if (!this.quiet) {
            consola_1.consola.box(message);
        }
    };
    HumanFormatter.prototype.log = function (message, data) {
        if (!this.quiet) {
            // Use console.log directly for synchronous output that flushes with process.exit()
            // consola.log may buffer and not flush before process termination in test environments
            if (data && Object.keys(data).length > 0) {
                console.log(message, data);
            }
            else {
                console.log(message);
            }
        }
    };
    return HumanFormatter;
}());
exports.HumanFormatter = HumanFormatter;
/**
 * JSON formatter for machine-readable output
 */
var JSONFormatter = /** @class */ (function () {
    function JSONFormatter(options) {
        if (options === void 0) { options = {}; }
        var _a;
        this.quiet = (_a = options.quiet) !== null && _a !== void 0 ? _a : false;
    }
    JSONFormatter.prototype.output = function (data) {
        if (!this.quiet) {
            console.log(JSON.stringify(data, null, 2));
        }
    };
    JSONFormatter.prototype.success = function (message, data) {
        if (!this.quiet) {
            this.output(__assign({ status: 'success', message: message }, (data !== null && data !== void 0 ? data : {})));
        }
    };
    JSONFormatter.prototype.error = function (message, error) {
        this.output({
            status: 'error',
            message: message,
            error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        });
    };
    JSONFormatter.prototype.warn = function (message, data) {
        if (!this.quiet) {
            this.output(__assign({ status: 'warning', message: message }, (data !== null && data !== void 0 ? data : {})));
        }
    };
    return JSONFormatter;
}());
exports.JSONFormatter = JSONFormatter;
/**
 * Streaming output handler for watch mode
 */
var StreamingOutput = /** @class */ (function () {
    function StreamingOutput(options) {
        if (options === void 0) { options = {}; }
        var _a;
        this.format = (_a = options.format) !== null && _a !== void 0 ? _a : 'human';
        this.humanFormatter = new HumanFormatter(options);
        this.jsonFormatter = new JSONFormatter(options);
    }
    StreamingOutput.prototype.startStream = function () {
        if (this.format === 'human') {
            this.humanFormatter.info('Watching for changes...');
        }
    };
    StreamingOutput.prototype.emitEvent = function (eventType, data) {
        if (this.format === 'json') {
            this.jsonFormatter.output(__assign({ type: eventType, timestamp: new Date().toISOString() }, data));
        }
        else {
            this.humanFormatter.log("[".concat(eventType, "] ").concat(JSON.stringify(data)));
        }
    };
    StreamingOutput.prototype.endStream = function () {
        if (this.format === 'human') {
            this.humanFormatter.info('Watch mode ended');
        }
    };
    return StreamingOutput;
}());
exports.StreamingOutput = StreamingOutput;
/**
 * Get formatter instance based on format option
 */
function getFormatter(options) {
    if (options === void 0) { options = {}; }
    if (options.format === 'json') {
        return new JSONFormatter(options);
    }
    return new HumanFormatter(options);
}
