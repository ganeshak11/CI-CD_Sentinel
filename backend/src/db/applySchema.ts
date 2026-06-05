import { driver } from './index';
import fs from 'fs';
import path from 'path';

async function applySchema() {
  const schemaPath = path.join(__dirname, 'schema.cypher');
  const cypher = fs.readFileSync(schemaPath, 'utf8');

  // Split the file by semi-colons to execute each constraint/index command separately.
  // Lines starting with // are Cypher comments — they are filtered out.
  const commands = cypher
    .split(';')
    .map((cmd) => cmd.trim())
    .filter((cmd) => cmd.length > 0 && !cmd.startsWith('//'));

  const session = driver.session();
  try {
    console.log(`[Schema] Applying ${commands.length} constraints/indexes…`);
    for (const cmd of commands) {
      // Strip inline comments for cleaner log output
      const label = cmd.split('\n').filter((l) => !l.trim().startsWith('//'))[0]?.trim() ?? cmd;
      console.log(`[Schema] → ${label}`);
      await session.run(cmd);
    }
    console.log('[Schema] All constraints and indexes applied successfully.');
  } catch (error) {
    console.error('[Schema] Error applying Neo4j schema:', error);
    throw error; // Let the caller decide whether to exit
  } finally {
    await session.close();
  }
}

// Run standalone via: npx ts-node src/db/applySchema.ts
if (require.main === module) {
  applySchema()
    .then(() => {
      console.log('[Schema] Done.');
      return driver.close();
    })
    .catch(async (err) => {
      console.error('[Schema] Fatal:', err);
      await driver.close();
      process.exit(1);
    });
}

export { applySchema };
