import * as fs from 'fs';
import * as path from 'path';

// Create the preload subdirectory
const preloadDir = path.join(__dirname, '..', 'electron', 'preload');

if (!fs.existsSync(preloadDir)) {
  fs.mkdirSync(preloadDir, { recursive: true });
  console.log(`✅ Created directory: ${preloadDir}`);
} else {
  console.log(`📁 Directory already exists: ${preloadDir}`);
}
