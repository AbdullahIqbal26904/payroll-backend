const Payroll = require('../models/Payroll');
const { formatSuccess, formatError } = require('../utils/helpers');

/**
 * @desc    Apply a payroll override for an employee
 * @route   POST /api/payroll/override
 * @access  Private/Admin
 */
exports.applyPayrollOverride = async (req, res) => {
  try {
    const { 
      payrollItemId, 
      overrideAmount, 
      overrideReason 
    } = req.body;
    
    if (!payrollItemId || !overrideAmount) {
      return res.status(400).json(formatError({
        message: 'Payroll item ID and override amount are required'
      }));
    }
    
    // Apply the override in the Payroll model
    const result = await Payroll.applyOverride(
      payrollItemId, 
      overrideAmount, 
      overrideReason,
      req.user.id
    );
    
    return res.status(200).json(formatSuccess('Payroll override applied successfully', result));
  } catch (error) {
    console.error('Error applying payroll override:', error);
    return res.status(500).json(formatError(error));
  }
};