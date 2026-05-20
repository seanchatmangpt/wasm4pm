import fs from 'fs';
import { load_eventlog_from_xes } from "./wasm4pm/pkg/wasm4pm.js";
const xml = fs.readFileSync('bench_data/bpi2020_travel.xes', 'utf8');
console.log(load_eventlog_from_xes(xml));
