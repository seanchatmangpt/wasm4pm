#!/usr/bin/env rust-script
//! ```cargo
//! [dependencies]
//! walkdir = "2"
//! serde = { version = "1", features = ["derive"] }
//! serde_json = "1"
//! colored = "2"
//! rayon = "1"
//! ```

use colored::Colorize;
use rayon::prelude::*;
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

// ──────────────────────────────────────────────
// Data types
// ──────────────────────────────────────────────

#[derive(Debug)]
enum Framework {
    Nuxt,
    Next,
}

#[derive(Debug)]
struct WebProject {
    root: PathBuf,
    framework: Framework,
    version: String,
    features: Vec<Feature>,
    interesting: Vec<String>, // high-value portable items
}

#[derive(Debug, Clone)]
struct Feature {
    category: &'static str,
    name: String,
    path: String,
    note: String,
}

#[derive(Deserialize, Default)]
struct PackageJson {
    name: Option<String>,
    version: Option<String>,
    #[serde(default)]
    dependencies: BTreeMap<String, Value>,
    #[serde(default, rename = "devDependencies")]
    dev_dependencies: BTreeMap<String, Value>,
    #[serde(default)]
    scripts: BTreeMap<String, Value>,
}

// ──────────────────────────────────────────────
// Detection
// ──────────────────────────────────────────────

fn detect_framework(dir: &Path) -> Option<(Framework, String)> {
    let pkg_path = dir.join("package.json");
    if !pkg_path.exists() {
        return None;
    }
    let content = fs::read_to_string(&pkg_path).ok()?;
    let pkg: PackageJson = serde_json::from_str(&content).ok()?;

    let all_deps: BTreeMap<String, Value> = pkg
        .dependencies
        .iter()
        .chain(pkg.dev_dependencies.iter())
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    if let Some(v) = all_deps.get("nuxt").or_else(|| all_deps.get("nuxt3")) {
        return Some((Framework::Nuxt, v.as_str().unwrap_or("?").to_string()));
    }
    if let Some(v) = all_deps.get("next") {
        return Some((Framework::Next, v.as_str().unwrap_or("?").to_string()));
    }

    // check config files as fallback
    if dir.join("nuxt.config.ts").exists() || dir.join("nuxt.config.js").exists() {
        return Some((Framework::Nuxt, "?".into()));
    }
    if dir.join("next.config.js").exists()
        || dir.join("next.config.ts").exists()
        || dir.join("next.config.mjs").exists()
    {
        return Some((Framework::Next, "?".into()));
    }

    None
}

fn read_pkg(dir: &Path) -> PackageJson {
    let p = dir.join("package.json");
    if let Ok(s) = fs::read_to_string(&p) {
        serde_json::from_str(&s).unwrap_or_default()
    } else {
        PackageJson::default()
    }
}

// ──────────────────────────────────────────────
// Feature extraction
// ──────────────────────────────────────────────

fn extract_features(dir: &Path, fw: &Framework) -> Vec<Feature> {
    let mut features: Vec<Feature> = Vec::new();

    let app_root = if dir.join("app").is_dir() {
        dir.join("app") // Nuxt 4 layout
    } else {
        dir.to_path_buf()
    };

    // Pages
    for pages_dir in &[app_root.join("pages"), dir.join("pages"), dir.join("src/pages")] {
        if pages_dir.exists() {
            collect_files(pages_dir, "Page", &mut features, |p| {
                categorize_page(p, fw)
            });
        }
    }

    // Components
    for comp_dir in &[
        app_root.join("components"),
        dir.join("components"),
        dir.join("src/components"),
    ] {
        if comp_dir.exists() {
            collect_files(comp_dir, "Component", &mut features, |p| {
                categorize_component(p)
            });
        }
    }

    // Composables / hooks
    for hook_dir in &[
        app_root.join("composables"),
        dir.join("composables"),
        dir.join("hooks"),
        dir.join("src/hooks"),
        dir.join("lib/hooks"),
    ] {
        if hook_dir.exists() {
            collect_files(hook_dir, "Composable/Hook", &mut features, |p| {
                ("Composable/Hook".into(), p.to_string_lossy().to_string(), "".into())
            });
        }
    }

    // API routes
    for api_dir in &[
        dir.join("server/api"),
        dir.join("app/api"),
        dir.join("pages/api"),
        dir.join("src/pages/api"),
    ] {
        if api_dir.exists() {
            collect_files(api_dir, "API Route", &mut features, |p| {
                ("API Route".into(), p.to_string_lossy().to_string(), categorize_api(p))
            });
        }
    }

    // Content / MDX
    for content_dir in &[dir.join("content"), dir.join("docs"), dir.join("src/content")] {
        if content_dir.exists() {
            let md_count = count_extensions(content_dir, &[".md", ".mdx", ".mdc"]);
            if md_count > 0 {
                features.push(Feature {
                    category: "Content",
                    name: format!("{} markdown files", md_count),
                    path: content_dir.to_string_lossy().to_string(),
                    note: "MDC/MDX content — potentially portable".into(),
                });
            }
        }
    }

    // Middleware
    for mw_dir in &[app_root.join("middleware"), dir.join("middleware")] {
        if mw_dir.exists() {
            collect_files(mw_dir, "Middleware", &mut features, |p| {
                ("Middleware".into(), p.to_string_lossy().to_string(), "".into())
            });
        }
    }

    // Server routes (Nitro)
    let server_routes = dir.join("server/routes");
    if server_routes.exists() {
        collect_files(&server_routes, "Server Route", &mut features, |p| {
            ("Server Route".into(), p.to_string_lossy().to_string(), "".into())
        });
    }

    // Interesting deps
    let pkg = read_pkg(dir);
    let notable_deps = [
        ("@nuxt/content", "Nuxt Content MDC"),
        ("@nuxt/ui", "Nuxt UI components"),
        ("@nuxtjs/tailwindcss", "Tailwind CSS integration"),
        ("framer-motion", "Animation library"),
        ("@radix-ui/react-", "Radix UI primitives"),
        ("shadcn", "shadcn/ui components"),
        ("three", "Three.js 3D"),
        ("d3", "D3 data viz"),
        ("recharts", "Recharts"),
        ("chart.js", "Chart.js"),
        ("monaco-editor", "Monaco editor"),
        ("@codemirror", "CodeMirror editor"),
        ("xterm", "Terminal emulator"),
        ("@upstash", "Upstash Redis/queue"),
        ("drizzle-orm", "Drizzle ORM"),
        ("prisma", "Prisma ORM"),
        ("lucia", "Lucia auth"),
        ("better-auth", "Better Auth"),
        ("@tanstack", "TanStack ecosystem"),
        ("motion", "Motion One animation"),
        ("lottie", "Lottie animations"),
        ("@tiptap", "Tiptap rich text"),
        ("prosemirror", "ProseMirror"),
        ("@xyflow", "React/Svelte flow diagrams"),
        ("reactflow", "React Flow diagrams"),
        ("cytoscape", "Cytoscape graph"),
        ("elkjs", "ELK graph layout"),
        ("vega", "Vega/Vega-Lite viz"),
        ("plotly", "Plotly charts"),
        ("leaflet", "Leaflet maps"),
        ("mapbox", "Mapbox GL"),
    ];

    let all_deps: Vec<String> = pkg
        .dependencies
        .keys()
        .chain(pkg.dev_dependencies.keys())
        .cloned()
        .collect();

    for (dep_prefix, label) in &notable_deps {
        if all_deps.iter().any(|d| d.starts_with(dep_prefix)) {
            features.push(Feature {
                category: "Dep",
                name: (*label).into(),
                path: format!("{} ({})", dep_prefix, dir.to_string_lossy()),
                note: "Notable dependency — check for portability".into(),
            });
        }
    }

    features
}

fn collect_files<F>(dir: &Path, cat: &'static str, out: &mut Vec<Feature>, f: F)
where
    F: Fn(&Path) -> (String, String, String),
{
    for entry in WalkDir::new(dir)
        .max_depth(4)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            let n = e.file_name().to_string_lossy();
            n.ends_with(".vue")
                || n.ends_with(".tsx")
                || n.ends_with(".jsx")
                || n.ends_with(".ts")
                || n.ends_with(".js")
        })
    {
        let (name, path, note) = f(entry.path());
        out.push(Feature { category: cat, name, path, note });
    }
}

fn categorize_page(p: &Path, _fw: &Framework) -> (String, String, String) {
    let name = p.file_stem().unwrap_or_default().to_string_lossy().to_string();
    let note = if name.starts_with('[') || name.starts_with("...") {
        "dynamic route".into()
    } else if name == "index" {
        "index/root route".into()
    } else {
        "".into()
    };
    (name, p.to_string_lossy().to_string(), note)
}

fn categorize_component(p: &Path) -> (String, String, String) {
    let name = p.file_stem().unwrap_or_default().to_string_lossy().to_string();
    let note = infer_component_category(&name);
    (name, p.to_string_lossy().to_string(), note)
}

fn infer_component_category(name: &str) -> String {
    let lc = name.to_lowercase();
    if lc.contains("chart") || lc.contains("graph") || lc.contains("viz") || lc.contains("plot") {
        return "📊 data visualization".into();
    }
    if lc.contains("editor") || lc.contains("monaco") || lc.contains("codemirror") {
        return "🖊 code editor".into();
    }
    if lc.contains("auth") || lc.contains("login") || lc.contains("signup") {
        return "🔐 auth".into();
    }
    if lc.contains("upload") || lc.contains("dropzone") || lc.contains("filepicker") {
        return "📁 file handling".into();
    }
    if lc.contains("terminal") || lc.contains("console") || lc.contains("shell") {
        return "💻 terminal/console".into();
    }
    if lc.contains("timeline") || lc.contains("gantt") || lc.contains("calendar") {
        return "📅 timeline/calendar".into();
    }
    if lc.contains("table") || lc.contains("grid") || lc.contains("datagrid") {
        return "📋 data table/grid".into();
    }
    if lc.contains("modal") || lc.contains("dialog") || lc.contains("drawer") {
        return "🪟 overlay".into();
    }
    if lc.contains("search") || lc.contains("filter") || lc.contains("facet") {
        return "🔍 search/filter".into();
    }
    if lc.contains("map") || lc.contains("geo") || lc.contains("location") {
        return "🗺 map".into();
    }
    if lc.contains("flow") || lc.contains("diagram") || lc.contains("node") || lc.contains("edge") {
        return "🔀 flow/diagram".into();
    }
    if lc.contains("animation") || lc.contains("lottie") || lc.contains("framer") {
        return "✨ animation".into();
    }
    "".into()
}

fn categorize_api(p: &Path) -> String {
    let name = p.file_stem().unwrap_or_default().to_string_lossy().to_lowercase();
    if name.contains("auth") || name.contains("login") || name.contains("session") {
        return "🔐 auth endpoint".into();
    }
    if name.contains("upload") || name.contains("file") || name.contains("asset") {
        return "📁 file upload".into();
    }
    if name.contains("search") || name.contains("query") {
        return "🔍 search".into();
    }
    if name.contains("stream") || name.contains("sse") || name.contains("ws") {
        return "📡 streaming".into();
    }
    if name.contains("webhook") {
        return "🪝 webhook".into();
    }
    "".into()
}

fn count_extensions(dir: &Path, exts: &[&str]) -> usize {
    WalkDir::new(dir)
        .max_depth(6)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name().to_string_lossy();
            exts.iter().any(|ext| name.ends_with(ext))
        })
        .count()
}

// ──────────────────────────────────────────────
// Interesting = high-value features for porting
// ──────────────────────────────────────────────

fn score_interesting(features: &[Feature]) -> Vec<String> {
    let mut out = Vec::new();
    for f in features {
        let note = if !f.note.is_empty() {
            format!(" ({})", f.note)
        } else {
            "".into()
        };

        let high_value = f.note.contains("viz")
            || f.note.contains("chart")
            || f.note.contains("graph")
            || f.note.contains("flow")
            || f.note.contains("diagram")
            || f.note.contains("editor")
            || f.note.contains("terminal")
            || f.note.contains("upload")
            || f.note.contains("stream")
            || f.category == "Content"
            || f.category == "Dep";

        if high_value {
            out.push(format!("[{}] {}{}", f.category, f.name, note));
        }
    }
    out
}

// ──────────────────────────────────────────────
// Discovery — walk from home, skip heavy dirs
// ──────────────────────────────────────────────

const SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    ".pnpm",
    "target",
    ".cache",
    ".nuxt",
    ".next",
    "dist",
    "build",
    ".output",
    "__pycache__",
    ".DS_Store",
    "Library",
    "Applications",
    ".Trash",
    "go",
    ".rustup",
    ".cargo",
    ".volta",
    ".nvm",
    ".pyenv",
    ".rbenv",
    "vendor",
    ".gem",
];

fn find_projects(root: &Path) -> Vec<PathBuf> {
    let mut projects: Vec<PathBuf> = Vec::new();
    let mut seen: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

    for entry in WalkDir::new(root)
        .max_depth(8)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            let is_skip = SKIP_DIRS.iter().any(|s| *s == name.as_ref());
            let is_hidden = name.starts_with('.') && name != ".";
            !is_skip && !(is_hidden && e.depth() > 1)
        })
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let fname = entry.file_name().to_string_lossy();
        if fname == "nuxt.config.ts"
            || fname == "nuxt.config.js"
            || fname == "next.config.js"
            || fname == "next.config.ts"
            || fname == "next.config.mjs"
        {
            if let Some(parent) = entry.path().parent() {
                let canon = parent.to_path_buf();
                if seen.insert(canon.clone()) {
                    projects.push(canon);
                }
            }
        }
    }

    projects
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

fn main() {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/sac".into());
    let root = PathBuf::from(&home);

    println!(
        "{}\n{}\n",
        "wasm4pm playground — web project scanner".bold().cyan(),
        format!("Searching {} for Nuxt/Next projects…", root.display()).dimmed()
    );

    let project_paths = find_projects(&root);
    println!(
        "{} projects found. Extracting features…\n",
        project_paths.len().to_string().bold()
    );

    // Process in parallel
    let mut projects: Vec<WebProject> = project_paths
        .par_iter()
        .filter_map(|dir| {
            let (fw, version) = detect_framework(dir)?;
            let features = extract_features(dir, &fw);
            let interesting = score_interesting(&features);
            Some(WebProject {
                root: dir.clone(),
                framework: fw,
                version,
                features,
                interesting,
            })
        })
        .collect();

    // Sort: most interesting first
    projects.sort_by(|a, b| b.interesting.len().cmp(&a.interesting.len()));

    // ── Print summary table ──────────────────
    println!("{}", "═".repeat(80).dimmed());
    println!(
        "{:<6} {:<12} {:<10} {:<8} {:<6}  {}",
        "#".bold(),
        "Framework".bold(),
        "Version".bold(),
        "Features".bold(),
        "Score".bold(),
        "Path".bold()
    );
    println!("{}", "─".repeat(80).dimmed());

    for (i, p) in projects.iter().enumerate() {
        let fw_str = match p.framework {
            Framework::Nuxt => "Nuxt".green(),
            Framework::Next => "Next.js".blue(),
        };
        let score_color = if p.interesting.len() >= 5 {
            p.interesting.len().to_string().yellow().bold()
        } else {
            p.interesting.len().to_string().normal()
        };
        println!(
            "{:<6} {:<12} {:<10} {:<8} {:<6}  {}",
            i + 1,
            fw_str,
            p.version,
            p.features.len(),
            score_color,
            p.root.display()
        );
    }
    println!("{}", "═".repeat(80).dimmed());

    // ── Detailed output per project ──────────
    println!("\n{}", "DETAILED FINDINGS".bold().cyan());
    println!("{}", "─".repeat(80).dimmed());

    for (i, p) in projects.iter().enumerate() {
        let fw_label = match p.framework {
            Framework::Nuxt => format!("Nuxt {}", p.version).green().bold(),
            Framework::Next => format!("Next.js {}", p.version).blue().bold(),
        };
        println!(
            "\n{} {}  {}",
            format!("[{}]", i + 1).dimmed(),
            fw_label,
            p.root.display().to_string().underline()
        );

        if p.interesting.is_empty() {
            println!("  {}", "No high-value features detected.".dimmed());
            continue;
        }

        // Group by category
        let mut by_cat: BTreeMap<&str, Vec<&Feature>> = BTreeMap::new();
        for f in &p.features {
            by_cat.entry(f.category).or_default().push(f);
        }

        // Show high-value items first
        println!("  {} high-value features:", p.interesting.len().to_string().yellow().bold());
        for item in &p.interesting {
            println!("    {} {}", "▸".yellow(), item);
        }

        // Show category breakdown
        println!("  {} breakdown:", "Feature".dimmed());
        for (cat, items) in &by_cat {
            if *cat != "Dep" {
                println!("    {}: {}", cat.dimmed(), items.len());
            }
        }

        // Show all components with categories
        let notable_components: Vec<&Feature> = p
            .features
            .iter()
            .filter(|f| f.category == "Component" && !f.note.is_empty())
            .collect();

        if !notable_components.is_empty() {
            println!("  {} categorized components:", "Notable".cyan());
            for c in notable_components.iter().take(20) {
                println!("    {} {}  {}", "·".dimmed(), c.name, c.note.dimmed());
            }
        }

        // Notable API routes
        let notable_apis: Vec<&Feature> = p
            .features
            .iter()
            .filter(|f| f.category == "API Route" && !f.note.is_empty())
            .collect();
        if !notable_apis.is_empty() {
            println!("  {} API routes:", "Notable".cyan());
            for a in &notable_apis {
                println!("    {} {} {}", "·".dimmed(), a.name, a.note.dimmed());
            }
        }

        // Content stats
        let content_feats: Vec<&Feature> =
            p.features.iter().filter(|f| f.category == "Content").collect();
        if !content_feats.is_empty() {
            for c in &content_feats {
                println!(
                    "  {} {} at {}",
                    "Content:".cyan(),
                    c.name,
                    c.path.dimmed()
                );
            }
        }
    }

    // ── Port recommendations ─────────────────
    println!("\n{}", "═".repeat(80).dimmed());
    println!("{}", "PORT RECOMMENDATIONS FOR wasm4pm PLAYGROUND".bold().cyan());
    println!("{}", "─".repeat(80).dimmed());

    // Collect all interesting across all projects, dedup by category
    let mut port_recs: BTreeMap<String, Vec<(String, String)>> = BTreeMap::new();
    for p in &projects {
        for item in &p.interesting {
            let parts: Vec<&str> = item.splitn(2, ']').collect();
            if parts.len() == 2 {
                let cat = parts[0].trim_start_matches('[').trim().to_string();
                let detail = parts[1].trim().to_string();
                port_recs
                    .entry(cat)
                    .or_default()
                    .push((detail, p.root.to_string_lossy().to_string()));
            }
        }
    }

    for (cat, items) in &port_recs {
        println!("\n  {}", cat.bold());
        let mut seen_names = std::collections::HashSet::new();
        for (detail, src) in items {
            let short_detail = detail.split('(').next().unwrap_or(detail).trim();
            if seen_names.insert(short_detail.to_lowercase()) {
                println!("    {} {}", "→".green(), detail);
                println!("      {}", format!("from: {}", src).dimmed());
            }
        }
    }

    println!("\n{}", "─".repeat(80).dimmed());
    println!(
        "Done. {} projects scanned, {} port candidates identified.",
        projects.len().to_string().bold(),
        port_recs.values().map(|v| v.len()).sum::<usize>().to_string().yellow().bold()
    );
}
