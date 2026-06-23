require('dotenv').config();
const { pool } = require('./db');

async function test() {
    try {
        const res = await pool.query("SELECT 1");
        console.log("DB Connection OK");
    } catch(e) {
        console.error("Connection error:", e);
    } finally {
        process.exit(0);
    }
}

test();
