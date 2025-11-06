# Contributing to SHIELD 2.0

Thank you for your interest in contributing to SHIELD 2.0! This guide will help you understand our development workflow and requirements.

## Development Process

### 1. Feature Development

- Create a feature branch: `git checkout -b feature/your-feature-name`
- Keep code files under 300 lines (refactor into modules if needed)
- Write tests for all new functionality
- Update documentation as you code

### 2. Testing Requirements

**CRITICAL**: All tests must pass before merging to main.

#### Running Tests Locally

```powershell
# Run all tests
npm test

# Run tests in watch mode during development
npm test -- --watch

# Run linter
npm run lint

# Type checking
npx tsc --noEmit

# Build verification
npm run build
```

#### Test Coverage Requirements

- Unit tests: >80% coverage for business logic
- Integration tests: All module interactions
- E2E tests: Critical user workflows
- All tests must pass with zero failures
- No skipped tests without documented reason

### 3. Pre-Merge Checklist

Before creating a pull request, verify:

- [ ] All tests pass locally (`npm test`)
- [ ] Linter shows zero errors/warnings (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] Code formatted correctly (`npm run format`)
- [ ] All files under 300 lines
- [ ] Documentation updated
- [ ] Commit messages are clear and descriptive

### 4. Pull Request Process

1. **Push your branch** to the repository
2. **Create Pull Request** with:
   - Clear description of changes
   - Reference to any related issues
   - Screenshots/demos if UI changes
   - Confirmation that all tests pass
3. **Wait for CI/CD checks**:
   - GitHub Actions will automatically run tests
   - All checks must be green before merge
4. **Address review feedback** if requested
5. **Verify final status** - all checks still passing
6. **Merge** only when everything is green

### 5. CI/CD Pipeline

Our GitHub Actions automatically run:

- ✅ Lint checks
- ✅ Type checking
- ✅ Full test suite
- ✅ Build verification
- ✅ Code quality checks (300 line limit, formatting)

**Pull requests cannot be merged if any checks fail.**

## Code Standards

### File Organization

- Maximum 300 lines per file
- Modular architecture with clear separation of concerns
- Use barrel exports (`index.ts`) for clean imports

### Testing Standards

- Write tests alongside features (not after)
- Test file naming: `*.test.ts` or `*.spec.ts`
- Mock external dependencies
- Test edge cases and error conditions

### Documentation

- Update README files when adding features
- JSDoc/TSDoc comments for public APIs
- Inline comments for complex logic
- Keep documentation current with code changes

### Technology Usage

- Use latest stable TypeScript/JavaScript features
- Follow React best practices and hooks patterns
- Utilize shadcn/ui components for UI
- Use Lucide icons exclusively

## Getting Help

- Review the [Copilot Instructions](.github/copilot-instructions.md)
- Check existing issues and discussions
- Ask questions in pull request comments

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for helping make SHIELD 2.0 better! 🛡️
