/**
 * Script to check GitHub Release Download Counts for SHIELD2.0
 * 
 * Usage: node scripts/check-downloads.js
 */

const REPO_OWNER = 'BuQQzz';
const REPO_NAME = 'SHIELD2.0-releases';
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases`;

// Optional: Load token from environment variable for private repos
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function getDownloadCounts() {
  try {
    console.log(`Fetching release data for ${REPO_OWNER}/${REPO_NAME}...\n`);
    
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'SHIELD-Download-Checker'
    };

    if (GITHUB_TOKEN) {
      headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }
    
    const response = await fetch(API_URL, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Repository not found (404). \nPossible reasons:\n1. The repository is private (set GITHUB_TOKEN env var)\n2. The repository name is incorrect (currently: ${REPO_OWNER}/${REPO_NAME})`);
      }
      throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
    }

    const releases = await response.json();

    if (releases.length === 0) {
      console.log('No releases found.');
      return;
    }

    let totalDownloads = 0;

    releases.forEach(release => {
      const releaseDate = new Date(release.published_at).toLocaleDateString();
      console.log(`📦 Release: ${release.name || release.tag_name} (${releaseDate})`);
      console.log(`   Tag: ${release.tag_name}`);
      console.log(`   Status: ${release.draft ? 'Draft' : (release.prerelease ? 'Pre-release' : 'Stable')}`);
      
      if (release.assets.length === 0) {
        console.log('   No assets found.');
      } else {
        release.assets.forEach(asset => {
          console.log(`   - ${asset.name}: ${asset.download_count} downloads`);
          totalDownloads += asset.download_count;
        });
      }
      console.log('----------------------------------------');
    });

    console.log(`\n🚀 Total Downloads Across All Releases: ${totalDownloads}`);

  } catch (error) {
    console.error('Error fetching download counts:', error.message);
  }
}

getDownloadCounts();
