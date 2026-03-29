import { chromium } from 'playwright';
import path from 'path';

export async function executeCommands(commands) {
  // NEW: Use a persistent context to SAVE logins and session data
  const userDataDir = path.resolve('./user_data');
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  
  console.log(`[Executor] Launching persistent context at: ${userDataDir}`);
  
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: chromePath,
    headless: false,
    viewport: { width: 1280, height: 800 },
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  const logs = [];

  try {
    for (const cmd of commands) {
      const logMsg = `Executing: ${cmd.action} on ${cmd.selector || cmd.url || cmd.text || ''}`;
      console.log(`[Executor] ${logMsg}`);
      logs.push(logMsg);
      
      switch (cmd.action) {
        case 'navigate':
          await page.goto(cmd.url, { waitUntil: 'load', timeout: 30000 });
          break;
        case 'click':
          await page.click(cmd.selector, { timeout: 15000 });
          break;
        case 'type':
          await page.fill(cmd.selector, cmd.text, { timeout: 15000 });
          break;
        case 'press':
          await page.press(cmd.selector, cmd.key);
          break;
        case 'wait':
          await page.waitForTimeout(cmd.time || 2000);
          break;
        case 'screenshot':
          const shotPath = `screenshot-${Date.now()}.png`;
          await page.screenshot({ path: shotPath });
          logs.push(`Screenshot saved: ${shotPath}`);
          break;
        default:
          logs.push(`Unknown action: ${cmd.action}`);
      }
    }
  } catch (error) {
    console.error('[Executor] Logic error:', error);
    logs.push(`Error: ${error.message}`);
  } finally {
    console.log('[Executor] Mission complete. Context kept alive for session persistence.');
    logs.push('Automation finished. Your session is saved for next time!');
    // We DON'T close the context immediately if we want to be "solid" and keep sessions.
    // However, for single runs, we might wait a bit.
    await page.waitForTimeout(10000);
  }

  return logs;
}
