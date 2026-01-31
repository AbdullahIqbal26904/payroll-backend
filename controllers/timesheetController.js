const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { formatSuccess, formatError } = require('../utils/helpers');
const Timesheet = require('../models/Timesheet');
const { parse } = require('date-fns');

/**
 * Parse date strings in various formats
 * @param {string} dateString - Date string to parse
 * @returns {string} - ISO date string
 */
const parseDate = function(dateString) {
  if (!dateString) {
    throw new Error('Date string is empty');
  }

  // Extract the first date-looking token (helps with trailing commas or text)
  const trimmed = String(dateString).trim();
  const dateMatch = trimmed.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
  const normalizedInput = dateMatch ? dateMatch[0] : trimmed;
  
  // Try to parse the date (handle different formats)
  let date;
  
  // Try M/D/YYYY format (both MM/DD/YYYY and M/D/YYYY)
  try {
    // First try MM/dd/yyyy format
    date = parse(normalizedInput, 'MM/dd/yyyy', new Date());
    if (isNaN(date.getTime())) {
      // If that fails, try M/d/yyyy format
      date = parse(normalizedInput, 'M/d/yyyy', new Date());
      if (isNaN(date.getTime())) throw new Error('Invalid date');
    }
    return date.toISOString().split('T')[0];
  } catch (e) {
    // Try other formats if needed
    try {
      date = new Date(normalizedInput);
      if (isNaN(date.getTime())) throw new Error('Invalid date');
      return date.toISOString().split('T')[0];
    } catch (e2) {
      throw new Error(`Could not parse date: ${dateString}`);
    }
  }
};

/**
 * Parse hours from format like "11:51" or ":30" to decimal hours
 * @param {string} hoursString - Hours string to parse (HH:MM format or :MM format)
 * @returns {number} - Hours in decimal
 */
const parseHoursToDecimal = function(hoursString) {
  if (!hoursString || hoursString === '0:00') {
    return 0;
  }
  
  // Handle the case where the hours string starts with a colon (like ":30")
  if (hoursString.startsWith(':')) {
    const minutes = parseInt(hoursString.substring(1), 10);
    return minutes / 60;
  }
  
  // Handle the normal case (like "11:51")
  const parts = hoursString.split(':');
  if (parts.length !== 2) {
    return 0;
  }
  
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  
  // Convert to decimal hours
  return hours + (minutes / 60);
};

/**
 * @desc    Upload and process timesheet CSV
 * @route   POST /api/payroll/upload-timesheet
 * @access  Private/Admin
 */
exports.uploadTimesheet = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json(formatError({
        message: 'Please upload a CSV file'
      }));
    }
    
    const filePath = req.file.path;
    const results = [];
    let errors = [];
    
    // Read file as raw text to extract header information
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n');
    
    if (lines.length < 3) {
      return res.status(400).json(formatError({
        message: 'Invalid CSV file format. File should contain at least 3 lines.'
      }));
    }
    
  // Extract report title and date range from first two lines (remove trailing columns)
  const rawReportTitleLine = lines[0] || '';
  const reportTitle = rawReportTitleLine.split(',')[0].trim();

  const rawDateRangeLine = lines[1] || '';
  const dateRange = rawDateRangeLine.split(',')[0].trim();
    
    console.log('Report Title:', reportTitle);
    console.log('Date Range:', dateRange);
    
    // Parse date range
  let periodStart = null;
  let periodEnd = null;
  let detectedStartDate = null;
  let detectedEndDate = null;
    
    if (dateRange) {
      const dates = dateRange.split('-');
      if (dates.length === 2) {
        try {
          periodStart = parseDate(dates[0]);
          periodEnd = parseDate(dates[1]);
          console.log('Period Start:', periodStart);
          console.log('Period End:', periodEnd);
        } catch (error) {
          console.error('Error parsing date range:', error);
          errors.push({ error: `Invalid date range format: ${dateRange}` });
        }
      }
    }
    
    // Read the CSV data starting from line 3 (headers)
    const columnHeaders = lines[2].split(',').map(header => header.replace(/^"|"$/g, '').trim());
    console.log('Column Headers:', columnHeaders);
    
    // Process the actual data rows
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line) continue; // Skip empty lines
      
      try {
        // Check if the line has tabs
        let values;
        if (line.includes('\t')) {
          values = line.split('\t');
        } else {
          // For CSV format with quotes around each field
          // First, attempt to handle standard CSV with quoted fields
          let parsedValues = [];
          
          // Pattern to match CSV fields (handles quoted fields with commas inside them)
          const pattern = /("([^"]*)"|([^,]*))(,|$)/g;
          let match;
          
          while ((match = pattern.exec(line)) !== null) {
            // The captured value is either in group 2 (with quotes) or group 3 (without quotes)
            const value = match[2] !== undefined ? match[2] : match[3] || '';
            parsedValues.push(value.trim());
            
            // If the match ends at the end of the string, break
            if (match.index + match[0].length >= line.length) break;
          }
          
          values = parsedValues;
          
          // If parsing failed or produced unexpected results, fallback to simple split
          if (values.length < 3) {
            const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
            values = line.split(regex);
            values = values.map(val => val.replace(/^"|"$/g, '').trim());
          }
        }
        console.log('values: ',values);
        
        // Validate employee ID (EMP##) is not empty
        if (!values[2] || values[2].trim() === '') {
          throw new Error(`Missing or empty EMP## field for employee: ${values[0]} ${values[1]}`);
        }
        
        // Create timesheet entry with employee number as the primary identifier
        if (!values[3]) {
          throw new Error('Missing date field');
        }
        
        // Check for lunch flag in column 7 (new CSV format)
        // Lunch flag can be 'L', 'l', or empty
        const lunchFlag = (values[7] || '').trim().toUpperCase();
        const isLunch = lunchFlag === 'L';
        
        const timeEntry = {
          lastName: values[0],
          firstName: values[1],
          employeeId: values[2], // Using the employee number (EMP##) as the unique identifier
          date: parseDate(values[3]),
          timeIn: values[4] || null,
          timeOut: values[5] || null,
          totalHours: values[6] || '0:00',
          isLunch: isLunch,             // New: lunch flag from column 7
          deptCode: values[8] || null,  // Shifted: was index 7, now index 8
          inLocation: values[9] || null,  // Shifted: was index 8, now index 9
          inPunchMethod: values[10] || null, // Shifted: was index 9, now index 10
          outLocation: values[11] || null,   // Shifted: was index 10, now index 11
          outPunchMethod: values[12] || null // Shifted: was index 11, now index 12
        };
        
        // Parse hours to decimal
        timeEntry.hoursDecimal = parseHoursToDecimal(timeEntry.totalHours);
        
        // Store lunch hours separately if this is a lunch entry
        timeEntry.lunchHours = isLunch ? timeEntry.hoursDecimal : 0;

        // Track actual date range found in the data to guard against incorrect headers
        if (timeEntry.date) {
          if (!detectedStartDate || new Date(timeEntry.date) < new Date(detectedStartDate)) {
            detectedStartDate = timeEntry.date;
          }
          if (!detectedEndDate || new Date(timeEntry.date) > new Date(detectedEndDate)) {
            detectedEndDate = timeEntry.date;
          }
        }
        
        console.log('Processed entry:', 
          timeEntry.lastName, 
          timeEntry.firstName,
          timeEntry.employeeId, // Added employee ID to log
          timeEntry.date, 
          timeEntry.totalHours, 
          timeEntry.hoursDecimal
        );
        
        results.push(timeEntry);
      } catch (error) {
        console.error('Error processing line', i, ':', error);
        errors.push({ line: i, error: error.message });
      }
    }
    console.log('results: ',results)

    // Determine the final period range to store
    const headerRangeIsValid = periodStart && periodEnd && detectedStartDate && detectedEndDate &&
      new Date(detectedStartDate) >= new Date(periodStart) && new Date(detectedEndDate) <= new Date(periodEnd);

    const finalPeriodStart = headerRangeIsValid ? periodStart : (detectedStartDate || periodStart);
    const finalPeriodEnd = headerRangeIsValid ? periodEnd : (detectedEndDate || periodEnd);

    if (!headerRangeIsValid) {
      console.log('Using detected date range for period:', finalPeriodStart, finalPeriodEnd);
    }
    // Save to database if we have valid entries
    if (results.length > 0) {
      try {
        const periodId = await Timesheet.saveTimeEntries(results, {
          reportTitle,
          periodStart: finalPeriodStart,
          periodEnd: finalPeriodEnd,
          userId: req.user.id
        });
        
        return res.status(200).json(formatSuccess('Timesheet data uploaded and processed successfully', {
          periodId,
          reportTitle,
          periodStart: finalPeriodStart,
          periodEnd: finalPeriodEnd,
          totalEntries: results.length,
          errors: errors.length > 0 ? errors : null
        }));
      } catch (dbError) {
        console.error('Database error:', dbError);
        
        // Check if this is a duplicate period error
        if (dbError.message && dbError.message.includes('duplicate') || 
            dbError.message && dbError.message.includes('already been uploaded')) {
          return res.status(409).json(formatError({
            message: 'This pay period already exists in the system. Each period can only be uploaded once.',
            details: dbError.message
          }));
        }
        
        // Handle unique constraint violation from MySQL
        if (dbError.code === 'ER_DUP_ENTRY') {
          return res.status(409).json(formatError({
            message: 'This pay period already exists in the system. Each period can only be uploaded once.',
            details: 'Duplicate period detected'
          }));
        }
        
        return res.status(500).json(formatError({
          message: 'Error saving timesheet data to the database',
          details: dbError.message
        }));
      }
    } else {
      return res.status(400).json(formatError({
        message: 'No valid timesheet entries found in the CSV file',
        errors
      }));
    }
  } catch (error) {
    console.error('CSV upload error:', error);
    
    // Check if the error is related to empty EMP## fields
    if (error.message && error.message.includes('Missing or empty EMP## field')) {
      return res.status(400).json(formatError({
        message: 'Timesheet cannot be uploaded because of empty EMP## field(s)',
        details: error.message
      }));
    }
    
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Delete a timesheet period and all associated entries
 * @route   DELETE /api/payroll/timesheet-periods/:id
 * @access  Private/Admin
 */
exports.deleteTimesheetPeriod = async (req, res) => {
  try {
    const periodId = parseInt(req.params.id, 10);

    if (isNaN(periodId)) {
      return res.status(400).json(formatError({
        message: 'Invalid period ID'
      }));
    }

    // Delete the period using the Timesheet model
    const result = await Timesheet.deletePeriod(periodId);

    return res.status(200).json(formatSuccess(
      'Timesheet period deleted successfully',
      {
        periodId: result.deletedPeriod.id,
        periodStart: result.deletedPeriod.periodStart,
        periodEnd: result.deletedPeriod.periodEnd,
        reportTitle: result.deletedPeriod.reportTitle,
        deletedEntriesCount: result.deletedEntriesCount,
        deletedPayrollRunsCount: result.deletedPayrollRunsCount,
        message: `Deleted period with ${result.deletedEntriesCount} timesheet entries and ${result.deletedPayrollRunsCount} payroll runs`
      }
    ));
  } catch (error) {
    console.error('Error deleting timesheet period:', error);

    if (error.message === 'Timesheet period not found') {
      return res.status(404).json(formatError({
        message: 'Timesheet period not found',
        details: `No timesheet period found with ID ${req.params.id}`
      }));
    }

    return res.status(500).json(formatError({
      message: 'Error deleting timesheet period',
      details: error.message
    }));
  }
};
