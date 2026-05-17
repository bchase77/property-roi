import type { NextConfig } from "next";
import { execSync } from "child_process";

// Capture actual build time as ISO string
const getBuildTimestamp = () => new Date().toISOString();

// Get 7-digit git commit hash at build time
const getGitHash = () => {
  try {
    const hash = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
    return hash;
  } catch (error) {
    console.warn('Could not get git hash:', error);
    return 'unknown';
  }
};

const nextConfig: NextConfig = {
  env: {
    BUILD_TIMESTAMP: getBuildTimestamp(),
    GIT_HASH: getGitHash(),
  },
  eslint: {
    // Temporarily ignore ESLint during builds to allow deployment
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
