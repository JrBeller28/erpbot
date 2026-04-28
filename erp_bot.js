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

    // ... (setelah mengetik nomor dokumen)
console.log('Nomor dokumen diketik, menekan Enter...');

// Tekan Enter untuk memicu pencarian (lebih stabil di iDempiere daripada klik tombol)
await page.keyboard.press('Enter');

// Beri jeda sedikit
await new Promise(r => setTimeout(r, 2000));

// Klik tombol OK/Ceklis sebagai cadangan
const confirmBtn = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll('.z-button'));
    return buttons.find(b => b.querySelector('.z-button-image') || b.innerText.includes('OK'));
});

if (confirmBtn && confirmBtn.asElement()) {
    await confirmBtn.asElement().click();
    console.log('Tombol konfirmasi diklik manual...');
}

// Tunggu loading iDempiere (penting!)
console.log('Menunggu render tabel detail...');
await new Promise(r => setTimeout(r, 10000)); 

// Gunakan selector yang lebih umum jika .z-listitem gagal
await page.waitForSelector('.z-listitem, .z-row, .z-listcell', { timeout: 20000 });

    if (confirmBtn && confirmBtn.asElement()) {
        await confirmBtn.asElement().click();
        console.log('Tombol cari diklik, menunggu tabel muncul...');
    }

    // Jeda agar iDempiere merender tabel hasil pencarian
    await new Promise(r => setTimeout(r, 10000));

} catch (err) {
    console.log("Gagal di proses lookup, mencoba scraping langsung...");
}

// 4. PROSES SCRAPING
try {
    console.log('Menunggu tabel Move Line muncul...');
    await page.waitForSelector('.z-listitem', { timeout: 20000 });
    await new Promise(r => setTimeout(r, 3000)); // Jeda 3 detik agar render sempurna

    const scrapedData = await page.evaluate((doc) => {
        const rows = Array.from(document.querySelectorAll('.z-listitem'));
        
        return rows.map(row => {
            const cols = Array.from(row.querySelectorAll('.z-listcell-content'));
            
            // iDempiere Map (Berdasarkan screenshot Anda):
            // Index 1: Quantity
            // Index 5: Search Key (SKU)
            // Index 6: Product Name
            
            const rawSku = cols[5]?.innerText.trim();
            const rawBarang = cols[6]?.innerText.trim();
            const rawQty = cols[1]?.innerText.trim();

            // Hanya ambil jika SKU tidak kosong
            if (!rawSku || rawSku === "") return null;

            return {
                nomorDokumen: doc,
                sku: rawSku,     
                barang: rawBarang,  
                qty: rawQty,     
                locator: "PRP-PLG C1" 
            };
        }).filter(item => item !== null);
    }, docNumber);

    console.log(`Berhasil mendapatkan ${scrapedData.length} baris data.`);
    
    if (scrapedData.length > 0) {
        console.log('Mengirim ke GAS...');
        const res = await axios.post(process.env.GAS_URL, {
            action: "BOT_CALLBACK",
            data: scrapedData
        });
        console.log('Respon GAS:', res.data);
    } else {
        console.log('Tidak ada data yang valid untuk dikirim. Cek index kolom atau render tabel.');
    }

} catch (err) {
    console.error('Bot Error saat scraping:', err.message);
}
        // Simpan screenshot saat error untuk analisa
        await page.screenshot({ path: 'error_debug.png' });
        console.log('Screenshot error disimpan di error_debug.png');
    } finally {
        await browser.close();
        console.log('Browser ditutup.');
    }
}

runBot();
