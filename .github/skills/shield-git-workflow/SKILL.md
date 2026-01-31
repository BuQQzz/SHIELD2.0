---
name: shield-git-workflow
description: Git workflow and branching strategy for SHIELD 2.0. Use this when creating branches, committing code, or preparing pull requests.
---

# SHIELD 2.0 Git Workflow

## Branch Strategy

### Protected Main Branch

- **Never** merge directly to `main`
- All changes through Pull Requests
- CI must pass before merge

### Branch Naming

```
feature/description    # New features
fix/description        # Bug fixes
refactor/description   # Code improvements
docs/description       # Documentation only
test/description       # Test additions
```

### Examples

```
feature/toast-notifications
fix/sidebar-icon-alignment
refactor/split-large-service
docs/update-readme
```

## Commit Messages

### Format

```
type: short description

[optional body]
[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code change (no feature/fix)
- `style`: Formatting only
- `docs`: Documentation
- `test`: Adding tests
- `chore`: Maintenance

### Examples

```
feat: add toast notification system

- Add sonner toast library
- Replace inline warnings with toasts
- Add success toasts for export/import
```

```
fix: correct sidebar panel icons

Use PanelLeftClose/PanelLeftOpen from Lucide
```

## Development Workflow

1. **Create Branch**

   ```bash
   git checkout -b feature/your-feature
   ```

2. **Develop** - Make incremental commits

3. **Pre-Push Validation**

   ```bash
   npm run format
   npm run lint
   npm test -- --run
   npm run build
   ```

4. **Push**

   ```bash
   git push -u origin feature/your-feature
   ```

5. **Create PR** with:
   - Clear description
   - Test results confirmation
   - Screenshots if UI changes

6. **CI Checks** - Wait for all green

7. **Merge** - Squash and merge preferred

8. **Cleanup**
   ```bash
   git checkout main
   git pull
   git branch -d feature/your-feature
   ```

## Quick Commands

```bash
# Check status
git status

# Stage all changes
git add -A

# Commit with message
git commit -m "type: description"

# Push to origin
git push

# Format before commit
npm run format && git add -A && git commit -m "style: format code"
```
