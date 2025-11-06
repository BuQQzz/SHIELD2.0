# SHIELD 2.0 - GitHub Copilot Instructions

## Project Overview

SHIELD 2.0 is a privacy-first, local AI chatbot for Windows with tool integration capabilities. The application enables users to interact with an AI assistant that can navigate Windows and perform tasks on their PC with explicit permission. This is an experimental project focused on local inference using llama.cpp.

## Core Development Principles

### Code Organization & Structure

- **Strict Line Limit**: No single code file should exceed 300 lines of code
- **Modular Architecture**: If a file approaches the line limit, refactor into smaller, focused modules
- **Clear Separation of Concerns**: Each module should have a single, well-defined responsibility
- **Directory Structure**: Maintain a clear, logical folder hierarchy that reflects the application architecture

### Automation & MCP Tools

- **MCP-First Approach**: Utilize Model Context Protocol (MCP) tools for automated tasks before requesting manual user intervention
- **Automated Testing**: Use available tools to run tests, check code quality, and validate changes
- **CI/CD Integration**: Leverage automation for builds, deployments, and validations wherever possible
- **GitHub Actions**:
  - Automated test runs on all pull requests
  - Lint and type-check automation
  - Build verification before merge
  - Prevent merges if any checks fail
  - Use status checks as merge gates

### Git Workflow & Branching Strategy

- **Protected Main Branch**: Never merge directly to `main` branch
- **Feature Branches**: Create dedicated feature branches for all new development
  - Naming convention: `feature/description` or `fix/description`
- **Testing Branches**: Use test branches for experimental features
- **Merge Requirements**:
  - **ALL test suites MUST pass before merging to main**
  - Run complete test suite before creating pull request
  - All lint checks must pass with zero warnings
  - Code review and validation required
  - Feature must be complete and stable
  - CI/CD pipeline must show green status
- **Branch Lifecycle**: Delete branches after successful merge to keep repository clean
- **Pre-Merge Checklist**:
  1. Run `npm test` (or equivalent) - all tests pass
  2. Run `npm run lint` - zero errors/warnings
  3. Run `npm run build` - successful build
  4. Manual testing of feature completed
  5. Documentation updated
  6. CI/CD checks passing

### UI/UX Guidelines

- **Design System**: Use shadcn/ui components for consistent, accessible UI
- **Icons**: Use Lucide React for all iconography
- **Design Philosophy**: Minimalistic, clean, and user-friendly interface
- **Accessibility**: Ensure all UI components are accessible and keyboard-navigable
- **Responsive Design**: Support various window sizes and display configurations

### Technology Stack

- **AI Engine**: llama.cpp for local LLM inference
  - Stay updated with latest llama.cpp releases
  - Monitor and integrate performance improvements
  - Follow llama.cpp best practices for model loading and inference
  - **Check web for latest llama.cpp updates before implementation**
- **Modern Language Features**:
  - Use latest stable features of TypeScript/JavaScript
  - Leverage modern Python features (3.11+)
  - Use async/await patterns for non-blocking operations
  - **Research latest language features and best practices via web search**
- **UI Framework**: React with TypeScript
  - **Verify latest React patterns and hooks from official documentation**
- **Component Library**: shadcn/ui (latest version)
  - **Check for component updates and new additions regularly**
  - **Consult shadcn/ui documentation for latest usage patterns**
- **State Management**: Use modern React patterns (hooks, context)

### Web Research Requirements

- **Always Check Latest Updates**: Before implementing features, search the web for:
  - Latest version numbers and release notes
  - Breaking changes in dependencies
  - New API patterns and best practices
  - Security advisories and patches
  - Performance optimization techniques
- **Component Research**: Verify shadcn/ui component availability and usage
- **Language Features**: Confirm latest TypeScript/JavaScript features and syntax
- **Framework Updates**: Check React, Vite, and build tool updates
- **llama.cpp Integration**: Review latest llama.cpp documentation and examples
- **Documentation Sources**: Prioritize official documentation, GitHub repos, and trusted sources

### Windows Integration

- **Native APIs**: Utilize Windows APIs for system integration
- **Permission Model**: Explicit user consent required for all system operations
- **Security First**: Implement proper sandboxing and permission checks
- **Privacy**: All data processing occurs locally, no external API calls

### Code Quality Standards

- **Type Safety**: Use TypeScript for all frontend code
- **Error Handling**: Comprehensive error handling and user feedback
- **Logging**: Structured logging for debugging and monitoring
- **Documentation**:
  - JSDoc/TSDoc comments for public APIs
  - README files for each major module
  - Inline comments for complex logic
  - Keep all documentation clean, up-to-date, and well-organized
  - Update documentation immediately when code changes
  - Remove outdated or deprecated documentation
- **Testing Requirements**:
  - **Mandatory**: Write tests for all new features
  - Unit tests for business logic (aim for >80% coverage)
  - Integration tests for system interactions
  - E2E tests for critical user flows
  - **Run complete test suite before every merge**
  - Tests must pass with zero failures
  - No skipped or disabled tests without documented reason
  - Mock external dependencies appropriately

### Performance Considerations

- **Lazy Loading**: Load components and modules on-demand
- **Memory Management**: Monitor and optimize memory usage for LLM operations
- **Async Operations**: Use non-blocking patterns for I/O and inference
- **Caching**: Cache compiled models and frequently accessed data

### Security & Privacy

- **Local-First**: All AI inference runs locally
- **Data Protection**: User data never leaves the local machine
- **Permission System**: Granular permissions for Windows operations
- **Audit Logging**: Log all system-level operations with user consent
- **Code Security**: Regular dependency updates and security scans

## Development Workflow

1. **Create Feature Branch**: `git checkout -b feature/your-feature`
2. **Develop**: Make incremental changes, keeping files under 300 lines
3. **Test During Development**: Write and run tests as you code
4. **Pre-Push Validation**:
   - Run full test suite: `npm test`
   - Run linter: `npm run lint`
   - Fix any issues before pushing
5. **Commit**: Use meaningful commit messages
6. **Push**: Push branch to remote
7. **Pre-PR Validation**:
   - **CRITICAL**: Run complete test suite one final time
   - Verify all tests pass locally
   - Check build succeeds: `npm run build`
   - Review changes for quality
8. **Pull Request**: Create PR with:
   - Clear description of changes
   - Test results confirmation
   - Screenshots/demos if applicable
9. **CI/CD Checks**: Ensure GitHub Actions pass:
   - Test suite execution
   - Lint checks
   - Build verification
   - Type checking
10. **Review**: Address feedback and ensure all checks remain green
11. **Final Verification**: Confirm all status checks pass before merge
12. **Merge**: Merge to main only after all requirements met
13. **Cleanup**: Delete feature branch

## Module Refactoring Guidelines

When a file approaches 300 lines:

1. Identify logical groupings of related functions
2. Extract to separate modules with clear interfaces
3. Use barrel exports (index.ts) for clean imports
4. Update documentation to reflect new structure
5. Ensure tests still pass after refactoring

## Naming Conventions

- **Files**: kebab-case for filenames (`user-service.ts`)
- **Components**: PascalCase for React components (`ChatInterface.tsx`)
- **Functions**: camelCase for functions and variables
- **Constants**: UPPER_SNAKE_CASE for constants
- **Types/Interfaces**: PascalCase with descriptive names

## Documentation Standards

### Keep Documentation Clean and Organized

- **Consistency**: Use consistent formatting, terminology, and structure
- **Accuracy**: Ensure all documentation reflects current implementation
- **Completeness**: Document all public APIs, configuration options, and workflows
- **Clarity**: Write clear, concise documentation for various skill levels
- **Organization**:
  - Group related documentation together
  - Use clear hierarchies and navigation
  - Maintain a docs/ folder for extensive documentation
  - Keep README files focused and scannable

### Documentation Maintenance

- **Update Immediately**: When code changes, update related documentation in the same commit
- **Remove Deprecated Content**: Delete outdated documentation promptly
- **Version Notes**: Document breaking changes and migration paths
- **Examples**: Include practical code examples that are tested and working
- **Changelog**: Maintain a CHANGELOG.md for tracking project evolution

### Types of Documentation to Maintain

1. **README.md**: Project overview, setup, and quick start
2. **Module READMEs**: Purpose and usage for each major directory
3. **API Documentation**: JSDoc/TSDoc for all public interfaces
4. **Architecture Docs**: System design and component relationships
5. **Setup Guides**: Installation and configuration instructions
6. **Contributing Guide**: How to contribute to the project
7. **Changelog**: Version history and notable changes

## Continuous Improvement

- **Regularly Update Dependencies**: Check weekly for updates
- **Monitor llama.cpp Repository**: Subscribe to releases and discussions
- **Stay Current with shadcn/ui**: Check component updates and new additions
- **Review Code Quality**: Regular refactoring sessions
- **Web Research**: Always verify latest best practices and updates
- **Gather User Feedback**: Iterate based on real usage patterns
- **Security Updates**: Priority response to security advisories

---

**Remember**: This is an experimental project. Prioritize learning, experimentation, and maintaining high code quality while building something innovative and privacy-focused. Always research the latest updates and keep documentation clean and current.
