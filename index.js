const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3005;

// MongoDB connection
require('dotenv').config();
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/study";

mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware

app.use(cors({
  origin: ['http://localhost:3000', 'https://study-tool-silk.vercel.app'],
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Multer setup for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit per file
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.ms-powerpoint', // .ppt
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'application/vnd.oasis.opendocument.presentation', // .odp
      'application/vnd.ms-excel', // .xls
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.oasis.opendocument.text', // .odt
      'application/vnd.oasis.opendocument.spreadsheet' // .ods
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, PowerPoint, Word, Excel, and OpenDocument files are allowed'), false);
    }
  },
});

// Import routes
const authRoutes = require('./routes/auth');
const studyRoutes = require('./routes/studies');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/studies', studyRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Study Tool API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = { upload };
