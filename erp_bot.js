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

        // 2. Isi data login
        await inputs[0].type(process.env.ERP_USERNAME, { delay: 100 });
        await inputs[1].type(process.env.ERP_PASSWORD, { delay: 100 });
        console.log('Credentials entered...');

        // 3. Cari tombol login secara dinamis berdasarkan teks
        const loginBtnHandle = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button, .z-button, .z-button-os'));
            return buttons.find(b => {
                const txt = b.innerText.toLowerCase();
                return txt.includes('login') || txt.includes('masuk') || txt.includes('sign in');
            });
        });

        if (!loginBtnHandle) throw new Error("Tombol login tidak ditemukan di halaman!");

        // 4. Klik dan tunggu navigasi
        console.log('Mengklik tombol login...');
        await Promise.all([
            loginBtnHandle.asElement().click(),
            page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => null)
        ]);

        // Beri jeda sebentar untuk loading dashboard ZK
        await new Promise(r => setTimeout(r, 3000));

        // 5. MENUJU HALAMAN DOKUMEN SPESIFIK
        const docNumber = process.env.DOC_NUMBER;
        const targetUrl = `https://erp.tangki.id/inventory-move/${encodeURIComponent(docNumber)}`;
        console.log(`Menuju halaman dokumen: ${targetUrl}`);
        
        await page.goto(targetUrl, { waitUntil: 'networkidle2' });
        await page.waitForSelector('table', { timeout: 20000 }).catch(() => console.log("Warning: Tabel tidak muncul, mencoba scraping langsung..."));

        // 6. PROSES SCRAPING
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

        // 7. MENGIRIM DATA KE GOOGLE APPS SCRIPT
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
