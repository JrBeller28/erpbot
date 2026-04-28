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
    
    // 1. MENUJU HALAMAN LOGIN DULU
    await page.goto('https://erp.tangki.id/webui/index.zul', { waitUntil: 'networkidle2' });
    
    // 2. PROSES LOGIN
    // PENTING: Ganti selector di bawah ini jika di web ERP Anda id-nya bukan #email atau #password
    await page.type('#username', process.env.ERP_USERNAME);
    await page.type('#password', process.env.ERP_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('Login berhasil!');

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
