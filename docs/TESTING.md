# SHIELD Testing Guide

Comprehensive testing documentation for SHIELD.

## Test Status

✅ **All Tests Passing**: 27/27 tests (100% pass rate)

## Test Suites

### Unit Tests

**Framework**: Vitest 4.0.6  
**Location**: `src/**/*.test.ts`, `electron/**/*.test.ts`

#### Chat Components (`src/components/chat/chat.test.ts`)

- ✅ ChatLayout renders correctly
- ✅ ChatPlaceholder displays when no messages

#### Application Tests (`src/App.test.ts`)

- ✅ App component renders without crashing
- ✅ Theme system initializes correctly

#### MCP Service Tests (`electron/services/MCPService.test.ts`)

- ✅ Path validation for allowed directories (Documents, Desktop)
- ✅ Path normalization (handles relative paths, ../, etc.)
- ✅ Security restrictions (blocks system paths)
- ✅ MCP server lifecycle management
- ✅ Tool execution with permission system
- ✅ Error handling for invalid paths
- ✅ Audit logging integration
- ✅ Configuration management

#### Audit Log Tests (`electron/services/AuditLogTypes.test.ts`)

- ✅ Log entry creation and validation
- ✅ Permission status tracking (allowed, denied, error)
- ✅ Timestamp generation
- ✅ Metadata preservation
- ✅ Query filtering and search
- ✅ Log rotation and cleanup
- ✅ Export functionality
- ✅ Privacy-safe logging (no sensitive data exposure)

**Run Tests**:

```bash
npm test              # Run all tests in watch mode
npm run test:ui       # Run tests with UI
npm run test:coverage # Generate coverage report
```

---

## Manual Testing

### MCP Integration Testing

**Test Scenarios**:

1. **Read File Operation**
   - User: "Read my test.txt file from Documents"
   - Expected: Permission dialog → User approves → File content shown
   - Verify: Audit log entry created

2. **Write File Operation**
   - User: "Create a new file called notes.txt in Documents with content: Hello World"
   - Expected: Permission dialog → User approves → File created
   - Verify: File exists, audit log entry created

3. **List Directory**
   - User: "List all files in my Documents folder"
   - Expected: Permission dialog → User approves → File list returned
   - Verify: Accurate file listing

4. **Search Files**
   - User: "Search for .txt files in Documents"
   - Expected: Permission dialog → User approves → Matching files found
   - Verify: Search results accurate

5. **Security Restrictions**
   - User: "Read C:/Windows/System32/config"
   - Expected: Blocked with error message (no permission dialog)
   - Verify: Audit log shows denial

**Test Report Template**:

```markdown
## MCP Manual Test Report

Date: [DATE]
Tester: [NAME]
SHIELD Version: [VERSION]

### Test Results

| Test Case      | Status | Notes |
| -------------- | ------ | ----- |
| Read File      | ✅/❌  |       |
| Write File     | ✅/❌  |       |
| List Directory | ✅/❌  |       |
| Search Files   | ✅/❌  |       |
| Security Block | ✅/❌  |       |

### Issues Found

- [List any issues]

### Additional Notes

- [Any observations]
```

---

### Web Search Testing

**Test Scenarios**:

1. **Basic Search**
   - User: "What's the weather in New York?" (enable web search)
   - Expected: DuckDuckGo search → Results extracted → LLM responds with context
   - Verify: Response includes recent/relevant information

2. **Privacy Validation**
   - Monitor network traffic during search
   - Expected: No requests to tracking domains
   - Verify: DNT header present, no cookies sent

3. **Cache System**
   - Search same query twice
   - Expected: Second search uses cache (faster)
   - Verify: Cache hit logged

4. **Content Extraction**
   - User: "Summarize this article: [URL]"
   - Expected: Content extracted with Readability → LLM summarizes
   - Verify: Clean text extraction, no ads/navigation

---

### Performance Testing

**Metrics to Monitor**:

1. **Startup Time**
   - Fresh launch → Main window visible
   - Target: < 3 seconds

2. **Model Loading**
   - Select model → Model ready
   - Target: < 10 seconds (7B model)

3. **First Token Latency**
   - Send message → First token appears
   - Target: < 2 seconds

4. **Tokens Per Second**
   - Measure streaming speed
   - Target: > 10 tokens/sec (CPU), > 50 tokens/sec (GPU)

5. **Memory Usage**
   - Monitor during long conversations
   - Target: Stable (no memory leaks)

**Tools**:

- Windows Task Manager for memory/CPU
- Chrome DevTools for renderer performance
- Electron DevTools for IPC timing

---

## CI/CD Pipeline

**GitHub Actions**: `.github/workflows/test.yml`

**Automated Checks**:

- ✅ Lint (ESLint) - zero errors/warnings
- ✅ Type checking (TypeScript)
- ✅ Test suite execution (Vitest)
- ✅ Build verification (Vite + Electron)
- ✅ Code formatting (Prettier)

**Merge Requirements**:

- All CI checks must pass ✅
- No failing tests
- No lint errors
- Successful build

**Pre-commit Checklist**:

```bash
npm run format    # Format code with Prettier
npm run lint      # Check for lint errors
npm test          # Run test suite
npm run build     # Verify build succeeds
```

---

## Test Development Guidelines

### Writing New Tests

1. **Location**: Place tests next to the code they test
   - `src/components/Foo.tsx` → `src/components/Foo.test.ts`

2. **Naming**: Use descriptive test names

   ```typescript
   describe("FeatureName", () => {
     it("should do something specific", () => {
       // test
     });
   });
   ```

3. **Coverage**: Aim for >80% code coverage on new features

4. **Mocking**: Mock external dependencies (filesystem, IPC, network)

5. **Cleanup**: Clean up after tests (restore mocks, clear state)

### Test Best Practices

- ✅ Test behavior, not implementation
- ✅ Use meaningful assertions
- ✅ Keep tests independent (no shared state)
- ✅ Test edge cases and error conditions
- ✅ Mock external services
- ❌ Don't test framework code
- ❌ Don't test third-party libraries

---

## Debugging Tests

**Run Single Test File**:

```bash
npm test src/components/chat/chat.test.ts
```

**Debug Mode**:

```bash
npm test -- --inspect-brk
```

**Vitest UI** (interactive test explorer):

```bash
npm run test:ui
```

**Coverage Report**:

```bash
npm run test:coverage
open coverage/index.html
```

---

## Known Issues

### Windows-Specific

- ✅ **Fixed**: Dev server crash with taskkill error
  - Solution: `vite.patch.cjs` suppresses expected errors

### Platform Compatibility

- Tests run on Windows (primary development platform)
- Linux/macOS compatibility not yet verified
- CI/CD currently Windows-only

---

## Reporting Test Failures

If you encounter test failures:

1. **Check Environment**:
   - Node.js version (v18+)
   - Clean install: `rm -rf node_modules && npm install`

2. **Gather Information**:
   - Error message and stack trace
   - Test command used
   - Operating system and version
   - Node.js version

3. **Create Issue**:
   - Use GitHub issue template
   - Include reproduction steps
   - Attach test output

4. **Contribute Fix**:
   - Fork repository
   - Create branch: `fix/test-failure-description`
   - Submit PR with fix and updated tests

---

## Future Testing Plans

- **E2E Tests**: Playwright integration for full user workflows
- **Visual Regression**: Screenshot comparison testing
- **Load Testing**: High-volume message handling
- **Security Testing**: Penetration testing for MCP and file operations
- **Cross-Platform**: Linux and macOS test coverage

See `ROADMAP.md` for detailed testing roadmap.
