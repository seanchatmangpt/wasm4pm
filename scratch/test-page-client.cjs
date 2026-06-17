const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE ${msg.type()}]:`, msg.text());
  });
  
  page.on('pageerror', err => {
    console.error('[BROWSER EXCEPTION]:', err.message, err.stack);
  });
  
  console.log('Navigating to http://localhost:3000/play ...');
  try {
    await page.goto('http://localhost:3000/play', { waitUntil: 'networkidle' });
    console.log('Navigation completed.');
    
    const html = await page.content();
    console.log('Page body HTML structure:');
    console.log(html.slice(0, 2000) + '\n...');
    
    const hasCode = await page.locator('code').count();
    console.log(`Number of <code> elements: ${hasCode}`);
  } catch (e) {
    console.error('Navigation failed:', e);
  }
  
  await browser.close();
})();
