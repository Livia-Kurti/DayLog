// server.js (Express 5 Compatible)

// 1. Load environment variables
require('dotenv').config(); 

// 2. Import standard libraries
const express = require('express');
const cors = require('cors');
const path = require('path');

// 3. Import your routes
const animeRoutes = require("./routes/api.js"); 

// 4. Create the app
const app = express();

// 5. Middleware
app.use(cors());
app.use(express.json());

// 6. Serve Static Files (Public Folder)
app.use(express.static(path.join(__dirname, 'public')));

// 7. Connect API Routes
app.use("/api/anime", animeRoutes);

// 8. THE FALLBACK (FIXED FOR EXPRESS 5)
// We use a Regex /.*/ instead of '*' to prevent the PathError crash.
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 9. Start Server (Only listen if NOT on Vercel)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
}

// Export for Vercel
module.exports = app;
