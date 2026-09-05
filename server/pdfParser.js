const { PDFParse } = require('pdf-parse');
const { findModelData } = require('./scraper');

/**
 * Normalizes Arabic text that may have spaced out letters or tabs
 */
function cleanArabicText(str) {
  if (!str) return '';
  return str.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Parse an invoice PDF buffer or file
 */
async function parseSupplierInvoice(dataBuffer) {
  const parser = new PDFParse({ data: dataBuffer });
  const doc = await parser.getText();
  
  let fullText = '';
  if (Array.isArray(doc.pages)) {
    fullText = doc.pages.map(p => p.text).join('\n');
  } else if (typeof doc.text === 'string') {
    fullText = doc.text;
  } else {
    fullText = String(doc);
  }

  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);

  let invoiceNumber = '9100';
  let supplierName = 'ومضة العراق - الوكيل الحصري لهوكو';
  let invoiceDate = new Date().toISOString().split('T')[0];
  let totalAmount = 0;
  
  const extractedProducts = [];

  // Match header info
  for (const line of lines) {
    if (line.includes('رقم') || line.includes('الفاتورة')) {
      const match = line.match(/\d{3,6}/);
      if (match) invoiceNumber = match[0];
    }
    if (line.includes('2026') || line.includes('2025') || line.includes('2024')) {
      const match = line.match(/(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/);
      if (match) invoiceDate = match[1];
    }
    if (line.includes('المجموع') && line.includes(',')) {
      const match = line.match(/([\d,]+(?:\.\d+)?)/);
      if (match) {
        const num = parseFloat(match[1].replace(/,/g, ''));
        if (num > totalAmount) totalAmount = num;
      }
    }
  }

  // Parse item lines
  // Format typically: Total_Price \t Unit_Price \t Qty \t Name_and_Model -Index
  // e.g., "12,000.000 \t2,400.000 \t5 \tM114 TC ه و ك و  س م ا ع ة  -1"
  // or "5,250.000 \t1,050.000 \t5 \tX96 - 25CM ه و ك و  ك يب ل -17"

  for (const line of lines) {
    // Check if line contains row index at the end like "-1", "-17", "-30"
    const indexMatch = line.match(/-(\d{1,3})$/);
    if (!indexMatch) continue;

    const itemIndex = parseInt(indexMatch[1], 10);

    // Split line by tabs or multiple spaces
    const parts = line.split(/\t+/).map(p => p.trim()).filter(Boolean);

    let totalCost = 0;
    let unitCost = 0;
    let quantity = 1;
    let rawItemPart = '';

    if (parts.length >= 4) {
      // First part: total amount e.g. "12,000.000"
      totalCost = parseFloat(parts[0].replace(/,/g, '')) || 0;
      // Second part: unit price e.g. "2,400.000"
      unitCost = parseFloat(parts[1].replace(/,/g, '')) || 0;
      // Third part: quantity e.g. "5"
      quantity = parseInt(parts[2].replace(/,/g, ''), 10) || 1;
      // Fourth part+: description and index e.g. "M114 TC ه و ك و  س م ا ع ة  -1"
      rawItemPart = parts.slice(3).join(' ');
    } else {
      // Fallback regex match
      const numMatches = line.match(/([\d,]+(?:\.\d+)?)/g);
      if (numMatches && numMatches.length >= 3) {
        totalCost = parseFloat(numMatches[0].replace(/,/g, '')) || 0;
        unitCost = parseFloat(numMatches[1].replace(/,/g, '')) || 0;
        quantity = parseInt(numMatches[2].replace(/,/g, ''), 10) || 1;
        rawItemPart = line.replace(numMatches[0], '').replace(numMatches[1], '').replace(numMatches[2], '');
      }
    }

    // Clean up rawItemPart (remove the trailing -index)
    rawItemPart = rawItemPart.replace(/-?\s*\d{1,3}\s*$/, '').trim();

    // Extract Model code (English alphanumeric e.g. M114 TC, EQ33, CS27B, HB1A, X96 - 25CM, etc.)
    let modelCode = '';
    const modelMatches = rawItemPart.match(/([A-Za-z0-9]+(?:\s*[\-\/]\s*[A-Za-z0-9]+)*(?:\s*(?:TC|IP|PD|TWS|4IN1|25CM|8G))?)/i);
    if (modelMatches) {
      modelCode = modelMatches[1].trim();
    } else if (rawItemPart.includes('دايموند') || rawItemPart.includes('د ا ي م و ن د')) {
      modelCode = 'لاصق جام دايموند';
    } else if (rawItemPart.includes('ماركة') || rawItemPart.includes('م ا ر ك ة')) {
      modelCode = 'لاصق جام ماركة';
    }

    // Lookup enrichments from catalog
    const enrichment = findModelData(modelCode, rawItemPart);

    // Calculate suggested selling prices
    // Example: Retail (+30% to +40% or rounded to neat Iraqi Dinar increments)
    const retailMultiplier = unitCost < 2000 ? 1.5 : (unitCost < 10000 ? 1.35 : 1.25);
    let suggestedRetail = Math.ceil((unitCost * retailMultiplier) / 250) * 250;
    let suggestedWholesale = Math.ceil((unitCost * 1.15) / 250) * 250;

    // Minimum profit sanity check
    if (suggestedRetail <= unitCost) suggestedRetail = unitCost + 500;
    if (suggestedWholesale <= unitCost) suggestedWholesale = unitCost + 250;

    extractedProducts.push({
      item_index: itemIndex,
      name: enrichment.name,
      model: enrichment.model || modelCode || `MOD-${itemIndex}`,
      category: enrichment.category,
      brand: enrichment.brand,
      cost_price: unitCost,
      selling_price: suggestedRetail,
      wholesale_price: suggestedWholesale,
      global_price_usd: enrichment.global_price_usd,
      total_quantity: quantity,
      stock_quantity: quantity,
      sold_quantity: 0,
      total_cost: totalCost,
      image_url: enrichment.image_url,
      barcode: `INV${invoiceNumber}-ITM${itemIndex}`
    });
  }

  // Sort by item index
  extractedProducts.sort((a, b) => a.item_index - b.item_index);

  return {
    invoiceNumber,
    supplierName,
    invoiceDate,
    totalItems: extractedProducts.length,
    totalAmount: totalAmount || extractedProducts.reduce((sum, p) => sum + p.total_cost, 0),
    products: extractedProducts
  };
}

module.exports = {
  parseSupplierInvoice
};
