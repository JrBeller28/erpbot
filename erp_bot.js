const puppeteer = require('puppeteer');
const axios = require('axios');
require('dotenv').config();

async function runBot() {
    const browser = await puppeteer.launch({
        headless: "new",
        ignoreHTTPSErrors: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list'
        ]
    });

    const page = await browser.newPage();
    // Set User Agent agar tidak terdeteksi sebagai bot dasar
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        console.log('Login ke erp.tangki.id...');
        await page.goto('https://erp.tangki.id/webui/index.zul', { waitUntil: 'networkidle2', timeout: 60000 });

        // 1. Tunggu input muncul & ambil screenshot untuk debug jika perlu
        await page.waitForSelector('input', { visible: true, timeout: 30000 });
        const inputs = await page.$$('input');

        if (inputs.length < 2) throw new Error("Field input login tidak ditemukan!");

       // 1. ISI DATA
await inputs[0].type(process.env.ERP_USERNAME, { delay: 100 });
await inputs[1].type(process.env.ERP_PASSWORD, { delay: 100 });

// 2. KLIK TOMBOL OK (DAN HANYA INI)
const okBtn = await page.evaluateHandle(() => {
    return Array.from(document.querySelectorAll('.z-button'))
                .find(b => b.innerText.trim().toUpperCase() === 'OK');
});

if (okBtn && okBtn.asElement()) {
    console.log('Tombol OK ditemukan, mengklik...');
    await Promise.all([
        okBtn.asElement().click(),
        page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => null)
    ]);
}

        console.log('Berhasil melewati halaman login!');
        
        // 3. LANGSUNG LANJUT KE HALAMAN DOKUMEN
        const docNumber = process.env.DOC_NUMBER;
        const targetUrl = `https://erp.tangki.id/webui/index.zul`;
        console.log(`Menuju halaman dokumen: ${targetUrl}`);
        
        // Tambahkan timeout yang lebih lama (60 detik) dan gunakan 'domcontentloaded' agar tidak terlalu ketat
        await page.goto(targetUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 60000 
        }).catch(err => console.log("Navigasi timeout, tapi mencoba lanjut scraping..."));
        
        // Jeda manual 5-10 detik karena iDempiere sering loading internal (AJAX) setelah halaman terbuka
        console.log('Menunggu render data iDempiere...');
        await new Promise(r => setTimeout(r, 8000)); 
        
        // Pastikan salah satu elemen tabel muncul sebelum scraping
        await page.waitForSelector('.z-listitem, .z-row, td', { timeout: 15000 }).catch(() => {
            console.log("Data tabel belum muncul, mungkin dokumen tidak ditemukan atau loading sangat lambat.");
        });

        // 4. PROSES SCRAPING
        const scrapedData = await page.evaluate((doc) => {
            const rows = Array.from(document.querySelectorAll('table tbody tr, .z-listitem, .z-row'));
            return rows.map(row => {
                const cols = row.querySelectorAll('td, .z-listcell-content, .z-row-content');
                if (cols.length < 2) return null;
                return {
                    nomorDokumen: doc,
                    sku: cols[0]?.innerText.trim(),
                    barang: cols[1]?.innerText.trim(),
                    qty: cols[2]?.innerText.trim(),
                    locator: cols[3]?.innerText.trim()
                };
            }).filter(item => item !== null && item.sku !== "");
        }, docNumber);

        if (scrapedData.length === 0) {
            console.log('Data kosong, periksa selector tabel Anda.');
        } else {
            console.log(`Berhasil mendapatkan ${scrapedData.length} baris data.`);
        }

        // 5. MENGIRIM DATA KE GOOGLE APPS SCRIPT
        console.log('Mengirim ke GAS...');
        const res = await axios.post(process.env.GAS_URL, {
            action: "BOT_CALLBACK",
            data: scrapedData
        });
        
        console.log('Respon GAS:', res.data);

    } catch (error) {
        console.error('Bot Error:', error.message);
        // Simpan screenshot saat error untuk analisa
        await page.screenshot({ path: 'error_debug.png' });
        console.log('Screenshot error disimpan di error_debug.png');
    } finally {
        await browser.close();
        console.log('Browser ditutup.');
    }
}

runBot();
