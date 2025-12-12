import { BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getSplashLogoPath(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    return path.join(process.cwd(), "public", "shield-logo.png");
  }

  return path.join(__dirname, "../dist/shield-logo.png");
}

/**
 * Create a lightweight splash screen window
 * Shows during app initialization before main window
 */
export function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    icon: getSplashLogoPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  // Simple HTML splash screen with SHIELD branding
  // Uses dark gradient matching app's monochromatic theme
  // NOTE: Do NOT use file:// URLs for images - they cause crashes with data: protocol

  const splashHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            overflow: hidden;
          }
          
          .splash-container {
            text-align: center;
            color: white;
            padding: 40px;
          }
          
          .logo {
            font-size: 48px;
            font-weight: 700;
            margin-bottom: 16px;
            letter-spacing: 2px;
            text-shadow: 0 2px 10px rgba(255,255,255,0.1);
          }
          
          .tagline {
            font-size: 14px;
            opacity: 0.7;
            margin-bottom: 32px;
            font-weight: 400;
            color: #a0a0a0;
          }
          
          .status {
            font-size: 13px;
            opacity: 0.6;
            margin-bottom: 16px;
            min-height: 20px;
            color: #d0d0d0;
          }
          
          .loader {
            width: 200px;
            height: 3px;
            background: rgba(255,255,255,0.1);
            border-radius: 3px;
            margin: 0 auto;
            overflow: hidden;
          }
          
          .loader-bar {
            height: 100%;
            background: white;
            border-radius: 3px;
            animation: loading 1.5s ease-in-out infinite;
            box-shadow: 0 0 10px rgba(255,255,255,0.3);
          }
          
          @keyframes loading {
            0% {
              width: 0%;
              margin-left: 0%;
            }
            50% {
              width: 50%;
              margin-left: 25%;
            }
            100% {
              width: 0%;
              margin-left: 100%;
            }
          }
        </style>
      </head>
      <body>
        <div class="splash-container">
          <div class="logo">🛡️ SHIELD</div>
          <div class="tagline">Privacy-First AI Assistant</div>
          <div class="status" id="status">Initializing...</div>
          <div class="loader">
            <div class="loader-bar"></div>
          </div>
        </div>
      </body>
    </html>
  `;

  splash.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`
  );

  splash.once("ready-to-show", () => {
    splash.show();
  });

  return splash;
}

/**
 * Update splash screen status message
 */
export function updateSplashStatus(
  splash: BrowserWindow | null,
  message: string
): void {
  if (splash && !splash.isDestroyed()) {
    void splash.webContents.executeJavaScript(
      `(() => { const el = document.getElementById('status'); if (el) el.textContent = ${JSON.stringify(
        message
      )}; })();`
    );
  }
}

/**
 * Close splash window
 * The main window will be shown automatically by its ready-to-show event
 */
export function closeSplash(
  splash: BrowserWindow | null,
  _mainWindow: BrowserWindow
): void {
  if (splash && !splash.isDestroyed()) {
    // Just close the splash - main window will show via its own ready-to-show event
    setTimeout(() => {
      if (splash && !splash.isDestroyed()) {
        splash.close();
      }
    }, 200);
  }
}
