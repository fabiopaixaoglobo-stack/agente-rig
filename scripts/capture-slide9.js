const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.goto('https://agenterit.com.br/apresentacao.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    // Apresentacao uses window.goToSlide or direct class manipulation
    const slides = document.querySelectorAll('.slide');
    slides.forEach(s => s.classList.remove('active'));
    const s9 = document.querySelector('[data-slide="9"]');
    if (s9) s9.classList.add('active');
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'reproducao-apresentacao-slide9.png' });
  await browser.close();
  console.log('Slide 9 screenshot captured successfully.');
})();
