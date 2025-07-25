const db = require('../config/db');

/**
 * @class PublicHoliday
 * @description Model for managing public holidays
 */
class PublicHoliday {
  /**
   * Add a new public holiday
   * @param {Object} holidayData - Holiday data
   * @param {string} holidayData.name - Holiday name
   * @param {Date} holidayData.date - Holiday date
   * @param {string} [holidayData.description] - Holiday description
   * @param {number} userId - User ID adding the holiday
   * @returns {Promise<Object>} Created holiday
   */
  static async addHoliday(holidayData, userId) {
    try {
      const { name, date, description = '' } = holidayData;
      
      // Format date as YYYY-MM-DD
      const formattedDate = new Date(date).toISOString().split('T')[0];
      const year = new Date(date).getFullYear();
      
      const [result] = await db.query(
        `INSERT INTO public_holidays 
        (name, date, year, description, created_by) 
        VALUES (?, ?, ?, ?, ?)`,
        [name, formattedDate, year, description, userId]
      );
      
      return {
        id: result.insertId,
        name,
        date: formattedDate,
        year,
        description,
        created_by: userId
      };
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Update an existing public holiday
   * @param {number} id - Holiday ID
   * @param {Object} holidayData - Updated holiday data
   * @returns {Promise<boolean>} Success status
   */
  static async updateHoliday(id, holidayData) {
    try {
      const { name, date, description } = holidayData;
      
      // Format date as YYYY-MM-DD if provided
      let formattedDate = null;
      let year = null;
      
      if (date) {
        formattedDate = new Date(date).toISOString().split('T')[0];
        year = new Date(date).getFullYear();
      }
      
      // Build update query dynamically based on provided fields
      let updateFields = [];
      let queryParams = [];
      
      if (name) {
        updateFields.push('name = ?');
        queryParams.push(name);
      }
      
      if (formattedDate) {
        updateFields.push('date = ?');
        queryParams.push(formattedDate);
        
        updateFields.push('year = ?');
        queryParams.push(year);
      }
      
      if (description !== undefined) {
        updateFields.push('description = ?');
        queryParams.push(description);
      }
      
      if (updateFields.length === 0) {
        return false;
      }
      
      // Add ID as last parameter
      queryParams.push(id);
      
      const [result] = await db.query(
        `UPDATE public_holidays 
         SET ${updateFields.join(', ')} 
         WHERE id = ?`,
        queryParams
      );
      
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Delete a public holiday
   * @param {number} id - Holiday ID
   * @returns {Promise<boolean>} Success status
   */
  static async deleteHoliday(id) {
    try {
      const [result] = await db.query(
        'DELETE FROM public_holidays WHERE id = ?',
        [id]
      );
      
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get all public holidays
   * @param {Object} options - Query options
   * @param {number} [options.year] - Filter by year
   * @param {Date} [options.startDate] - Filter by start date
   * @param {Date} [options.endDate] - Filter by end date
   * @returns {Promise<Array>} Holidays
   */
  static async getAllHolidays(options = {}) {
    try {
      const { year, startDate, endDate, limit = 100, offset = 0 } = options;
      
      let whereConditions = [];
      let queryParams = [];
      
      if (year) {
        whereConditions.push('year = ?');
        queryParams.push(year);
      }
      
      if (startDate) {
        const formattedStartDate = new Date(startDate).toISOString().split('T')[0];
        whereConditions.push('date >= ?');
        queryParams.push(formattedStartDate);
      }
      
      if (endDate) {
        const formattedEndDate = new Date(endDate).toISOString().split('T')[0];
        whereConditions.push('date <= ?');
        queryParams.push(formattedEndDate);
      }
      
      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}` 
        : '';
      
      const query = `
        SELECT ph.*, u.name as created_by_name
        FROM public_holidays ph
        LEFT JOIN users u ON ph.created_by = u.id
        ${whereClause}
        ORDER BY date ASC
        LIMIT ? OFFSET ?
      `;
      
      queryParams.push(limit, offset);
      
      const [holidays] = await db.query(query, queryParams);
      
      return holidays;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get a public holiday by ID
   * @param {number} id - Holiday ID
   * @returns {Promise<Object|null>} Holiday
   */
  static async getHolidayById(id) {
    try {
      const [holidays] = await db.query(
        `SELECT ph.*, u.name as created_by_name
         FROM public_holidays ph
         LEFT JOIN users u ON ph.created_by = u.id
         WHERE ph.id = ?`,
        [id]
      );
      
      return holidays.length > 0 ? holidays[0] : null;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get holidays in a date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Holidays in the range
   */
  static async getHolidaysInRange(startDate, endDate) {
    try {
      const formattedStartDate = new Date(startDate).toISOString().split('T')[0];
      const formattedEndDate = new Date(endDate).toISOString().split('T')[0];
      
      const [holidays] = await db.query(
        `SELECT * FROM public_holidays
         WHERE date >= ? AND date <= ?
         ORDER BY date ASC`,
        [formattedStartDate, formattedEndDate]
      );
      
      return holidays;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Check if paid public holidays are enabled
   * @returns {Promise<boolean>} Enabled status
   */
  static async isHolidayPayEnabled() {
    try {
      const [settings] = await db.query(
        `SELECT setting_value FROM settings
         WHERE setting_name = 'paid_public_holidays_enabled'`
      );
      
      if (settings.length === 0) {
        return true; // Default to enabled if setting doesn't exist
      }
      
      return settings[0].setting_value === 'true';
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Set holiday pay enabled status
   * @param {boolean} enabled - Enabled status
   * @returns {Promise<boolean>} Success status
   */
  static async setHolidayPayEnabled(enabled) {
    try {
      const value = enabled ? 'true' : 'false';
      
      const [result] = await db.query(
        `UPDATE settings 
         SET setting_value = ?
         WHERE setting_name = 'paid_public_holidays_enabled'`,
        [value]
      );
      
      if (result.affectedRows === 0) {
        // Setting doesn't exist, create it
        await db.query(
          `INSERT INTO settings (setting_name, setting_value, description)
           VALUES ('paid_public_holidays_enabled', ?, 'Enable automatic payment for public holidays')`,
          [value]
        );
      }
      
      return true;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = PublicHoliday;
