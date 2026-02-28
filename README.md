# Indus HTTP Replay

Replay real HTTP API requests from raw text, curl, logs, HAR files, and `.indus.http` blocks directly inside VS Code.

[![Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=hari7261.indus-http-replay)
![Version](https://img.shields.io/badge/version-1.0.1-1f883d)
![License](https://img.shields.io/badge/license-MIT-24292f)

## Why Indus HTTP Replay

- Replay requests without switching to Postman or curl terminal loops
- Compare two environments side-by-side with semantic JSON diff
- Use one flow across source code, logs, HAR, and `.indus.http` files
- Keep traffic execution isolated in a worker process for extension safety

## Visual Workflows

### 1) Input Sources

[Open Diagram](.github/assets/workflow-input-sources.svg)

### 2) Replay Pipeline

[Open Diagram](.github/assets/workflow-replay-pipeline.svg)

### 3) Diff Analysis

[Open Diagram](.github/assets/workflow-diff-analysis.svg)

### 4) Release / Publish Workflow

[Open Diagram](.github/assets/workflow-release-publish.svg)

### 5) UML Sequence Diagram

[Open Diagram](.github/assets/uml-sequence.svg)

## Feature Set

- Multi-format request extraction:
  - raw HTTP
  - curl commands
  - log lines
  - HAR requests
  - `.indus.http` blocks with CodeLens run buttons
- Parallel replay across multiple configured targets
- Semantic JSON diff with ignore paths
- WebView inspector tabs for body, headers, raw, and diff
- Replay history panel for quick debugging loops
- Header masking for sensitive values

## Install

1. Open the VS Code Marketplace page:
   [hari7261.indus-http-replay](https://marketplace.visualstudio.com/items?itemName=hari7261.indus-http-replay)
2. Click `Install`.
3. Reload VS Code if prompted.

## Quick Start

1. Configure at least one target in `settings.json`.
2. Select any supported HTTP request text.
3. Run `Indus: Replay HTTP Request`.
4. Review target responses in the Replay panel.

Example targets:

```json
"indusHttpReplay.targets": [
  "http://localhost:8080",
  "http://localhost:8081"
]
```

## Commands

| Command | Purpose |
| --- | --- |
| `Indus: Replay HTTP Request` | Replay selected HTTP text |
| `Indus: Configure Targets` | Save replay target base URLs |
| `Indus: Open Replay History` | Open replay history panel |
| `Indus: Clear Replay History` | Clear all replay history |

## Configuration

```json
{
  "indusHttpReplay.targets": ["http://localhost:8080"],
  "indusHttpReplay.defaultHeaders": {
    "x-request-source": "indus-replay"
  },
  "indusHttpReplay.timeoutMs": 30000,
  "indusHttpReplay.followRedirects": true,
  "indusHttpReplay.ignoreDiffPaths": [
    "$.timestamp",
    "$.traceId",
    "$.meta.requestId"
  ],
  "indusHttpReplay.allowInsecureTls": false
}
```

## Usage Examples

Replay from curl:

```bash
curl -X POST http://localhost:8080/api/users \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{"name":"hari","role":"admin"}'
```

Replay from `.indus.http`:

```http
### Create user
POST /api/users
Content-Type: application/json

{"name":"hari","role":"admin"}
```

## Architecture

`VS Code commands + CodeLens -> parser/extractor -> worker pool -> target APIs -> Replay panel + diff + history`

The extension host coordinates UI and orchestration, while HTTP execution is handled by a dedicated worker process.

## Security Notes

- Sensitive headers are masked in UI output
- Replays happen only on explicit user action
- No telemetry and no cloud sync

## Development

```bash
npm install
npm run compile
npm run package
```

## Publish Checklist

1. Update version in `package.json`
2. Package with `vsce package`
3. Validate `README.md` diagram rendering on GitHub
4. Push to GitHub
5. Publish to Marketplace

## License

MIT
