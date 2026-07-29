const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const xlsx = require('xlsx');

async function parseDocument(fileBuffer, mimeType, fileName) {
    if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
        const data = await pdfParse(fileBuffer);
        return data.text;
    } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        fileName.toLowerCase().endsWith('.docx')
    ) {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        return result.value;
    } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel' ||
        fileName.toLowerCase().endsWith('.xlsx') ||
        fileName.toLowerCase().endsWith('.xls')
    ) {
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
        let text = '';
        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            text += `--- Planilha: ${sheetName} ---\n`;
            text += xlsx.utils.sheet_to_csv(sheet);
            text += '\n';
        });
        return text;
    } else {
        // Fallback para texto plano (TXT, CSV, JSON, etc.)
        return fileBuffer.toString('utf8');
    }
}

module.exports = { parseDocument };
