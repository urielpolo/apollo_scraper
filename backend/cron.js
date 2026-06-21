const cron = require('node-cron');
const { Pool } = require('pg');

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Runs at midnight on the 1st of every month
cron.schedule('0 0 1 * *', async () => {
  await db.query(`
    UPDATE users
    SET credits_used = 0,
        credits_reset_at = date_trunc('month', now()) + interval '1 month'
  `);
  console.log('✅ Credits reset for all users');
});