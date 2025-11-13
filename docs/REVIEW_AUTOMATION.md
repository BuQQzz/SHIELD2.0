# 🤖 Automated Review System

SHIELD 2.0 uses automated workflows to streamline PR and issue reviews, ensuring consistent code quality and faster feedback loops.

## 📋 Table of Contents

- [PR Review Automation](#pr-review-automation)
- [Issue Triage Automation](#issue-triage-automation)
- [How It Works](#how-it-works)
- [Customization](#customization)

---

## 🔍 PR Review Automation

### What It Does

**Automated Checks on Every PR:**
1. ✅ Requests GitHub Copilot code review automatically
2. 📊 Posts PR stats and review checklist as a comment
3. ⚠️ Detects and warns about:
   - Missing tests for new components
   - Large PRs (>500 additions)
   - Files exceeding 300-line limit
   - Missing documentation
4. 🎯 Provides actionable tips for improvement

### Workflow File

`.github/workflows/pr-review.yml`

### Example Output

When you open a PR, you'll see an automated comment like:

```markdown
## 🤖 Automated PR Review

**PR Stats:**
- 📁 Files changed: 6
- ➕ Additions: 127
- ➖ Deletions: 49
- ✅ Tests included: Yes

## 📋 Review Checklist

Please ensure the following before merging:

**Code Quality:**
- [ ] All CI/CD checks passing (tests, lint, build)
- [ ] Code follows project guidelines
- [ ] No files exceed 300 lines
- [ ] Prettier formatting applied
- [ ] ESLint checks pass with 0 warnings

[... full checklist ...]
```

### Integration with CI/CD

Works alongside existing CI/CD pipeline (`.github/workflows/ci.yml`):
- **CI/CD**: Runs tests, lint, type check, build
- **PR Review**: Adds intelligent analysis and guidance

---

## 🏷️ Issue Triage Automation

### What It Does

**Automated Actions on Every Issue:**
1. 🏷️ Auto-labels issues based on content:
   - **Priority**: `high`, `medium`, `low`
   - **Type**: `bug`, `enhancement`, `documentation`, `question`
   - **Area**: `ui`, `llm`, `mcp`, `electron`, `web-search`, `testing`
   - **Special**: `good first issue`, `help wanted`
2. 💬 Posts welcome comment with relevant guidance
3. 🤖 Detects Copilot assignment requests

### Workflow File

`.github/workflows/issue-triage.yml`

### Auto-Labeling Logic

**Keywords Detected:**

| Label | Trigger Keywords |
|-------|------------------|
| `priority: high` | critical, urgent, security |
| `priority: medium` | enhancement, feature request |
| `priority: low` | nice to have, suggestion |
| `type: bug` | bug, error, crash, broken |
| `type: enhancement` | feature, enhancement, new |
| `type: documentation` | docs, documentation |
| `type: question` | question, how to |
| `area: ui` | ui, interface, component |
| `area: llm` | llm, model, inference |
| `area: mcp` | mcp, tool |
| `area: electron` | electron, main process |
| `area: web-search` | web search, brave |
| `area: testing` | test, testing |

### Example Welcome Comment

```markdown
## 👋 Thank you for opening this issue!

This issue has been automatically triaged and labeled.

**Labels applied:** `type: bug`, `area: ui`, `priority: high`

**Bug Report Checklist:**
- [ ] Steps to reproduce provided
- [ ] Expected vs actual behavior described
- [ ] Version/environment details included
- [ ] Error logs/screenshots attached (if applicable)

[... guidance ...]
```

### Copilot Assignment

If an issue mentions `@copilot` or includes `[copilot]` in the title:
- Workflow detects the request
- Posts guidance on Copilot assignment
- Maintainer can manually assign via GitHub Copilot for PRs

---

## ⚙️ How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Event                            │
│              (PR opened/Issue created)                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              GitHub Actions Workflow                        │
│                                                             │
│  ┌──────────────────┐  ┌─────────────────┐               │
│  │  Event Analysis  │──│  Apply Labels   │               │
│  └──────────────────┘  └─────────────────┘               │
│                                │                            │
│                                ▼                            │
│                    ┌──────────────────────┐                │
│                    │  Post Smart Comment  │                │
│                    └──────────────────────┘                │
│                                │                            │
│                                ▼                            │
│                    ┌──────────────────────┐                │
│                    │ Request Copilot (PR) │                │
│                    └──────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Enhanced PR/Issue with:                        │
│  • Automated labels                                        │
│  • Review checklist                                        │
│  • Actionable warnings                                     │
│  • Copilot review requested                                │
└─────────────────────────────────────────────────────────────┘
```

### Permissions Required

Both workflows require these GitHub Actions permissions:
```yaml
permissions:
  contents: read
  pull-requests: write  # For PR comments
  issues: write         # For issue labels/comments
```

### Triggers

**PR Review Automation:**
```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches: [main]
```

**Issue Triage Automation:**
```yaml
on:
  issues:
    types: [opened, edited]
```

---

## 🎨 Customization

### Adjusting Thresholds

**Large PR Warning** (currently 500 additions):
```yaml
# In .github/workflows/pr-review.yml
if (additions > 500) {  # Change this number
  warnings.push('⚠️ **Large PR detected**');
}
```

**File Size Limit** (currently 300 lines):
```yaml
# In .github/workflows/pr-review.yml (size-check job)
if ($lines -gt 300) {  # Change this number
  $violations += "..."
}
```

### Adding New Labels

**For Issues:**

Edit `.github/workflows/issue-triage.yml` in the "Analyze Issue" step:

```javascript
// Add new label logic
if (text.includes('your-keyword')) {
  labels.push('your-label');
}
```

**For PRs:**

Edit `.github/workflows/pr-review.yml` in the "Get PR Details" step to detect new patterns.

### Customizing Comments

**PR Checklist:**
Edit the `comment` template in `.github/workflows/pr-review.yml` (Post Review Checklist step).

**Issue Welcome Message:**
Edit the `comment` template in `.github/workflows/issue-triage.yml` (Post Welcome Comment step).

### Disabling Features

**Don't want Copilot auto-review?**
Comment out this step in `pr-review.yml`:
```yaml
# - name: Request GitHub Copilot Review
#   if: github.event.action == 'opened'
#   ...
```

**Don't want auto-labeling?**
Comment out the "Apply Labels" step in `issue-triage.yml`.

---

## 📊 Monitoring

### Workflow Status

Check workflow runs:
1. Go to **Actions** tab in GitHub
2. Select **PR Review Automation** or **Issue Triage Automation**
3. View recent runs and logs

### Debugging

If a workflow fails:
1. Check the workflow run logs in Actions tab
2. Verify permissions are correct
3. Test the workflow locally using [act](https://github.com/nektos/act)

---

## 🔗 Related Documentation

- [Contributing Guide](CONTRIBUTING.md) - How to contribute
- [CI/CD Pipeline](.github/workflows/ci.yml) - Main testing workflow
- [Copilot Instructions](.github/copilot-instructions.md) - Development guidelines

---

## 🚀 Benefits

### For Contributors
- ✅ Instant feedback on PRs
- 📋 Clear checklist to follow
- 🎯 Actionable warnings
- 🤖 AI-powered code review

### For Maintainers
- ⏱️ Saves review time
- 🏷️ Organized issues
- 📊 Consistent standards
- 🔍 Early issue detection

### For the Project
- 📈 Higher code quality
- 🚀 Faster merge cycles
- 📚 Better documentation
- 🎓 Learning tool for contributors

---

**Questions?** Open an issue with the `type: question` label! 🙋
