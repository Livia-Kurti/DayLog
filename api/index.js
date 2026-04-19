require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Connect to MongoDB
const dbURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/daylog';
mongoose.connect(dbURI)
  .then(() => console.log('Connected to MongoDB! 🌿'))
  .catch(err => console.error('Could not connect to MongoDB:', err));

// Schema setup
const entrySchema = new mongoose.Schema({
  userId: { type: String, default: null },
  date: { type: String, required: true },
  mood: Number,
  sleep: Number,
  breakfast: String,
}, { timestamps: true });

// IMPORTANT: This prevents Mongoose from crashing in Vercel's serverless environment
const Entry = mongoose.models.Entry || mongoose.model('Entry', entrySchema);

// GET Route (Fetch community data for the charts)
app.get('/api/entries/community', async (req, res) => {
  try {
    const entries = await Entry.find({}, '-userId');
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch community entries." });
  }
});

// POST Route (Save new logs to the database)
app.post('/api/entries', async (req, res) => {
  try {
    const newEntry = new Entry({
      userId: req.body.userId || null,
      date: req.body.date,
      mood: req.body.mood,
      sleep: req.body.sleep,
      breakfast: req.body.breakfast
    });
    
    const savedEntry = await newEntry.save();
    res.json({ ok: true, entry: savedEntry });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Could not save entry." });
  }
});

module.exports = app;
