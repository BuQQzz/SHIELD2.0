# Building SHIELD 2.0 for Windows

This guide covers building SHIELD 2.0 as a distributable Windows application.

## Overview

SHIELD 2.0 uses [electron-builder](https://www.electron.build/) to create Windows installers and portable executables. The build process:

1. Compiles TypeScript to JavaScript
2. Bundles the Electron app with Vite
3. Packages everything into distributable formats
4. Signs and configures auto-update support

## Build Output Formats

| Format | Description | Use Case |
|--------|-------------|----------|
| **NSIS Installer** | Traditional Windows installer (.exe) | Standard installation with Start Menu shortcuts |
| **Portable** | Single .exe file, no installation | Run from USB or without admin rights |

## Prerequisites

- Windows 10/11
- Node.js 18+
- npm 9+
- ~2GB free disk space for build output

## Build Commands

```powershell
# Build NSIS installer (recommended)
npm run build:win:installer

# Build portable executable
npm run build:win:portable

# Build all Windows formats
npm run build:win

# Build unpacked directory (for testing)
npm run build:dir
```

## Build Output

Built files are placed in the `release/{version}/` directory:

```
release/
└── 0.1.0/
    ├── SHIELD 2.0-0.1.0-x64.exe        # NSIS installer (~310 MB)
    ├── SHIELD 2.0-0.1.0-portable.exe   # Portable version
    └── win-unpacked/                    # Unpacked app directory
```

## Configuration

Build configuration is in `electron-builder.yml`:

```yaml
appId: com.cavira.shield2
productName: "SHIELD 2.0"
directories:
  output: release/${version}
win:
  target:
    - nsis
    - portable
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

### Key Configuration Options

| Option | Value | Description |
|--------|-------|-------------|
| `appId` | `com.cavira.shield2` | Unique application identifier |
| `productName` | `SHIELD 2.0` | Display name in Windows |
| `oneClick` | `false` | Shows installation wizard |
| `perMachine` | `true` | Installs for all users |

## Auto-Updates

The app includes automatic update support via GitHub Releases:

1. **Check for updates**: App checks GitHub Releases on startup
2. **Download**: Updates download in background
3. **Install**: User prompted to restart when ready

### Publishing Updates

1. Update version in `package.json`
2. Build the installer: `npm run build:win:installer`
3. Create a GitHub Release with the version tag (e.g., `v0.2.0`)
4. Upload the installer and `latest.yml` file to the release

### Auto-Update Configuration

```yaml
# electron-builder.yml
publish:
  provider: github
  owner: BuQQzz
  repo: SHIELD2.0
```

## Icons

Custom icons are stored in the `build/` directory:

- `build/icon.ico` - Windows application icon
- `build/icon.png` - Fallback PNG icon

To change icons:
1. Replace files in `build/`
2. Rebuild the application

## Model Distribution

**Important**: Models are NOT bundled with the installer.

Users download models through the in-app model manager after installation. This keeps the installer size manageable (~310 MB vs 4+ GB with models).

### Why No Bundled Models?

- **Size**: Models are 4-10+ GB each
- **Choice**: Users can choose their preferred model
- **Updates**: Models can be updated independently
- **Bandwidth**: Users only download what they need

## Troubleshooting

### Build Fails with "Cannot find module"

Ensure all dependencies are installed:
```powershell
npm ci
```

### App Shows White Screen After Install

Check that production paths are correct in `electron/setup/windowSetup.ts`. The packaged app uses:
```typescript
path.join(__dirname, "../dist/index.html")
```

### Auto-Update Not Working

1. Verify GitHub publish settings in `electron-builder.yml`
2. Check that releases are public (not draft)
3. Ensure version numbers follow semver

### Large Installer Size

The installer includes:
- Electron runtime (~150 MB)
- Node.js native modules
- Web search dependencies (Playwright, jsdom)
- Application code

This is normal for Electron apps with full-featured capabilities.

## Development vs Production

| Feature | Development | Production |
|---------|-------------|------------|
| DevTools | Auto-opens | Disabled |
| Hot Reload | Enabled | Disabled |
| Source Maps | Included | Excluded |
| Updates | Manual | Auto-check |

## Security Considerations

- **Code Signing**: Not currently enabled (shows Windows SmartScreen warning)
- **asar**: App code is archived (not extracted) for security
- **Permissions**: MCP tools require explicit user confirmation

### Future: Code Signing

To eliminate SmartScreen warnings, obtain a Windows code signing certificate and configure:

```yaml
# electron-builder.yml
win:
  sign: true
  certificateFile: ./certificate.pfx
  certificatePassword: ${CERT_PASSWORD}
```

## CI/CD Integration

For automated builds in GitHub Actions:

```yaml
- name: Build Windows Installer
  run: npm run build:win:installer
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Related Documentation

- [Quick Start](./QUICK-START.md) - Running in development mode
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues
- [Roadmap](./ROADMAP.md) - Feature development plans
