const puppeteer = require('puppeteer');
const axios = require('axios');
require('dotenv').config();

async function runBot() {
  const browser = await puppeteer.launch({ 
  headless: "new",
  ignoreHTTPSErrors: true, // <--- TAMBAHKAN BARIS INI
  args: [
    '--no-sandbox', 
    '--disable-setuid-sandbox',
    '--ignore-certificate-errors', // <--- TAMBAHKAN INI JUGA DI ARGS
    '--ignore-certificate-errors-spki-list'
  ] 
});
  const page = await browser.newPage();
try {
    console.log('Login ke erp.tangki.id...');
    await page.goto('https://erp.tangki.id/webui/index.zul', { waitUntil: 'networkidle2' });

  await page.screenshot({ path: 'debug_login.png' });
console.log('Screenshot disimpan untuk debug.');
// 1. Tunggu input muncul
await page.waitForSelector('input', { visible: true });
const inputs = await page.$$('input');

// 2. Isi data
await inputs[0].type(process.env.ERP_USERNAME, { delay: 100 });
await inputs[1].type(process.env.ERP_PASSWORD, { delay: 100 });

// 3. Cari dan Klik tombol Login dengan selector yang pasti
// Kita definisikan selectornya di scope atas (Node.js)
const loginButtonSelector = '.z-button'; 

await page.waitForSelector(loginButtonSelector);

// Gunakan Promise.all untuk menangani navigasi setelah klik
await Promise.all([
    page.click(loginButtonSelector),
    page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => null)
]);

console.log('Login berhasil diklik!');
}
// Cara mencari tombol berdasarkan teks tanpa bikin ReferenceError
const loginBtnHandle = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll('button, .z-button'));
    return buttons.find(b => b.innerText.includes('Login') || b.innerText.includes('Masuk'));
});

if (loginBtnHandle) {
    await loginBtnHandle.click();
} else {
    console.log("Tombol login tidak ditemukan!");
}
    
    // Gunakan Promise.all untuk menunggu navigasi SETELAH klik
    await Promise.all([
        page.click(loginBtn),
        page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => null) 
    ]);

    console.log('Login berhasil!');
    // ... (sisa kode scraping)

    // 3. MENUJU HALAMAN DOKUMEN SPESIFIK
    const docNumber = process.env.DOC_NUMBER; // Mengambil nomor "MM/1001699/..."
    const targetUrl = `https://erp.tangki.co.id/inventory-move/${encodeURIComponent(docNumber)}`;
    console.log(`Menuju halaman dokumen: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    // 4. PROSES SCRAPING
    const scrapedData = await page.evaluate((docNumber) => {
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        return rows.map(row => {
            const cols = row.querySelectorAll('td');
            return {
                nomorDokumen: docNumber, 
                sku: cols[0]?.innerText.trim(),     // Sesuaikan dengan urutan kolom
                barang: cols[1]?.innerText.trim(),  // Sesuaikan dengan urutan kolom
                qty: cols[2]?.innerText.trim(),     // Sesuaikan dengan urutan kolom
                locator: cols[3]?.innerText.trim()  // Sesuaikan dengan urutan kolom
            };
        });
    }, docNumber); // Memasukkan variabel docNumber ke dalam fungsi browser

    console.log('Data didapat, mengirim ke GAS...', scrapedData);
    
    // 5. MENGIRIM DATA KE GOOGLE APPS SCRIPT
    await axios.post(process.env.GAS_URL, { 
        action: "BOT_CALLBACK",
        data: scrapedData 
    });
    console.log('Berhasil dikirim!');

  } catch (error) {
    console.error('Bot Error:', error);
  } finally {
    await browser.close();
  }
}

runBot();
