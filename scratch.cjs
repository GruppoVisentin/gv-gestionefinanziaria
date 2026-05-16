const puppeteer = require('puppeteer');
(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
        page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });
        await page.goto('http://localhost:3000');
        await new Promise(r => setTimeout(r, 2000));
        console.log("clicking");
        // Click on Cash Flow in sidebar or buttons. Assuming there's a button with text 'Cash Flow' or similar.
        const elements = await page.$x("//button[contains(., 'Cash Flow') or contains(., 'Timeline')]");
        if (elements.length > 0) {
            await elements[0].click();
        } else {
            console.log("Button not found. Trying anything with cash");
            await page.evaluate(() => {
                const els = Array.from(document.querySelectorAll('button, a'));
                const target = els.find(e => e.textContent.includes('Cash Flow') || e.textContent.includes('Timeline'));
                if(target) target.click();
            });
        }
        await new Promise(r => setTimeout(r, 2000));
        await browser.close();
    } catch(e) {
        console.error(e);
    }
})();
