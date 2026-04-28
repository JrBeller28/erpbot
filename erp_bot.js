const puppeteer = require('puppeteer');
const axios = require('axios');
require('dotenv').config();

async function runBot() {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  try {
    console.log('Login ke erp.tangki.id...');
    // KODE BARU:
    const docNumber = process.env.DOC_NUMBER; // Mengambil nomor "MM/1001699/..."
    const targetUrl = `https://erp.tangki.co.id/inventory-move/${encodeURIComponent(docNumber)}`;
    console.log(`Menuju halaman dokumen: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });
    
    // Ganti selector sesuai dengan HTML web ERP
    await page.type('input[name="username"]', process.env.ERP_USERNAME);
    await page.type('#password', process.env.ERP_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    console.log('Menuju halaman dokumen...');
    // Contoh untuk SO atau Inventory Move
    await page.goto('https://erp.tangki.co.id/inventory-move', { waitUntil: 'networkidle2' });

    // PROSES SCRAPING (Sesuaikan dengan selector tabel ERP Anda)
    const scrapedData = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        return rows.map(row => {
            const cols = row.querySelectorAll('td');
            // KODE BARU (Contoh urutan):
            return {
                nomorDokumen: docNumber, // Langsung ambil dari variabel di atas
                sku: cols[0]?.innerText.trim(),     // Sesuaikan [0] dengan urutan kolom SKU di ERP
                barang: cols[1]?.innerText.trim(),  // Sesuaikan [1] dengan urutan kolom Nama Barang
                qty: cols[2]?.innerText.trim(),     // Sesuaikan [2] dengan urutan kolom Qty
                locator: cols[3]?.innerText.trim()  // Sesuaikan [3] dengan urutan kolom Locator
            };
        });
    });

    console.log('Data didapat, mengirim ke GAS...');
    // Mengirim data ke URL doPost Google Apps Script
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
