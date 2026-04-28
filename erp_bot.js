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
    await page.type('#email', process.env.ERP_USERNAME);
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
            return {
                nomorDokumen: cols[0]?.innerText.trim(),
                sku: cols[1]?.innerText.trim(),
                qty: cols[2]?.innerText.trim()
            };
        });
    });

    console.log('Data didapat, mengirim ke GAS...');
    // Mengirim data ke URL doPost Google Apps Script
    await axios.post(process.env.GAS_URL, { data: scrapedData });
    console.log('Berhasil dikirim!');

  } catch (error) {
    console.error('Bot Error:', error);
  } finally {
    await browser.close();
  }
}

runBot();
