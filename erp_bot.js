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
        
        // 3. PROSES PENCARIAN DOKUMEN (LOOKUP)
const docNumber = process.env.DOC_NUMBER;
console.log(`Memulai pencarian dokumen: ${docNumber}`);

try {
    // Tunggu kolom "Document No" muncul
    // Di iDempiere Lookup, input ini biasanya memiliki class .z-textbox atau di dalam .z-row
    await page.waitForSelector('.z-textbox', { visible: true, timeout: 20000 });
    
    // Ketik nomor dokumen ke input pertama yang ditemukan di form lookup
    const searchInputs = await page.$$('.z-textbox');
    await searchInputs[0].type(docNumber, { delay: 100 });
    console.log('Nomor dokumen diketik...');

    // Klik tombol centang biru (OK) di pojok kanan bawah jendela lookup
    const confirmBtn = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('.z-button'))
                    .find(b => b.querySelector('.z-button-image') || b.innerText.includes('OK') || b.classList.contains('z-button-os'));
    });

    if (confirmBtn && confirmBtn.asElement()) {
        await confirmBtn.asElement().click();
        console.log('Tombol cari diklik, menunggu tabel muncul...');
    }

    // Jeda agar iDempiere merender tabel hasil pencarian
    await new Promise(r => setTimeout(r, 10000));

} catch (err) {
    console.log("Gagal di proses lookup, mencoba scraping langsung...");
}

// 4. PROSES SCRAPING (SELECTOR DIPERBARUI)
const scrapedData = await page.evaluate((doc) => {
    // iDempiere menggunakan .z-listitem untuk baris tabel
    const rows = Array.from(document.querySelectorAll('.z-listitem'));
    
    return rows.map(row => {
        // Ambil semua sel (cell) dalam baris tersebut
        const cols = Array.from(row.querySelectorAll('.z-listcell-content'));
        
        if (cols.length < 3) return null;

        return {
            nomorDokumen: doc,
            sku: cols[2]?.innerText.trim(),     // Sesuaikan index kolom berdasarkan tampilan
            barang: cols[3]?.innerText.trim(),  // Biasanya kolom 3 atau 4
            qty: cols[1]?.innerText.trim(),     // Sesuaikan index
            locator: cols[0]?.innerText.trim()  // Sesuaikan index
        };
    }).filter(item => item !== null && item.sku !== "");
}, docNumber);

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
