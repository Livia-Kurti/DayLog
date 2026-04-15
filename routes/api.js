// api.js - Handles all CRUD operations for the anime list

const express = require('express');
const { PrismaClient, AnimeStatus } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();
const VALID_STATUSES = Object.keys(AnimeStatus);

// ===============================================
// READ: GET /api/anime/mylist (View MyList Page)
// ===============================================
router.get('/mylist', async (req, res) => {
    const { status } = req.query; 
    const filter = {};
    
    // Only apply filter if status is valid
    if (status && VALID_STATUSES.includes(status)) {
        filter.status = status;
    }

    try {
        const list = await prisma.singleAnimeList.findMany({
            where: filter,
            orderBy: { updatedAt: 'desc' },
        });
        res.json(list);
    } catch (error) {
        console.error("Error fetching list:", error);
        res.status(500).json({ msg: "Failed to load list." });
    }
});

// ===============================================
// CREATE/UPDATE: POST /api/anime
// ===============================================
router.post('/', async (req, res) => {
    const { jikanId, title, image, status } = req.body;

    // Validate input
    if (!jikanId || !title || !VALID_STATUSES.includes(status)) {
        console.error("Invalid input:", req.body);
        return res.status(400).json({ msg: "Invalid or missing data." });
    }

    try {
        // Upsert: If anime exists by jikanId, update status. If not, create it.
        const listEntry = await prisma.singleAnimeList.upsert({
            where: { jikanId: jikanId },
            update: { status: status, updatedAt: new Date() },
            create: {
                jikanId: jikanId,
                title: title,
                image: image || '',
                status: status,
            },
        });
        res.status(201).json({ msg: 'List status updated.', entry: listEntry });
    } catch (error) {
        console.error("Error creating/updating list:", error);
        res.status(500).json({ msg: 'Failed to process list entry.' });
    }
});

// ===============================================
// UPDATE: PUT /api/anime/:id (Update Status)
// ===============================================
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!id || !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ msg: "Invalid ID or status." });
    }

    try {
        const updatedEntry = await prisma.singleAnimeList.update({
            where: { id: id },
            data: { status: status, updatedAt: new Date() },
        });
        res.json({ msg: 'List entry updated.', entry: updatedEntry });
    } catch (error) {
        console.error("Error updating list entry:", error);
        res.status(500).json({ msg: 'Failed to update list entry.' });
    }
});

// ===============================================
// DELETE: DELETE /api/anime/:id (Remove from List)
// ===============================================
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await prisma.singleAnimeList.delete({
            where: { id: id },
        });
        res.status(204).send();
    } catch (error) {
        console.error("Error deleting list entry:", error);
        res.status(500).json({ msg: 'Failed to delete list entry.' });
    }
});

module.exports = router;