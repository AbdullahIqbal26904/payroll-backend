const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const db = require('./config/db');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const payrollRoutes = require('./routes/payrollRoutes'); 
const loanRoutes = require('./routes/loanRoutes');
const vacationRoutes = require('./routes/vacationRoutes');
const holidayRoutes = require('./routes/holidayRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const governmentReportRoutes = require('./routes/governmentReportRoutes');

// Load environment variables
dotenv.config();

// Initialize the app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['https://payroll-system-liard.vercel.app', 'http://localhost:3000', 'https://nodejs.msa.medsaas.me'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Additional CORS headers for preflight requests
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === 'https://payroll-system-liard.vercel.app') {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files - for uploads and public assets
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/vacations', vacationRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/reports/government', governmentReportRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'Server is running' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'production' ? {} : err
  });
});

// Initialize database and start the server
(async () => {
  try {
    // Test database connection
    const db = require('./config/db');
    const [result] = await db.query('SELECT 1');
    console.log('Database connection successful');
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`Server running on port http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();