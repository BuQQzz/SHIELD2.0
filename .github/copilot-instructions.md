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

### Git Workflow & Branching Strategy
- **Protected Main Branch**: Never merge directly to `main` branch
- **Feature Branches**: Create dedicated feature branches for all new development
  - Naming convention: `feature/description` or `fix/description`
- **Testing Branches**: Use test branches for experimental features
- **Merge Requirements**: 
  - All tests must pass before merging
  - Code review and validation required
  - Feature must be complete and stable
- **Branch Lifecycle**: Delete branches after successful merge to keep repository clean

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
- **Modern Language Features**: 
  - Use latest stable features of TypeScript/JavaScript
  - Leverage modern Python features (3.11+)
  - Use async/await patterns for non-blocking operations
- **UI Framework**: React with TypeScript
- **Component Library**: shadcn/ui (latest version)
- **State Management**: Use modern React patterns (hooks, context)

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
- **Testing**:
  - Unit tests for business logic
  - Integration tests for system interactions
  - E2E tests for critical user flows

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
3. **Test Locally**: Run all tests and manual validation
4. **Commit**: Use meaningful commit messages
5. **Push**: Push branch to remote
6. **Pull Request**: Create PR with description and test results
7. **Review**: Address feedback and ensure all checks pass
8. **Merge**: Merge to main after approval
9. **Cleanup**: Delete feature branch

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

## Continuous Improvement
- Regularly update dependencies
- Monitor llama.cpp repository for updates
- Stay current with shadcn/ui component updates
- Review and refactor code for maintainability
- Gather user feedback and iterate

---

**Remember**: This is an experimental project. Prioritize learning, experimentation, and maintaining high code quality while building something innovative and privacy-focused.
