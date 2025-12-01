# Build Resources

This folder contains resources used by electron-builder for creating the Windows installer.

## Required Files

- `icon.ico` - Windows application icon (256x256 recommended, must include 16x16, 32x32, 48x48, 256x256 sizes)
- `icon.png` - PNG version for other uses (512x512 recommended)

## Creating Icons

### Using an online converter:
1. Create your logo as a high-resolution PNG (512x512 or larger)
2. Use a service like https://icoconvert.com/ or https://convertico.com/
3. Generate ICO with multiple sizes: 16, 32, 48, 128, 256

### Using ImageMagick (if installed):
```powershell
magick convert icon.png -define icon:auto-resize=256,128,48,32,16 icon.ico
```

## Placeholder

Until you have a proper icon, the build will use Electron's default icon.
