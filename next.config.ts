import type { NextConfig } from "next";
import { execSync } from "child_process";

// Get git commit timestamp at build time
const getGitTimestamp = () => {
  try {
    const timestamp = execSync('git log -1 --format="%ad" --date=format:"%Y%m%d%H%M"', { encoding: 'utf8' }).trim();
    return timestamp;
  } catch (error) {
    console.warn('Could not get git timestamp:', error);
    // Fallback to current time if git is not available
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    return `${year}${month}${day}${hour}${minute}`;
  }
};

// Get git commit hash at build time
const getGitHash = () => {
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    return hash;
  } catch (error) {
    console.warn('Could not get git hash:', error);
    return 'unknown';
  }
};

const nextConfig: NextConfig = {
  env: {
    BUILD_TIMESTAMP: getGitTimestamp(),
    GIT_HASH: getGitHash(),
  },
  eslint: {
    // Allow warnings but fail on errors during build
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
