import express from 'express';
import { getDatabase } from '../db/init.js';

const router = express.Router();

// GET /api/notifications/dismissed
// Returns array of notification IDs dismissed by user
router.get('/dismissed', (req, res) => {
  try {
    const db = getDatabase();
    const rows = db.prepare('SELECT id FROM dismissedNotifications').all();
    const dismissedIds = rows.map((r) => r.id);
    res.json({
      success: true,
      dismissedIds,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// POST /api/notifications/dismiss
// Persist notification dismissal in SQLite
router.post('/dismiss', (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Notification id is required',
      });
    }

    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO dismissedNotifications (id, dismissedAt)
      VALUES (?, ?)
    `);
    stmt.run(id, new Date().toISOString());

    res.json({
      success: true,
      message: `Notification "${id}" dismissed and saved to DB`,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router;
