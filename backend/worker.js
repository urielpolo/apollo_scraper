const Queue = require('bull');
const { Pool } = require('pg');
const { runScraper } = require('./apollo');

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const scraperQueue = new Queue('scraper', process.env.REDIS_URL);

async function addLog(job_id, message) {
  await db.query('INSERT INTO logs (job_id, message) VALUES ($1, $2)', [job_id, message]);
}

async function deductCredits(user_id, job_id, count) {
  // Deduct credits and check limit
  const { rows: [user] } = await db.query(
    'UPDATE users SET credits_used = credits_used + $1 WHERE id = $2 RETURNING credits_used, credits_limit',
    [count, user_id]
  );
  await db.query(
    'UPDATE jobs SET leads_exported = leads_exported + $1, updated_at = now() WHERE id = $2',
    [count, job_id]
  );
  return user.credits_used >= user.credits_limit;
}

scraperQueue.process(async (job) => {
  const { job_id, user_id, search_url, credits_remaining } = job.data;

  await db.query("UPDATE jobs SET status = 'running' WHERE id = $1", [job_id]);
  await addLog(job_id, '🚀 Scraper started');

  try {
    await runScraper({
      searchUrl: search_url,
      maxLeads: credits_remaining,
      onLog: (msg) => addLog(job_id, msg),
      onExported: async (count) => {
        const limitHit = await deductCredits(user_id, job_id, count);
        if (limitHit) throw new Error('Monthly credit limit reached');
      },
    });

    await db.query("UPDATE jobs SET status = 'done', updated_at = now() WHERE id = $1", [job_id]);
    await addLog(job_id, '✅ Scraper completed');
  } catch (err) {
    await db.query("UPDATE jobs SET status = 'failed', updated_at = now() WHERE id = $1", [job_id]);
    await addLog(job_id, `❌ Error: ${err.message}`);
  }
});

console.log('Worker listening for jobs...');