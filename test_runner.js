
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
      const text = msg.text();
      console.log('BROWSER LOG:', text);
  });
  
  await page.goto('http://localhost:8769/');
  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
})();
        