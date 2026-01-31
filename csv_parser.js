const fs = require('fs');
const csv = require('csv-parser');

function parseDate(dateStr) {
    if (!dateStr) return null;
    // MM/DD/YYYY → YYYY-MM-DD
    const [month, day, year] = dateStr.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

async function processCsv() {
    let count = 0;

    const stream = fs
        .createReadStream('Punch_Report_2025-09-15_2025-10-14r.csv')
        .pipe(csv({ skipLines: 2 }));

    for await (const row of stream) {
        const lastName = row['EMP L NAME'];
        const firstName = row['EMP F NAME'];
        const employeeId = row['EMP##'] || 'UNKNOWN';
        const date = parseDate(row['DATE']);
        const totalHours = row['TOTAL'];
        const lunchFlag = row['Lunch'];

        const timeIn = row['IN'];
        const timeOut = row['OUT'];

        const deptCode = row['DEPT CODE'] || null;
        const inLocation = row['IN LOCATION'] || null;
        const inPunchMethod = row['IN PUNCH METHOD'] || null;
        const outLocation = row['OUT LOCATION'] || null;
        const outPunchMethod = row['OUT PUNCH METHOD'] || null;

        console.log(firstName, lastName, employeeId, date, totalHours, lunchFlag, timeIn, timeOut, deptCode, inLocation, inPunchMethod, outLocation, outPunchMethod);

        count++;
    }

    console.log('Total rows processed:', count);
}

processCsv();
