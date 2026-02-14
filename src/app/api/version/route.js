import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

export async function GET() {
  try {
    let version = 'v0.1.0';
    let gitHash = 'unknown';
    let gitDate = '';
    
    // Try to get git information
    try {
      // Get current git commit hash (short)
      const { stdout: hashOutput } = await execAsync('git rev-parse --short HEAD');
      gitHash = hashOutput.trim();
      
      // Get commit date
      const { stdout: dateOutput } = await execAsync('git log -1 --format=%cd --date=format:"%m/%d/%Y %H:%M"');
      gitDate = dateOutput.trim();
      
      version = `${gitHash} ${gitDate}`;
    } catch (gitError) {
      // Fallback: try to get version from package.json
      try {
        const packageJsonPath = path.join(process.cwd(), 'package.json');
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        version = `v${packageJson.version} (dev)`;
      } catch (packageError) {
        // Ultimate fallback
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit', 
          year: 'numeric'
        });
        const timeStr = now.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit'
        });
        
        version = `v0.1.0 ${dateStr} ${timeStr}`;
      }
    }
    
    return Response.json({ 
      version,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error getting version info:', error);
    
    // Fallback response
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit', 
      year: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
    
    return Response.json({ 
      version: `v0.1.0 ${dateStr} ${timeStr}`,
      timestamp: new Date().toISOString()
    });
  }
}