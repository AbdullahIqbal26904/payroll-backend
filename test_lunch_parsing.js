/**
 * Test script to verify the lunch time CSV parsing functionality
 * Run with: node test_lunch_parsing.js
 */

const fs = require('fs');
const path = require('path');

// Copy the parsing functions from timesheetController.js
const parseDate = function(dateString) {
  if (!dateString) {
    throw new Error('Date string is empty');
  }

  const trimmed = String(dateString).trim();
  const dateMatch = trimmed.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
  const normalizedInput = dateMatch ? dateMatch[0] : trimmed;
  
  let date;
  
  try {
    // Simple parsing - just create a Date object
    date = new Date(normalizedInput);
    if (isNaN(date.getTime())) throw new Error('Invalid date');
    return date.toISOString().split('T')[0];
  } catch (e) {
    throw new Error(`Could not parse date: ${dateString}`);
  }
};

const parseHoursToDecimal = function(hoursString) {
  if (!hoursString || hoursString === '0:00') {
    return 0;
  }
  
  if (hoursString.startsWith(':')) {
    const minutes = parseInt(hoursString.substring(1), 10);
    return minutes / 60;
  }
  
  const parts = hoursString.split(':');
  if (parts.length !== 2) {
    return 0;
  }
  
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  
  return hours + (minutes / 60);
};

// Read and parse the test CSV file
const filePath = path.join(__dirname, 'test_lunch_format.csv');
const fileContent = fs.readFileSync(filePath, 'utf8');
const lines = fileContent.split('\n');

console.log('=== Testing Lunch Time CSV Format ===\n');

// Extract header info
const reportTitle = lines[0].split(',')[0].trim();
const dateRange = lines[1].split(',')[0].trim();

console.log('Report Title:', reportTitle);
console.log('Date Range:', dateRange);
console.log('\nColumn Headers:', lines[2].split(',').map(h => h.trim()).slice(0, 13));

// Parse data rows
const results = [];
const workEntries = [];
const lunchEntries = [];

for (let i = 3; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  
  const values = line.split(',');
  
  const lunchFlag = (values[7] || '').trim().toUpperCase();
  const isLunch = lunchFlag === 'L';
  
  const timeEntry = {
    lastName: values[0],
    firstName: values[1],
    employeeId: values[2],
    date: parseDate(values[3]),
    timeIn: values[4] || null,
    timeOut: values[5] || null,
    totalHours: values[6] || '0:00',
    isLunch: isLunch,
    deptCode: values[8] || null,
  };
  
  timeEntry.hoursDecimal = parseHoursToDecimal(timeEntry.totalHours);
  timeEntry.lunchHours = isLunch ? timeEntry.hoursDecimal : 0;
  
  results.push(timeEntry);
  
  if (isLunch) {
    lunchEntries.push(timeEntry);
  } else {
    workEntries.push(timeEntry);
  }
}

console.log('\n=== Parsing Results ===');
console.log(`Total entries: ${results.length}`);
console.log(`Work entries: ${workEntries.length}`);
console.log(`Lunch entries: ${lunchEntries.length}`);

console.log('\n=== Work Entries ===');
workEntries.forEach(e => {
  console.log(`  ${e.firstName} ${e.lastName} (${e.employeeId}): ${e.date} - ${e.hoursDecimal.toFixed(2)} hrs`);
});

console.log('\n=== Lunch Entries (to be deducted) ===');
lunchEntries.forEach(e => {
  console.log(`  ${e.firstName} ${e.lastName} (${e.employeeId}): ${e.date} - ${e.hoursDecimal.toFixed(2)} hrs [LUNCH]`);
});

// Group by employee
const employeeHours = {};
results.forEach(entry => {
  const key = entry.employeeId;
  if (!employeeHours[key]) {
    employeeHours[key] = {
      name: `${entry.firstName} ${entry.lastName}`,
      workHours: 0,
      lunchHours: 0
    };
  }
  
  if (entry.isLunch) {
    employeeHours[key].lunchHours += entry.hoursDecimal;
  } else {
    employeeHours[key].workHours += entry.hoursDecimal;
  }
});

console.log('\n=== Summary by Employee ===');
Object.entries(employeeHours).forEach(([id, emp]) => {
  console.log(`  ${emp.name} (${id}):`);
  console.log(`    Work Hours:  ${emp.workHours.toFixed(2)}`);
  console.log(`    Lunch Hours: ${emp.lunchHours.toFixed(2)}`);
  console.log(`    Net Payable: ${emp.workHours.toFixed(2)} hrs (lunch excluded)`);
});

console.log('\n=== Test Completed Successfully ===');
