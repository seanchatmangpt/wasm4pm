import { load_eventlog_from_xes } from "./wasm4pm/pkg/wasm4pm.js";
console.log(load_eventlog_from_xes('<?xml version="1.0" encoding="UTF-8"?><log></log>'));
