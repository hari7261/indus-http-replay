# GitHub Push and Repo Metadata Guide

Use these commands from the project root after validating your local changes.

## 1) Verify

```powershell
git status
```

## 2) Stage and Commit

```powershell
git add README.md package.json .github/assets .github/README_PUSH.md
git commit -m "docs: premium README with workflow/UML SVGs and metadata updates"
```

## 3) Push to GitHub

```powershell
git push origin main
```

If your branch is not `main`, replace it with your current branch name.

## 4) Set GitHub Repo Description and Topics (Tags) via CLI

```powershell
gh repo edit hari7261/indus-http-replay --description "VS Code extension to replay and compare HTTP API requests from raw text, curl, logs, HAR, and .indus.http files."
```

```powershell
gh repo edit hari7261/indus-http-replay --add-topic vscode-extension --add-topic http --add-topic api-testing --add-topic api-debugging --add-topic curl --add-topic har --add-topic json-diff --add-topic microservices
```

Optional cleanup if old topics exist:

```powershell
gh repo edit hari7261/indus-http-replay --remove-topic old-topic-name
```

## 5) Verify GitHub Metadata

```powershell
gh repo view hari7261/indus-http-replay
```

## 6) Marketplace Link

Extension page:

`https://marketplace.visualstudio.com/items?itemName=hari7261.indus-http-replay`
