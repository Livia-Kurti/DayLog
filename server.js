// server.js (Express 5 Compatible)

// 1. Load environment variables
require('dotenv').config(); 

// 2. Import standard libraries
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose'); // <-- NEW: Import Mongoose

// 3. Create the app
const app = express();

// 4. Middleware
// We updated CORS to allow credentials (cookies/sessions) which your frontend api.js uses
app.use(cors({
  origin: true, 
  credentials: true 
}));
app.use(express.json());

// 5. Connect to MongoDB (NEW)
const dbURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/daylog';
mongoose.connect(dbURI)
  .then(() => console.log('Connected to MongoDB! 🌿'))
  .catch(err => console.error('Could not connect to MongoDB:', err));

// 6. Define Mongoose Schemas (NEW)
// This ensures data arriving from your frontend is formatted correctly
const entrySchema = new mongoose.Schema({
  userId: { type: String, default: null }, // null means anonymous
  date: { type: String, required: true },  // e.g., '2026-04-16'
  mood: Number,
  sleep: Number,
  breakfast: String,
}, { timestamps: true });

const Entry = mongoose.model('Entry', entrySchema);

// 7. Serve Static Files (Public Folder)
// Make sure your index.html, app.js, style.css, and frontend api.js are inside 'public'
app.use(express.static(path.join(__dirname, 'public')));

// 8. Connect API Routes (UPDATED)
// Replaced the anime routes. You will need to build out your auth/entry routes here 
// or in a separate file (e.g., const daylogRoutes = require("./routes/daylog.js")).
// Here is a quick example of the community fetch route to get you started:
app.get('/api/entries/community', async (req, res) => {
  try {
    const entries = await Entry.find({}, '-userId'); // Fetches all entries, hides user IDs
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch community entries." });
  }
});

// 9. THE FALLBACK (FIXED FOR EXPRESS 5)
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 10. Start Server
if (require.main === module) {
  // Swapped to port 3001 to match what your frontend api.js is expecting locally!
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
}

// Export for Vercel
module.exports = app;
