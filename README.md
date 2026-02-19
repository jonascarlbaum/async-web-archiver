# async-web-archiver (`awa.js`)

[![CI](https://github.com/jonascarlbaum/async-web-archiver/actions/workflows/ci.yml/badge.svg)](https://github.com/jonascarlbaum/async-web-archiver/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Playwright-based offline archiver for dynamic sites (HTML/CSS/JS/assets + API replay), with link/path rewriting and archive-oriented output.

This project is intended to support archive workflows similar to the requirements often seen in Swedish public-sector preservation contexts (including Riksarkivet-oriented delivery expectations), where reproducibility and long-term usability are central.

Reference context:
- Riksarkivet guidance for websites: https://riksarkivet.se/resurser/webbplatser

## Background and archive context
The tool is designed with practical archive-ingest concerns in mind:
- Keep records usable without live network dependencies.
- Preserve content integrity and traceability in generated output.
- Reduce runtime surprises by rewriting links/paths for deterministic offline playback.
- Make capture behavior explicit and auditable (what was fetched, rewritten, and replayed).

In practice, this aligns with common expectations in state/archive environments: records should remain interpretable over time, with clear provenance and minimal reliance on third-party services that can change or disappear.

How this tool supports that direction:
- Produces offline-usable output (HTML, assets, API replay) to reduce live dependency risk.
- Rewrites links/paths for deterministic local playback across nested page depths.
- Captures and logs replayed API resources to improve traceability of rendered state.
- Prefers explicit, auditable crawl/rewrite configuration over hidden runtime behavior.

Important note:
- This tool can help align technical output with archive-oriented practices, but it does not by itself guarantee legal/regulatory compliance for any specific authority submission.

Why this matters beyond Sweden:
- National/state archives in many jurisdictions face similar preservation constraints.
- Public records often outlive the original systems that produced them.
- Offline-valid, self-contained packages improve portability between institutions and future tooling.

## Purpose
Archive modern sites so they are viewable from local files (`file://`) with minimal runtime breakage.

## Install
Prerequisites:
- Node.js 18+
- npm

Setup:
```sh
git clone <your-fork-or-repo-url>
cd playwright-archiver
npm install
```

Optional sanity check:
```sh
npm test
```

## Usage (quick start)
Minimal run:
```sh
node awa.js --start-url https://example.local/ --out-dir ./output --force
```

Typical run with replacement and practical limits:
```sh
node awa.js \
	--start-url https://example.local/ \
	--out-dir ./output \
	--replace "example.local::example.se" \
	--max-pages 5000 \
	--concurrency 3 \
	--delay-ms 200 \
	--force
```

Unlimited crawl until queue exhaustion:
```sh
node awa.js --start-url https://example.local/ --out-dir ./output --ignore-max --force
```

Notes:
- Output cleanup is destructive for `--out-dir`.
- Use `--force` in automation/CI to skip confirmation prompt.
- Open generated pages directly from `output/` with `file://`.

## Current state (implemented)
- Crawls in-scope pages from `--start-url` with configurable limits/concurrency.
- Saves HTML pages and static assets under `output/` and `output/assets/`.
- Rewrites HTML/CSS/JS URLs for offline use.
- Captures API responses (auto + `--store-api`) and injects a fetch shim (`window.__RESOURCE_DATA__`).
- Rewrites JSON URL values recursively for offline paths (page-aware depth).
- Injects runtime helpers for depth-aware path resolution:
	- `window.__AWA_PATH__` for generic site-root-relative paths.
	- `window.__AWA_ASSET__` for asset-relative paths.
- Provides run summary metrics (duration, pages/assets/apis, replacements).
- Supports replace rules (`--replace from::to`) across output HTML/CSS/JS.
- Output cleanup now defaults to full output-directory deletion with confirmation.
- `--force` skips cleanup prompt and deletes output directory immediately.

## CLI (main options)
```sh
node awa.js \
	--start-url https://example.local/ \
	--out-dir ./output \
	--max-pages 5000 \
	--concurrency 3 \
	--delay-ms 200 \
	--ajax-wait-ms 0 \
	--replace "example.local::example.se"
```

Additional relevant flags:
- `--allowed-hosts host1,host2`
- `--important-apis /api/foo,/api/bar`
- `--asset-prefixes prefix1,prefix2` (optional; default none)
- `--store-api "[type:]METHOD:URL[|headers]|/local/path.json"` (repeatable)
- `--force`

## Deprecation candidates
- `--important-apis` is a deprecation candidate.
	- Reason: auto API capture + API-chain idle waiting now cover most of its original use case.
	- Proposed replacement: `--extra-api-roots` (additive API root prefixes) instead of endpoint-specific wait hints.
	- Motivation: keep config generic per project and avoid hardcoding project-specific paths.
- `--store-api` is **not** removed yet.
	- Current position: legacy/manual fallback for forced capture and deterministic overrides.
	- Future direction: keep only if real use cases remain after `--extra-api-roots` and auto-capture improvements.

## What has been verified as working well
High confidence (repeatedly validated with tests and real crawls):
- HTML rewrite for asset and page links, including encoded query strings.
- Page-vs-asset classification for root and nested pages.
- JS rewrite for runtime image/path values using helper functions.
- Nested page depth handling (`./assets`, `../assets`, etc.) via injected runtime base values.
- API fetch replay keying (`method + url + optional body hash`) and fallback 404 response.
- Full output dir cleanup flow + `--force` behavior.

Validated by:
- `npm test` (all current tests pass).
- End-to-end crawl runs against the target intranet with `--max-pages 10`.

## What is tested least / lower confidence
- Very large crawl runs (thousands of pages + long session durations).
- Edge SPA flows triggered only by complex user interaction after initial load.
- Rare URL patterns embedded in minified JS beyond current heuristics.
- Workflows that depend on POST search/forms returning dynamic HTML routes.
- Non-JSON API payload replay semantics beyond current matching/response model.

## Known limitations / open gaps
- Form/search routes like `/sok.html?query=test` may not be discoverable from normal link extraction.
- If a site uses runtime-generated routes with no static references, explicit seeding is needed.
- WebSocket/SSE/service-worker-heavy apps are not fully modeled for offline replay.
- Existing test output includes a non-fatal `Assertion failed` console line in current suite; tests still exit successfully.

## External resources policy (recommended)
- Default behavior should prioritize local/offline integrity and compliance.
- External tracking/telemetry resources (for example analytics CDNs) should be blocked or stripped by default.
- Function-critical third-party resources should only be mirrored when explicitly allowed.
- Proposed flag: `--external-allowlist-hosts host1,host2` to opt in approved external hosts for download/rewrite.
- Recommendation: fail closed by default (do not auto-fetch arbitrary external hosts).

## Roadmap
Near-term:
- Add optional `--extra-paths` for pre-seeding crawl targets not discoverable via links.
- Add optional `--extra-api-roots` for additive API route discovery/capture control.
- Add optional `--external-allowlist-hosts` for controlled mirroring of function-critical third-party dependencies.
- Add optional sitemap-assisted discovery (for example reading `sitemap.xml`) to seed crawl targets in addition to normal link-following.
	- Proposed CLI: `--use-sitemap auto|always|off` (default: `auto`).
	- `auto`: try sitemap when available; continue with normal crawling if unavailable/invalid.
	- `always`: require sitemap discovery and warn/error if sitemap cannot be used.
	- `off`: disable sitemap seeding entirely.
- Add optional archive packaging mode:
	- Proposed CLI: `--archive yes|only|off` (default: `off`).
	- `off`: no archive zip output.
	- `yes`: keep normal output folder content and also create `output/async-web-archive.zip`.
	- `only`: create `output/async-web-archive.zip`, then remove generated output content while keeping the zip file.
- Optional deterministic mapping strategy for query pages, e.g. `/sok.html?query=test` -> `/sok_query-test.html`.
- Add regression tests for shim injection text correctness (escaping/syntax safety).

Mid-term:
- Improve discovery of form-driven routes and configurable query-parameter capture.
- Add targeted smoke tests for nested-depth helper behavior in generated HTML.
- Expand replay diagnostics (clearer logging for path rewrites and misses).
- Evaluate publishing as an npm package (for example `npx`/global CLI use) once CLI surface is stable.

Unknown / future investigation:
- Best generic strategy for preserving highly dynamic application state across offline sessions.
- How far to normalize/minify generated output vs. keeping source fidelity for archives.
- Packaging/release model (single-file script vs maintained npm package) based on maintainer capacity and user demand.

## Safety notes
- Cleanup is destructive for `--out-dir`.
- Without `--force`, a confirmation prompt is shown before deleting a non-empty output directory.
- In non-interactive environments, use `--force` to avoid prompt failure.

## Contributing
MIT License. PRs for fixes and focused improvements are welcome.

Maintainer note:
- This project is intended to be useful, but not single-person dependent.
- Community help with maintenance, bug triage, docs, and targeted fixes is highly appreciated.
- New maintainers may be accepted over time based on sustained, constructive contributions.
- If you want to help maintain long-term, open an issue/PR describing your interest and focus area.
