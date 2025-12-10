import { BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  // Simple HTML splash screen with SHIELD branding
  // Uses dark gradient matching app's monochromatic theme
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
          <img src="file://${path.join(__dirname, "../../public/shield-logo.png").replace(/\\/g, "/")}" alt="SHIELD Logo" style="width: 80px; height: 80px; margin-bottom: 16px; object-fit: contain;" />
          <div class="logo">SHIELD 2.0</div>
          <div class="tagline">Privacy-First AI Assistant</div>
          <div class="status" id="status">Initializing...</div>
          <div class="loader">
            <div class="loader-bar"></div>
          </div>
        </div>
        
        <script>
          const { ipcRenderer } = require('electron');
          
          // Listen for status updates from main process
          ipcRenderer.on('splash:status', (_, message) => {
            document.getElementById('status').textContent = message;
          });
        </script>
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
    splash.webContents.send("splash:status", message);
  }
}

/**
 * Close splash and show main window with smooth transition
 */
export function closeSplash(
  splash: BrowserWindow | null,
  mainWindow: BrowserWindow
): void {
  if (splash && !splash.isDestroyed()) {
    // Show main window
    mainWindow.show();

    // Small delay then close splash for smooth transition
    setTimeout(() => {
      if (!splash.isDestroyed()) {
        splash.close();
      }
    }, 200);
  } else {
    // If splash already closed, just show main window
    mainWindow.show();
  }
}
