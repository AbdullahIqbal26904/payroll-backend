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
  
  // Try to parse the date (handle different formats)
  let date;
  
  // Try M/D/YYYY format
  try {
    date = parse(dateString.trim(), 'MM/dd/yyyy', new Date());
    if (isNaN(date.getTime())) throw new Error('Invalid date');
    return date.toISOString().split('T')[0];
  } catch (e) {
    // Try other formats if needed
    try {
      date = new Date(dateString.trim());
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
    
    // Extract report title and date range from first two lines
    const reportTitle = lines[0].trim();
    const dateRange = lines[1].trim();
    
    console.log('Report Title:', reportTitle);
    console.log('Date Range:', dateRange);
    
    // Parse date range
    let periodStart = null;
    let periodEnd = null;
    
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
    const columnHeaders = lines[2].split('\t');
    console.log('Column Headers:', columnHeaders);
    
    // Process the actual data rows
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line) continue; // Skip empty lines
    //   console.log(line)
      try {
        // Check if the line has tabs
        let values;
        if (line.includes('\t')) {
          values = line.split('\t');
        } else {
          // If not tab-delimited, try parsing as CSV
          // Remove quotes and split by commas
          const csvLine = line.replace(/^"|"$/g, '').replace(/","/g, '","');
          values = csvLine.split('","');
          // Clean up any remaining quotes
          values = values.map(val => val.replace(/^"|"$/g, ''));
        }
        console.log('values: ',values);
        
        // Create timesheet entry
        const timeEntry = {
          lastName: values[0],
          firstName: values[1],
          employeeId: values[2] || null,
          date: parseDate(values[3]),
          timeIn: values[4] || null,
          timeOut: values[5] || null,
          totalHours: values[6] || '0:00',
          deptCode: values[7] || null,
          inLocation: values[8] || null,
          inPunchMethod: values[9] || null,
          outLocation: values[10] || null,
          outPunchMethod: values[11] || null
        };
        
        // Parse hours to decimal
        timeEntry.hoursDecimal = parseHoursToDecimal(timeEntry.totalHours);
        
        console.log('Processed entry:', 
          timeEntry.lastName, 
          timeEntry.firstName, 
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
    // Save to database if we have valid entries
    if (results.length > 0) {
      try {
        const periodId = await Timesheet.saveTimeEntries(results, {
          reportTitle,
          periodStart,
          periodEnd,
          userId: req.user.id
        });
        
        return res.status(200).json(formatSuccess('Timesheet data uploaded and processed successfully', {
          periodId,
          reportTitle,
          periodStart,
          periodEnd,
          totalEntries: results.length,
          errors: errors.length > 0 ? errors : null
        }));
      } catch (dbError) {
        console.error('Database error:', dbError);
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
    return res.status(500).json(formatError(error));
  }
};
