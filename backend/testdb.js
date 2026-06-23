const db = require('./db');

async function test() {
    try {
        await db.initializeDatabase();
        console.log("Success");
    } catch(e) {
        console.error("Caught error:", e);
    } finally {
        process.exit(0);
    }
}

test();
