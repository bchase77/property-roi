import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  let version = 'dev';

  // 1. Vercel sets these automatically on every deployment
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const deployedAt = process.env.VERCEL_GIT_COMMIT_AUTHORED_AT; // epoch seconds
  if (sha) {
    const short = sha.slice(0, 7);
    const date = deployedAt
      ? new Date(Number(deployedAt) * 1000).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })
      : '';
    version = date ? `${short} ${date}` : short;
    return Response.json({ version, timestamp: new Date().toISOString() });
  }

  // 2. Local dev — run git directly
  try {
    const { stdout: hash } = await execAsync('git rev-parse --short HEAD');
    const { stdout: date } = await execAsync('git log -1 --format=%cd --date=format:"%m/%d/%y"');
    version = `${hash.trim()} ${date.trim()} (local)`;
  } catch {
    version = 'dev';
  }

  return Response.json({ version, timestamp: new Date().toISOString() });
}