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
  
  console.log('Navigating to http://localhost:3000/play/petri-net ...');
  
  // Start dev server in background using register-oxc-parser.cjs
  try {
    await page.goto('http://localhost:3000/play/petri-net', { waitUntil: 'networkidle' });
    console.log('Navigation completed.');
    
    await page.waitForTimeout(5000); // Wait 5 seconds to see if it finishes running
    
    const html = await page.content();
    console.log('Page body HTML structure (partial):');
    console.log(html.slice(0, 1000) + '\n...');
    
    // Check state of the button
    const buttonText = await page.locator('aside button').last().innerText();
    console.log(`Last button text: ${buttonText}`);
    const isDisabled = await page.locator('aside button').last().isDisabled();
    console.log(`Last button is disabled: ${isDisabled}`);
  } catch (e) {
    console.error('Navigation failed:', e);
  }
  
  await browser.close();
})();
