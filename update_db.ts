import { initDb, closeDb } from './api/db';

async function main() {
  console.log('Starting database update...');
  try {
    initDb();
    console.log('Database updated successfully.');
  } catch (error) {
    console.error('Error updating database:', error);
  } finally {
    closeDb();
  }
}

main();
