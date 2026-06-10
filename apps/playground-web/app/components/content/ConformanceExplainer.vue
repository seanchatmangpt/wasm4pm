<template>
  <div class="conformance-explainer not-prose my-8 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
    <!-- Header -->
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
        Alignment-Based Conformance Checking
      </h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Alignment finds the cheapest way to synchronize a trace with the model. Deviations cost 1 each. Fitness = 1 minus the normalized cost.
      </p>
    </div>

    <!-- SVG Diagram -->
    <div class="px-6 py-6 overflow-x-auto">
      <svg
        viewBox="0 0 620 260"
        xmlns="http://www.w3.org/2000/svg"
        class="w-full max-w-2xl mx-auto"
        aria-label="Synchronous product net alignment diagram"
      >
        <!-- Column headers -->
        <text x="90" y="22" text-anchor="middle" font-size="13" font-weight="600" fill="currentColor" class="text-gray-700 dark:text-gray-300">Log Trace</text>
        <text x="530" y="22" text-anchor="middle" font-size="13" font-weight="600" fill="currentColor" class="text-gray-700 dark:text-gray-300">Model</text>

        <!-- ─── LOG TRACE column (left, x=90) ─── -->
        <!-- A -->
        <rect x="40" y="35" width="100" height="38" rx="7" fill="#dbeafe" stroke="#3b82f6" stroke-width="1.5"/>
        <text x="90" y="59" text-anchor="middle" font-size="14" font-weight="600" fill="#1d4ed8">A</text>

        <!-- arrow A→B log -->
        <line x1="90" y1="73" x2="90" y2="95" stroke="#6b7280" stroke-width="1.5" marker-end="url(#arrowGray)"/>

        <!-- B -->
        <rect x="40" y="95" width="100" height="38" rx="7" fill="#dbeafe" stroke="#3b82f6" stroke-width="1.5"/>
        <text x="90" y="119" text-anchor="middle" font-size="14" font-weight="600" fill="#1d4ed8">B</text>

        <!-- arrow B→D log (skip C — log move) -->
        <line x1="90" y1="133" x2="90" y2="155" stroke="#6b7280" stroke-width="1.5" marker-end="url(#arrowGray)"/>

        <!-- D (log only, no C) -->
        <rect x="40" y="155" width="100" height="38" rx="7" fill="#dbeafe" stroke="#3b82f6" stroke-width="1.5"/>
        <text x="90" y="179" text-anchor="middle" font-size="14" font-weight="600" fill="#1d4ed8">D</text>

        <!-- ─── MODEL column (right, x=530) ─── -->
        <!-- A -->
        <rect x="480" y="35" width="100" height="38" rx="7" fill="#dcfce7" stroke="#16a34a" stroke-width="1.5"/>
        <text x="530" y="59" text-anchor="middle" font-size="14" font-weight="600" fill="#15803d">A</text>

        <!-- arrow A→B model -->
        <line x1="530" y1="73" x2="530" y2="95" stroke="#6b7280" stroke-width="1.5" marker-end="url(#arrowGray)"/>

        <!-- B -->
        <rect x="480" y="95" width="100" height="38" rx="7" fill="#dcfce7" stroke="#16a34a" stroke-width="1.5"/>
        <text x="530" y="119" text-anchor="middle" font-size="14" font-weight="600" fill="#15803d">B</text>

        <!-- arrow B→C model -->
        <line x1="530" y1="133" x2="530" y2="155" stroke="#6b7280" stroke-width="1.5" marker-end="url(#arrowGray)"/>

        <!-- C (model only) -->
        <rect x="480" y="155" width="100" height="38" rx="7" fill="#fee2e2" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="5,3"/>
        <text x="530" y="179" text-anchor="middle" font-size="14" font-weight="600" fill="#dc2626">C</text>

        <!-- arrow C→D model -->
        <line x1="530" y1="193" x2="530" y2="215" stroke="#6b7280" stroke-width="1.5" marker-end="url(#arrowGray)"/>

        <!-- D -->
        <rect x="480" y="215" width="100" height="38" rx="7" fill="#dcfce7" stroke="#16a34a" stroke-width="1.5"/>
        <text x="530" y="239" text-anchor="middle" font-size="14" font-weight="600" fill="#15803d">D</text>

        <!-- ─── ALIGNMENT ARROWS (center) ─── -->

        <!-- Sync move A ↔ A (cost 0, green dashed) -->
        <line x1="140" y1="54" x2="480" y2="54" stroke="#16a34a" stroke-width="1.5" stroke-dasharray="6,3" marker-end="url(#arrowGreen)"/>

        <!-- Sync move B ↔ B (cost 0, green dashed) -->
        <line x1="140" y1="114" x2="480" y2="114" stroke="#16a34a" stroke-width="1.5" stroke-dasharray="6,3" marker-end="url(#arrowGreen)"/>

        <!-- Model-only move C (cost 1, red, no log counterpart) -->
        <!-- Visual: red arrow from center pointing to C in model -->
        <line x1="310" y1="174" x2="480" y2="174" stroke="#ef4444" stroke-width="2" stroke-dasharray="4,3" marker-end="url(#arrowRed)"/>
        <rect x="233" y="161" width="78" height="26" rx="5" fill="#fee2e2" stroke="#ef4444" stroke-width="1"/>
        <text x="272" y="179" text-anchor="middle" font-size="11" font-weight="600" fill="#dc2626">Model move</text>

        <!-- Sync move D ↔ D (log D aligns to model D, cost 0, green) -->
        <line x1="140" y1="174" x2="233" y2="174" stroke="#16a34a" stroke-width="1.5" stroke-dasharray="6,3"/>
        <!-- connecting log D at y=174 to model D at y=234 via diagonal -->
        <line x1="140" y1="174" x2="480" y2="234" stroke="#16a34a" stroke-width="1.5" stroke-dasharray="6,3" marker-end="url(#arrowGreen)"/>

        <!-- ─── Arrow marker defs ─── -->
        <defs>
          <marker id="arrowGray" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#6b7280"/>
          </marker>
          <marker id="arrowGreen" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#16a34a"/>
          </marker>
          <marker id="arrowRed" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#ef4444"/>
          </marker>
        </defs>
      </svg>
    </div>

    <!-- Legend -->
    <div class="px-6 pb-4">
      <div class="flex flex-wrap gap-4 justify-center text-sm">
        <div class="flex items-center gap-2">
          <svg width="32" height="12"><line x1="0" y1="6" x2="28" y2="6" stroke="#16a34a" stroke-width="2" stroke-dasharray="6,3"/></svg>
          <span class="text-gray-700 dark:text-gray-300">Synchronous move <span class="font-mono font-semibold text-green-700 dark:text-green-400">(cost 0)</span></span>
        </div>
        <div class="flex items-center gap-2">
          <svg width="32" height="12"><line x1="0" y1="6" x2="28" y2="6" stroke="#ef4444" stroke-width="2" stroke-dasharray="4,3"/></svg>
          <span class="text-gray-700 dark:text-gray-300">Model move <span class="font-mono font-semibold text-red-600 dark:text-red-400">(cost 1)</span></span>
        </div>
        <div class="flex items-center gap-2">
          <svg width="32" height="12"><line x1="0" y1="6" x2="28" y2="6" stroke="#f97316" stroke-width="2" stroke-dasharray="4,3"/></svg>
          <span class="text-gray-700 dark:text-gray-300">Log move <span class="font-mono font-semibold text-orange-600 dark:text-orange-400">(cost 1)</span></span>
        </div>
      </div>
    </div>

    <!-- Cost summary + formula -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 px-6 pb-6">
      <!-- Total alignment cost -->
      <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
          Total Alignment Cost
        </div>
        <div class="flex flex-col gap-1 text-sm">
          <div class="flex items-center justify-between">
            <span class="text-gray-700 dark:text-gray-300">Log moves (A→B→D skips C)</span>
            <span class="font-mono font-bold text-orange-600 dark:text-orange-400">0</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-gray-700 dark:text-gray-300">Model moves (C inserted)</span>
            <span class="font-mono font-bold text-red-600 dark:text-red-400">1</span>
          </div>
          <div class="border-t border-gray-300 dark:border-gray-600 my-1"/>
          <div class="flex items-center justify-between font-semibold">
            <span class="text-gray-800 dark:text-gray-200">Total cost</span>
            <span class="font-mono text-base text-gray-900 dark:text-white">1</span>
          </div>
        </div>
      </div>

      <!-- Fitness formula -->
      <div class="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-4">
        <div class="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-2">
          Fitness Formula
        </div>
        <div class="font-mono text-sm text-blue-900 dark:text-blue-200 mb-3">
          fitness = 1 − (alignment_cost / max_cost)
        </div>
        <div class="text-sm text-blue-800 dark:text-blue-300 space-y-1">
          <div>alignment_cost = <span class="font-semibold">1</span></div>
          <div>max_cost = <span class="font-semibold">4</span> <span class="text-blue-600 dark:text-blue-400">(trace length + model length)</span></div>
          <div class="pt-1 font-bold text-base text-blue-900 dark:text-blue-100">
            fitness = 1 − (1 / 4) = <span class="text-green-700 dark:text-green-400">0.75</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Prose explanation -->
    <div class="px-6 pb-6">
      <div class="rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-4 text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
        <span class="font-semibold">How it works:</span> The alignment algorithm computes the
        <em>synchronous product net</em> of the log trace and the process model. It then finds the
        shortest path through this product net using an A* search. Each
        <strong>synchronous move</strong> (activity matches in both trace and model) costs 0.
        A <strong>log move</strong> (activity in trace but not model) costs 1 — it signals an
        <em>unexpected activity</em>. A <strong>model move</strong> (activity in model but skipped
        in trace) also costs 1 — it signals a <em>missing activity</em>. Fitness ranges from 0
        (no alignment) to 1.0 (perfect conformance).
      </div>
    </div>
  </div>
</template>
