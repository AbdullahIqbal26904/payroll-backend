const helpers = require('../utils/helpers');

// Test the working days calculation function
console.log('Testing calculateWorkingDays function:');

// Test case 1: Mon-Fri (5 working days)
const startDate1 = '2025-09-22'; // Monday
const endDate1 = '2025-09-26';   // Friday
console.log(`Working days from ${startDate1} to ${endDate1}: ${helpers.calculateWorkingDays(startDate1, endDate1)}`);
// Expected: 5

// Test case 2: Spans weekend (7 working days)
const startDate2 = '2025-09-22'; // Monday
const endDate2 = '2025-09-30';   // Tuesday (next week)
console.log(`Working days from ${startDate2} to ${endDate2}: ${helpers.calculateWorkingDays(startDate2, endDate2)}`);
// Expected: 7

// Test case 3: Weekend only (0 working days)
const startDate3 = '2025-09-20'; // Saturday
const endDate3 = '2025-09-21';   // Sunday
console.log(`Working days from ${startDate3} to ${endDate3}: ${helpers.calculateWorkingDays(startDate3, endDate3)}`);
// Expected: 0

// Test the vacation hours calculation function
console.log('\nTesting calculateVacationHours function:');

// Test case 1: 5 working days with standard 8-hour days
console.log(`Vacation hours from ${startDate1} to ${endDate1}: ${helpers.calculateVacationHours(startDate1, endDate1)}`);
// Expected: 40 (5 days × 8 hours)

// Test case 2: 5 working days with custom daily hours (6)
console.log(`Vacation hours from ${startDate1} to ${endDate1} (6 hours/day): ${helpers.calculateVacationHours(startDate1, endDate1, 6)}`);
// Expected: 30 (5 days × 6 hours)

console.log('\nTest complete. Check the output to verify calculations.');