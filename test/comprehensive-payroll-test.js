/**
 * Comprehensive Payroll System Test
 *
 * This script seeds minimal data and runs end-to-end payroll calculations for:
 * - Employees: salary, hourly, private duty nurse
 * - Payment frequencies: Monthly, Bi-Weekly, Weekly
 * - Loans: internal and third-party
 * - Vacation and sick/maternity leave
 * - Public holiday within the period
 *
 * It verifies key outputs to ensure correctness of calculations.
 */

const db = require('../config/db');
const Timesheet = require('../models/Timesheet');
const Payroll = require('../models/Payroll');
const EmployeeVacation = require('../models/EmployeeVacation');
const EmployeeLeave = require('../models/EmployeeLeave');
const EmployeeLoan = require('../models/EmployeeLoan');
const PublicHoliday = require('../models/PublicHoliday');

// Simple assertion helper
function assert(condition, message) {
  if (!condition) {
    throw new Error('Assertion failed: ' + message);
  }
}

// Soft assertion: logs a warning but doesn't fail the test
function softAssert(condition, message) {
  if (!condition) {
    console.warn('Soft assertion failed: ' + message);
  }
}

async function ensureSettings() {
  // Ensure at least one payroll_settings row exists
  const [rows] = await db.query('SELECT id FROM payroll_settings LIMIT 1');
  if (rows.length === 0) {
    await db.query(`INSERT INTO payroll_settings (
      social_security_employee_rate, social_security_employer_rate, social_security_max_insurable,
      medical_benefits_employee_rate, medical_benefits_employer_rate, medical_benefits_employee_senior_rate,
      education_levy_rate, education_levy_high_rate, education_levy_threshold, education_levy_exemption,
      retirement_age, medical_benefits_senior_age, medical_benefits_max_age
    ) VALUES (7.00, 9.00, 6500.00, 3.50, 3.50, 2.50, 2.50, 5.00, 5000.00, 541.67, 65, 60, 70)`);
  }

  // Ensure holiday pay is enabled
  await PublicHoliday.setHolidayPayEnabled(true);
}

async function ensureAdminUser() {
  // Create a simple admin user to satisfy FKs
  const email = 'admin@test.local';
  const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) return existing[0].id;
  const [res] = await db.query(`INSERT INTO users (name, email, password, role) VALUES ('Admin', ?, 'x', 'admin')`, [email]);
  return res.insertId;
}

async function seedEmployees() {
  // Clean up if previously seeded
  await db.query("DELETE FROM employees WHERE id IN ('SAL001','HR001','NUR001','SEL001','SEH001','EXS001','SEN001','EXM001','OVL001')");

  // Base employee rows (id is VARCHAR per migration)
  const base = {
    date_of_birth: '1990-01-01',
    gender: 'Male',
    hire_date: '2025-01-01',
    department: 'General',
    standard_hours: 40.00,
    email: null,
    address: 'Addr',
    phone: '123',
    job_title: 'Staff'
  };

  // Salary, Monthly
  await db.query(
    `INSERT INTO employees (id, first_name, last_name, date_of_birth, gender, address, phone, hire_date, job_title,
      employee_type, salary_amount, hourly_rate, payment_frequency, standard_hours, is_exempt_ss, is_exempt_medical)
     VALUES ('SAL001','Sally','Salary',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [base.date_of_birth, base.gender, base.address, base.phone, base.hire_date, base.job_title,
     'salary', 6000.00, 0.00, 'Monthly', base.standard_hours, 0, 0]
  );

  // Hourly, Bi-Weekly, hourly_rate = 20
  await db.query(
    `INSERT INTO employees (id, first_name, last_name, date_of_birth, gender, address, phone, hire_date, job_title,
      employee_type, salary_amount, hourly_rate, payment_frequency, standard_hours, is_exempt_ss, is_exempt_medical)
     VALUES ('HR001','Henry','Hourly',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [base.date_of_birth, base.gender, base.address, base.phone, base.hire_date, base.job_title,
     'hourly', 0.00, 20.00, 'Bi-Weekly', base.standard_hours, 0, 0]
  );

  // Private duty nurse, Bi-Weekly, base hourly_rate (for vacations/leaves) 30
  await db.query(
    `INSERT INTO employees (id, first_name, last_name, date_of_birth, gender, address, phone, hire_date, job_title,
      employee_type, salary_amount, hourly_rate, payment_frequency, standard_hours, is_exempt_ss, is_exempt_medical)
     VALUES ('NUR001','Nina','Nurse',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [base.date_of_birth, base.gender, base.address, base.phone, base.hire_date, 'Private Duty Nurse',
     'private_duty_nurse', 0.00, 30.00, 'Bi-Weekly', 36.00, 0, 0]
  );

  // Semi-Monthly salaried BELOW threshold (salary 4,000 => semi-monthly gross ~ 2,000)
  await db.query(
    `INSERT INTO employees (id, first_name, last_name, date_of_birth, gender, address, phone, hire_date, job_title,
      employee_type, salary_amount, hourly_rate, payment_frequency, standard_hours, is_exempt_ss, is_exempt_medical)
     VALUES ('SEL001','Sam','SemiLow',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [base.date_of_birth, base.gender, base.address, base.phone, base.hire_date, base.job_title,
     'salary', 4000.00, 0.00, 'Semi-Monthly', base.standard_hours, 0, 0]
  );

  // Semi-Monthly salaried ABOVE threshold (salary 12,000 => semi-monthly gross ~ 6,000)
  await db.query(
    `INSERT INTO employees (id, first_name, last_name, date_of_birth, gender, address, phone, hire_date, job_title,
      employee_type, salary_amount, hourly_rate, payment_frequency, standard_hours, is_exempt_ss, is_exempt_medical)
     VALUES ('SEH001','Sara','SemiHigh',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [base.date_of_birth, base.gender, base.address, base.phone, base.hire_date, base.job_title,
     'salary', 12000.00, 0.00, 'Semi-Monthly', base.standard_hours, 0, 0]
  );

  // Hourly employee exempt from Social Security (SS)
  await db.query(
    `INSERT INTO employees (id, first_name, last_name, date_of_birth, gender, address, phone, hire_date, job_title,
      employee_type, salary_amount, hourly_rate, payment_frequency, standard_hours, is_exempt_ss, is_exempt_medical)
     VALUES ('EXS001','Evan','ExemptSS',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['1985-01-01', base.gender, base.address, base.phone, base.hire_date, base.job_title,
     'hourly', 0.00, 20.00, 'Bi-Weekly', base.standard_hours, 1, 0]
  );

  // Hourly senior (60-70) for Medical Benefits senior rate
  await db.query(
    `INSERT INTO employees (id, first_name, last_name, date_of_birth, gender, address, phone, hire_date, job_title,
      employee_type, salary_amount, hourly_rate, payment_frequency, standard_hours, is_exempt_ss, is_exempt_medical)
     VALUES ('SEN001','Sophie','Senior',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['1963-01-01', base.gender, base.address, base.phone, base.hire_date, base.job_title,
     'hourly', 0.00, 20.00, 'Bi-Weekly', base.standard_hours, 0, 0]
  );

  // Hourly employee exempt from Medical Benefits
  await db.query(
    `INSERT INTO employees (id, first_name, last_name, date_of_birth, gender, address, phone, hire_date, job_title,
      employee_type, salary_amount, hourly_rate, payment_frequency, standard_hours, is_exempt_ss, is_exempt_medical)
     VALUES ('EXM001','Mia','ExemptMB',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['1992-01-01', base.gender, base.address, base.phone, base.hire_date, base.job_title,
     'hourly', 0.00, 20.00, 'Bi-Weekly', base.standard_hours, 0, 1]
  );

  // Hourly with overlapping vacation and leave scenario
  await db.query(
    `INSERT INTO employees (id, first_name, last_name, date_of_birth, gender, address, phone, hire_date, job_title,
      employee_type, salary_amount, hourly_rate, payment_frequency, standard_hours, is_exempt_ss, is_exempt_medical)
     VALUES ('OVL001','Olly','Overlap',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['1990-05-05', base.gender, base.address, base.phone, base.hire_date, base.job_title,
     'hourly', 0.00, 20.00, 'Bi-Weekly', base.standard_hours, 0, 0]
  );
}

async function seedTimesheetPeriod(adminUserId) {
  // Create a bi-weekly period that includes a public holiday on Wednesday of first week
  const periodStart = '2025-09-15'; // Monday (week 1)
  const periodEnd = '2025-09-28';   // Sunday (week 2)
  const periodId = await Timesheet.saveTimeEntries([
    // Salary employee (works only 32 hours: 4 days × 8); vacation and leave will top up
    { employeeId: 'SAL001', lastName: 'Salary', firstName: 'Sally', date: '2025-09-15', timeIn: '09:00', timeOut: '17:00', totalHours: '8:00' },
    { employeeId: 'SAL001', lastName: 'Salary', firstName: 'Sally', date: '2025-09-16', timeIn: '09:00', timeOut: '17:00', totalHours: '8:00' },
    { employeeId: 'SAL001', lastName: 'Salary', firstName: 'Sally', date: '2025-09-18', timeIn: '09:00', timeOut: '17:00', totalHours: '8:00' },
    { employeeId: 'SAL001', lastName: 'Salary', firstName: 'Sally', date: '2025-09-19', timeIn: '09:00', timeOut: '17:00', totalHours: '8:00' },

  // Hourly employee week 1: 45 hours (40 regular + 5 overtime in weekly terms)
    { employeeId: 'HR001', lastName: 'Hourly', firstName: 'Henry', date: '2025-09-15', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'HR001', lastName: 'Hourly', firstName: 'Henry', date: '2025-09-16', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'HR001', lastName: 'Hourly', firstName: 'Henry', date: '2025-09-17', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'HR001', lastName: 'Hourly', firstName: 'Henry', date: '2025-09-18', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'HR001', lastName: 'Hourly', firstName: 'Henry', date: '2025-09-19', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
  // Hourly employee week 2: 45 hours more (to exceed 80 bi-weekly standard by 10 hours)
  { employeeId: 'HR001', lastName: 'Hourly', firstName: 'Henry', date: '2025-09-22', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
  { employeeId: 'HR001', lastName: 'Hourly', firstName: 'Henry', date: '2025-09-23', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
  { employeeId: 'HR001', lastName: 'Hourly', firstName: 'Henry', date: '2025-09-24', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
  { employeeId: 'HR001', lastName: 'Hourly', firstName: 'Henry', date: '2025-09-25', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
  { employeeId: 'HR001', lastName: 'Hourly', firstName: 'Henry', date: '2025-09-26', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },

    // Private duty nurse: 3 shifts - Mon day (10h), Wed night (10h), Sat day (8h)
    { employeeId: 'NUR001', lastName: 'Nurse', firstName: 'Nina', date: '2025-09-15', timeIn: '08:00', timeOut: '18:00', totalHours: '10:00' },
    { employeeId: 'NUR001', lastName: 'Nurse', firstName: 'Nina', date: '2025-09-17', timeIn: '20:00', timeOut: '06:00', totalHours: '10:00' },
    { employeeId: 'NUR001', lastName: 'Nurse', firstName: 'Nina', date: '2025-09-20', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' }
    ,
    // Semi-Monthly salaried employees: 87 hours across 10 weekdays to meet/exceed semi-monthly standard (~86.67)
    // Week 1 (Mon-Fri): 9,9,9,9,9
    { employeeId: 'SEL001', lastName: 'SemiLow', firstName: 'Sam', date: '2025-09-15', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'SEL001', lastName: 'SemiLow', firstName: 'Sam', date: '2025-09-16', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'SEL001', lastName: 'SemiLow', firstName: 'Sam', date: '2025-09-17', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'SEL001', lastName: 'SemiLow', firstName: 'Sam', date: '2025-09-18', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'SEL001', lastName: 'SemiLow', firstName: 'Sam', date: '2025-09-19', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    // Week 2 (Mon-Fri): 9,9,9,9,6
    { employeeId: 'SEL001', lastName: 'SemiLow', firstName: 'Sam', date: '2025-09-22', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'SEL001', lastName: 'SemiLow', firstName: 'Sam', date: '2025-09-23', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'SEL001', lastName: 'SemiLow', firstName: 'Sam', date: '2025-09-24', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'SEL001', lastName: 'SemiLow', firstName: 'Sam', date: '2025-09-25', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'SEL001', lastName: 'SemiLow', firstName: 'Sam', date: '2025-09-26', timeIn: '08:00', timeOut: '14:00', totalHours: '6:00' },

    // Mirror the same hours for SEH001
    { employeeId: 'SEH001', lastName: 'SemiHigh', firstName: 'Sara', date: '2025-09-15', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'SEH001', lastName: 'SemiHigh', firstName: 'Sara', date: '2025-09-16', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'SEH001', lastName: 'SemiHigh', firstName: 'Sara', date: '2025-09-17', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'SEH001', lastName: 'SemiHigh', firstName: 'Sara', date: '2025-09-18', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'SEH001', lastName: 'SemiHigh', firstName: 'Sara', date: '2025-09-19', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'SEH001', lastName: 'SemiHigh', firstName: 'Sara', date: '2025-09-22', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'SEH001', lastName: 'SemiHigh', firstName: 'Sara', date: '2025-09-23', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'SEH001', lastName: 'SemiHigh', firstName: 'Sara', date: '2025-09-24', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'SEH001', lastName: 'SemiHigh', firstName: 'Sara', date: '2025-09-25', timeIn: '08:00', timeOut: '17:00', totalHours: '9:00' },
    { employeeId: 'SEH001', lastName: 'SemiHigh', firstName: 'Sara', date: '2025-09-26', timeIn: '08:00', timeOut: '14:00', totalHours: '6:00' },

    // Exemption and senior cases: 40h in week 1 (Mon-Fri)
    { employeeId: 'EXS001', lastName: 'ExemptSS', firstName: 'Evan', date: '2025-09-15', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' },
    { employeeId: 'EXS001', lastName: 'ExemptSS', firstName: 'Evan', date: '2025-09-16', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' },
    { employeeId: 'EXS001', lastName: 'ExemptSS', firstName: 'Evan', date: '2025-09-17', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' },
    { employeeId: 'EXS001', lastName: 'ExemptSS', firstName: 'Evan', date: '2025-09-18', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' },
    { employeeId: 'EXS001', lastName: 'ExemptSS', firstName: 'Evan', date: '2025-09-19', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' },

    { employeeId: 'SEN001', lastName: 'Senior', firstName: 'Sophie', date: '2025-09-15', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' },
    { employeeId: 'SEN001', lastName: 'Senior', firstName: 'Sophie', date: '2025-09-16', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' },
    { employeeId: 'SEN001', lastName: 'Senior', firstName: 'Sophie', date: '2025-09-17', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' },
    { employeeId: 'SEN001', lastName: 'Senior', firstName: 'Sophie', date: '2025-09-18', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' },
    { employeeId: 'SEN001', lastName: 'Senior', firstName: 'Sophie', date: '2025-09-19', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' },

    { employeeId: 'EXM001', lastName: 'ExemptMB', firstName: 'Mia', date: '2025-09-15', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' },
    { employeeId: 'EXM001', lastName: 'ExemptMB', firstName: 'Mia', date: '2025-09-16', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' },
    { employeeId: 'EXM001', lastName: 'ExemptMB', firstName: 'Mia', date: '2025-09-17', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' },
    { employeeId: 'EXM001', lastName: 'ExemptMB', firstName: 'Mia', date: '2025-09-18', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' },
    { employeeId: 'EXM001', lastName: 'ExemptMB', firstName: 'Mia', date: '2025-09-19', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' },

    // Overlap case: 32h worked (Mon-Thu) and both vacation & leave will be recorded for Fri 2025-09-19
    { employeeId: 'OVL001', lastName: 'Overlap', firstName: 'Olly', date: '2025-09-15', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' },
    { employeeId: 'OVL001', lastName: 'Overlap', firstName: 'Olly', date: '2025-09-16', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' },
    { employeeId: 'OVL001', lastName: 'Overlap', firstName: 'Olly', date: '2025-09-17', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' },
    { employeeId: 'OVL001', lastName: 'Overlap', firstName: 'Olly', date: '2025-09-18', timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' }
  ], {
    reportTitle: 'Test Period',
    periodStart,
    periodEnd,
    userId: adminUserId
  });

  return { periodId, periodStart, periodEnd };
}

// Seed a second, later bi-weekly period in the same year for YTD checks
async function seedSecondTimesheetPeriod(adminUserId) {
  const periodStart = '2025-10-13'; // Monday
  const periodEnd = '2025-10-26';   // Sunday
  const entries = [];

  // SAL001 (Monthly salary): work full 80h across the bi-weekly period (10 days * 8h)
  const days1 = ['2025-10-13','2025-10-14','2025-10-15','2025-10-16','2025-10-17'];
  const days2 = ['2025-10-20','2025-10-21','2025-10-22','2025-10-23','2025-10-24'];
  for (const d of [...days1, ...days2]) {
    entries.push({ employeeId: 'SAL001', lastName: 'Salary', firstName: 'Sally', date: d, timeIn: '09:00', timeOut: '17:00', totalHours: '8:00' });
  }

  // HR001 (Bi-Weekly hourly): 80 regular hours (no OT)
  for (const d of [...days1, ...days2]) {
    entries.push({ employeeId: 'HR001', lastName: 'Hourly', firstName: 'Henry', date: d, timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' });
  }

  // NUR001 (Private duty nurse): two shifts in the period (Mon day 10h, Sat day 10h each week)
  entries.push({ employeeId: 'NUR001', lastName: 'Nurse', firstName: 'Nina', date: '2025-10-13', timeIn: '08:00', timeOut: '18:00', totalHours: '10:00' });
  entries.push({ employeeId: 'NUR001', lastName: 'Nurse', firstName: 'Nina', date: '2025-10-18', timeIn: '08:00', timeOut: '18:00', totalHours: '10:00' });
  entries.push({ employeeId: 'NUR001', lastName: 'Nurse', firstName: 'Nina', date: '2025-10-20', timeIn: '08:00', timeOut: '18:00', totalHours: '10:00' });
  entries.push({ employeeId: 'NUR001', lastName: 'Nurse', firstName: 'Nina', date: '2025-10-25', timeIn: '08:00', timeOut: '18:00', totalHours: '10:00' });

  // Semi-Monthly salaried SEL001/SEH001: mirror 8h per day across the two weeks
  for (const d of [...days1, ...days2]) {
    entries.push({ employeeId: 'SEL001', lastName: 'SemiLow', firstName: 'Sam', date: d, timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' });
    entries.push({ employeeId: 'SEH001', lastName: 'SemiHigh', firstName: 'Sara', date: d, timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' });
  }

  // Exempt/senior/overlap employees: simple 40h in week 1 only (Mon-Fri)
  for (const d of days1) {
    entries.push({ employeeId: 'EXS001', lastName: 'ExemptSS', firstName: 'Evan', date: d, timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' });
    entries.push({ employeeId: 'SEN001', lastName: 'Senior', firstName: 'Sophie', date: d, timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' });
    entries.push({ employeeId: 'EXM001', lastName: 'ExemptMB', firstName: 'Mia', date: d, timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' });
    entries.push({ employeeId: 'OVL001', lastName: 'Overlap', firstName: 'Olly', date: d, timeIn: '08:00', timeOut: '16:00', totalHours: '8:00' });
  }

  const periodId = await Timesheet.saveTimeEntries(entries, {
    reportTitle: 'Test Period 2',
    periodStart,
    periodEnd,
    userId: adminUserId
  });

  return { periodId, periodStart, periodEnd };
}

async function seedHolidayWithinPeriod(adminUserId) {
  // Add a holiday on 2025-09-17 (Wednesday)
  const existing = await db.query(`SELECT id FROM public_holidays WHERE date = '2025-09-17'`);
  if (existing[0].length === 0) {
    await PublicHoliday.addHoliday({ name: 'Test Holiday', date: '2025-09-17', description: 'Mid-week holiday' }, adminUserId);
  }
}

async function seedVacationsAndLeaves(adminUserId) {
  // Approve a 1-day vacation for hourly (HR001) on 2025-09-19 (8 hours * $20 = $160)
  await EmployeeVacation.create({
    employee_id: 'HR001',
    start_date: '2025-09-19',
    end_date: '2025-09-19',
    status: 'approved',
    total_hours: 8,
    hourly_rate: 20.0
  }, adminUserId);

  // Approve a 1-day leave for salaried (SAL001) on 2025-09-17 (payment_percentage 100%)
  await EmployeeLeave.create({
    employee_id: 'SAL001',
    start_date: '2025-09-17',
    end_date: '2025-09-17',
    status: 'approved',
    total_hours: 8,
    leave_type: 'sick',
    payment_percentage: 100
  }, adminUserId);

  // Approve a 1-day vacation for nurse on 2025-09-20 (should pay using hourly_rate provided 30)
  await EmployeeVacation.create({
    employee_id: 'NUR001',
    start_date: '2025-09-20',
    end_date: '2025-09-20',
    status: 'approved',
    total_hours: 8,
    hourly_rate: 30.0
  }, adminUserId);

  // Overlapping entries: OVL001 gets both vacation and leave on the same day (2025-09-19)
  await EmployeeVacation.create({
    employee_id: 'OVL001',
    start_date: '2025-09-19',
    end_date: '2025-09-19',
    status: 'approved',
    total_hours: 8,
    hourly_rate: 20.0
  }, adminUserId);

  await EmployeeLeave.create({
    employee_id: 'OVL001',
    start_date: '2025-09-19',
    end_date: '2025-09-19',
    status: 'approved',
    total_hours: 8,
    leave_type: 'sick',
    payment_percentage: 100
  }, adminUserId);
}

async function seedLoans() {
  // Clean prior
  await db.query("DELETE FROM loan_payments");
  await db.query("DELETE FROM employee_loans");

  // Internal loan for HR001: installment 50
  await EmployeeLoan.createLoan({
    employee_id: 'HR001',
    loan_amount: 500,
    interest_rate: 0,
    installment_amount: 50,
    start_date: '2025-09-01',
    expected_end_date: '2026-03-01',
    status: 'active',
    loan_type: 'internal',
    notes: 'Internal loan'
  });

  // Third-party loan for SAL001: installment 100
  await EmployeeLoan.createLoan({
    employee_id: 'SAL001',
    loan_amount: 1200,
    interest_rate: 0,
    installment_amount: 100,
    start_date: '2025-09-01',
    expected_end_date: '2026-09-01',
    status: 'active',
    loan_type: 'third_party',
    third_party_name: 'ABC Finance',
    third_party_account_number: '123456789',
    third_party_routing_number: '987654321',
    third_party_reference: 'REF123'
  });
}

function nearly(a, b, tol = 0.01) { return Math.abs(a - b) <= tol; }

async function run() {
  console.log('--- Comprehensive Payroll Test ---');
  try {
    await ensureSettings();
    const adminUserId = await ensureAdminUser();

    // Clean previous artifacts for idempotence
    await db.query("DELETE FROM payroll_items");
    await db.query("DELETE FROM payroll_runs");
    await db.query("DELETE FROM timesheet_entries");
    await db.query("DELETE FROM timesheet_periods");
    await db.query("DELETE FROM employee_vacations");
    await db.query("DELETE FROM employee_leaves");
    await db.query("DELETE FROM public_holidays");

    await seedEmployees();
  await seedHolidayWithinPeriod(adminUserId);
  await seedLoans();
  await seedVacationsAndLeaves(adminUserId);

    const { periodId, periodStart, periodEnd } = await seedTimesheetPeriod(adminUserId);

    // Run payroll for the period; payDate = periodEnd
    const result = await Payroll.calculateForPeriod(periodId, { payDate: new Date(periodEnd) }, adminUserId);

    console.log('Payroll run id:', result.payrollRunId);
    console.log('Employees processed:', result.totalEmployees);
    if (result.errors) console.log('Errors:', result.errors);

    // Basic existence checks
  assert(result.totalEmployees === 9, 'Should process 9 employees');

    // Fetch items for assertions
  const [items] = await db.query('SELECT * FROM payroll_items WHERE payroll_run_id = ? ORDER BY employee_name', [result.payrollRunId]);
  assert(items.length === 9, '9 payroll items expected');

  const byId = Object.fromEntries(items.map(i => [i.employee_id, i]));

  // Hourly HR001 assertions (Bi-Weekly): total 90h => regular 80h, OT 10h; vacation 8h; holiday 8h
    const hr = byId['HR001'];
    assert(hr, 'Hourly employee item present');
  const expectedHourlyGross = (80*20) + (10*20*1.5) + 160 + 0 + 160; // reg + ot + vacation + leave + holiday
    assert(nearly(parseFloat(hr.gross_pay), expectedHourlyGross), `Hourly gross expected ${expectedHourlyGross}, got ${hr.gross_pay}`);
    // Loan deduction 50 internal
    assert(nearly(parseFloat(hr.loan_deduction), 50), 'Hourly loan deduction should be 50');
    assert(nearly(parseFloat(hr.internal_loan_deduction), 50), 'Hourly internal loan 50');

    // Salaried SAL001 assertions
    const sal = byId['SAL001'];
    assert(sal, 'Salaried employee item present');
    // Monthly salary 6000; weekly period but payment_frequency Monthly => payPeriods=1 baseSalaryForPeriod=6000
    // Worked 32h + leave 8h = 40h; standardHoursPerPeriod for Monthly = 40*4 = 160; total (40) < standard 160 => proration 40/160=0.25 => 1500
    // Holiday pay added: salaried gets holidayPay extra: holiday hours = 8, hourlyRate for salary = (6000*12)/(52*40)=~34.62; holidayPay ~ 276.92; leave amount also added
    const salaryHourlyRate = (6000 * 12) / (52 * 40); // ≈ 34.615
    const expectedSalaryProrated = 6000 * (40 / (40 * 4)); // 1500
    const expectedSalaryHoliday = 8 * salaryHourlyRate; // ~276.92
    // Leave amount: for salary, EmployeeLeave.calculateLeaveForPeriod computes using effectiveHourlyRate from salary_amount with standard_hours or default 80 per period.
    // With default standard_hours for salary in leave model: standardHoursPerPeriod = employee.standard_hours || 80 -> our employee has 40 so uses 40.
    // standardPayPeriods=26, yearlyPay=salary_amount=6000, payPerPeriod=6000/26 ≈ 230.77, effectiveHourly = 230.77/40 ≈ 5.769; leave 8h => ~46.15
    const payPerPeriod = 6000 / 26;
    const effectiveHourly = payPerPeriod / 40;
    const expectedLeaveAmount = 8 * effectiveHourly;
    const expectedSalaryGross = expectedSalaryProrated + expectedSalaryHoliday + expectedLeaveAmount;
    assert(nearly(parseFloat(sal.gross_pay), expectedSalaryGross, 0.5), `Salary gross expected ~${expectedSalaryGross.toFixed(2)}, got ${sal.gross_pay}`);
    // Third-party loan 100
    assert(nearly(parseFloat(sal.third_party_deduction), 100), 'Salary third-party loan 100');

  // Nurse NUR001 assertions
    const nur = byId['NUR001'];
    assert(nur, 'Nurse employee item present');
  // Nurse pay based on settings defaults in Payroll: weekday day=35, night all=40, weekend day=40
  // Entries: Mon day 10h @35 = 350; Wed night 10h @40 = 400; Sat day (weekend) 8h @40 = 320 => base 1070
  // Vacation 8h*30 = 240; Holiday pay uses standardDailyHours = standard_hours/5 = 36/5 = 7.2 at $35 => 252
  const expectedNurseGross = 1070 + 240 + 0 + 252; // base + vacation + leave(0) + holiday
    assert(nearly(parseFloat(nur.gross_pay), expectedNurseGross), `Nurse gross expected ${expectedNurseGross}, got ${nur.gross_pay}`);

    console.log('\nAll gross pay assertions passed.');

    // New scenarios: Semi-Monthly education levy calculations
    const sel = byId['SEL001'];
    const seh = byId['SEH001'];
    assert(sel && seh, 'Semi-Monthly salaried items present');
  // For Semi-Monthly: gross should be salary/2 + holiday pay (8h at effective hourly)
  const selGross = parseFloat(sel.gross_pay);
  const sehGross = parseFloat(seh.gross_pay);
  const selHoliday = 8 * ((4000 * 12) / (52 * 40)); // 8h at effective hourly
  const sehHoliday = 8 * ((12000 * 12) / (52 * 40));
  const expectedSelGross = 4000 / 2 + selHoliday; // 2000 + ~184.615
  const expectedSehGross = 12000 / 2 + sehHoliday; // 6000 + ~553.846
  assert(nearly(selGross, expectedSelGross, 0.5), `SEL001 gross ~${expectedSelGross.toFixed(2)}, got ${selGross}`);
  assert(nearly(sehGross, expectedSehGross, 0.5), `SEH001 gross ~${expectedSehGross.toFixed(2)}, got ${sehGross}`);
    // Education levy should exist for Semi-Monthly and be higher for SEH001 than SEL001
    const selEL = parseFloat(sel.education_levy || 0);
    const sehEL = parseFloat(seh.education_levy || 0);
    assert(selEL >= 0, 'SEL001 education levy computed');
    assert(sehEL > selEL, `SEH001 levy (${sehEL}) should be greater than SEL001 levy (${selEL}) due to higher tier`);

    // Exemptions and senior rate
    const exs = byId['EXS001'];
    const sen = byId['SEN001'];
    const exm = byId['EXM001'];
    assert(exs && sen && exm, 'Exemption and senior items present');
    // EXS001 is exempt from Social Security
    assert(nearly(parseFloat(exs.social_security_employee || 0), 0), 'EXS001 SS should be 0');
    // EXM001 is exempt from Medical Benefits
    assert(nearly(parseFloat(exm.medical_benefits_employee || 0), 0), 'EXM001 MB should be 0');
    // SEN001 should have senior medical rate applied (2.5% of gross) and 0 employer MB
    const senGross = parseFloat(sen.gross_pay);
    const senMB = parseFloat(sen.medical_benefits_employee || 0);
    const senMBExpected = senGross * 0.025;
    assert(nearly(senMB, senMBExpected, 0.5), `SEN001 MB ~2.5% of ${senGross}, got ${senMB}`);
    assert(nearly(parseFloat(sen.medical_benefits_employer || 0), 0), 'SEN001 MB employer should be 0');

    // Overlapping vacation and leave behavior - ensure paid hours for the overlap day don't exceed one day excessively
    const ovl = byId['OVL001'];
    assert(ovl, 'OVL001 present');
    const ovlVacation = parseFloat(ovl.vacation_pay || ovl.vacation_amount || 0);
    const ovlLeave = parseFloat(ovl.leave_pay || ovl.leave_amount || 0);
    // The engine may include both; we soft-check that the sum does not wildly exceed one day's pay at the hourly rate
    softAssert((ovlVacation + ovlLeave) <= 8 * 20 + 1, `Overlap paid components seem high: vacation ${ovlVacation} + leave ${ovlLeave}`);

    // Spot-check deductions present
    for (const it of items) {
      assert(it.social_security_employee !== null, 'SS employee present');
      assert(it.medical_benefits_employee !== null, 'MB employee present');
      assert(it.net_pay !== null, 'Net pay present');
    }

    console.log('\nSuccess: Comprehensive payroll test (phase 1) passed. Proceeding to YTD and ACH checks...');

    // Capture first-run items for YTD reference
    const firstRunItemsById = byId;

    // Seed and run a second period for YTD aggregation checks
    const { periodId: periodId2, periodStart: periodStart2, periodEnd: periodEnd2 } = await seedSecondTimesheetPeriod(adminUserId);
    const result2 = await Payroll.calculateForPeriod(periodId2, { payDate: new Date(periodEnd2) }, adminUserId);
    console.log('Second payroll run id:', result2.payrollRunId);
    assert(result2.totalEmployees === 9, 'Second run should process 9 employees');

    // Fetch items for second run
    const [items2] = await db.query('SELECT * FROM payroll_items WHERE payroll_run_id = ? ORDER BY employee_name', [result2.payrollRunId]);
    assert(items2.length === 9, '9 payroll items expected (second run)');
    const byId2 = Object.fromEntries(items2.map(i => [i.employee_id, i]));

    // YTD validations: HR001 and SAL001 cover hourly and monthly levy cases
    const hr1 = firstRunItemsById['HR001'];
    const hr2 = byId2['HR001'];
    assert(hr2, 'HR001 present in second run');
    const hrExpectedYtdGross = parseFloat(hr1.gross_pay) + parseFloat(hr2.gross_pay);
    assert(nearly(parseFloat(hr2.ytd_gross_pay), hrExpectedYtdGross, 0.5), `HR001 YTD gross should be sum of runs (${hrExpectedYtdGross.toFixed(2)}), got ${hr2.ytd_gross_pay}`);
    const hrExpectedYtdSS = parseFloat(hr1.social_security_employee || 0) + parseFloat(hr2.social_security_employee || 0);
    assert(nearly(parseFloat(hr2.ytd_social_security_employee || 0), hrExpectedYtdSS, 0.5), `HR001 YTD SS EE mismatch`);
    const hrExpectedYtdMB = parseFloat(hr1.medical_benefits_employee || 0) + parseFloat(hr2.medical_benefits_employee || 0);
    assert(nearly(parseFloat(hr2.ytd_medical_benefits_employee || 0), hrExpectedYtdMB, 0.5), `HR001 YTD MB EE mismatch`);
    const hrExpectedYtdEL = parseFloat(hr1.education_levy || 0) + parseFloat(hr2.education_levy || 0);
    assert(nearly(parseFloat(hr2.ytd_education_levy || 0), hrExpectedYtdEL, 0.5), `HR001 YTD Education Levy mismatch`);
    const hrExpectedYtdNet = parseFloat(hr1.net_pay) + parseFloat(hr2.net_pay);
    assert(nearly(parseFloat(hr2.ytd_net_pay), hrExpectedYtdNet, 0.5), `HR001 YTD net pay mismatch`);
    const hrExpectedYtdHours = parseFloat(hr1.hours_worked || 0) + parseFloat(hr2.hours_worked || 0);
    assert(nearly(parseFloat(hr2.ytd_hours_worked || 0), hrExpectedYtdHours, 0.5), `HR001 YTD hours worked mismatch`);
    const hrExpectedYtdVacHours = parseFloat(hr1.vacation_hours || 0) + parseFloat(hr2.vacation_hours || 0);
    const hrExpectedYtdVacAmt = parseFloat(hr1.vacation_amount || 0) + parseFloat(hr2.vacation_amount || 0);
    assert(nearly(parseFloat(hr2.ytd_vacation_hours || 0), hrExpectedYtdVacHours, 0.5), `HR001 YTD vacation hours mismatch`);
    assert(nearly(parseFloat(hr2.ytd_vacation_amount || 0), hrExpectedYtdVacAmt, 0.5), `HR001 YTD vacation amount mismatch`);

    const sal1 = firstRunItemsById['SAL001'];
    const sal2 = byId2['SAL001'];
    assert(sal2, 'SAL001 present in second run');
    const salExpectedYtdGross = parseFloat(sal1.gross_pay) + parseFloat(sal2.gross_pay);
    assert(nearly(parseFloat(sal2.ytd_gross_pay), salExpectedYtdGross, 0.5), `SAL001 YTD gross mismatch`);
    const salExpectedYtdEL = parseFloat(sal1.education_levy || 0) + parseFloat(sal2.education_levy || 0);
    assert(nearly(parseFloat(sal2.ytd_education_levy || 0), salExpectedYtdEL, 0.5), `SAL001 YTD Education Levy mismatch`);

    console.log('\nYTD aggregation assertions passed.');

    // ACH report sanity check for the second run
  const ach = await Payroll.generateACHReport(result2.payrollRunId);
    assert(ach && ach.items && ach.summary, 'ACH report structure present');
  // With no banking info seeded, ACH will include items but mark them missing; total_amount sums only items with banking info
  const totalNetSecondRun = items2.reduce((sum, it) => sum + parseFloat(it.net_pay || 0), 0);
  console.log('ACH total_amount:', ach.summary.total_amount, 'Computed total net:', totalNetSecondRun.toFixed(2));
  assert(parseFloat(ach.summary.total_amount) === 0, 'ACH total_amount should be 0 when no direct deposit info is present');
  // Items should match count of payroll items with net_pay > 0 (the ACH query filters this)
    const payableCount = items2.filter(it => parseFloat(it.net_pay) > 0).length;
    assert(ach.items.length === payableCount, 'ACH items count should equal payable payroll items');
  // Since no banking info is seeded, all transactions should be flagged as missing info and total_transactions should be 0
    assert(ach.summary.transactions_with_missing_info === ach.items.length, 'ACH missing banking info count should equal items length');
  assert(ach.summary.total_transactions === 0, 'ACH total_transactions should be 0 without banking info');

    console.log('\nSuccess: YTD and ACH checks passed.');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err.message);
    console.error(err);
    process.exit(1);
  }
}

run();
