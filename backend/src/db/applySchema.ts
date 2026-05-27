import { driver } from './index';
import fs from 'fs';
import path from 'path';

async function applySchema() {
  const schemaPath = path.join(__dirname, 'schema.cypher');
  const cypher = fs.readFileSync(schemaPath, 'utf8');

  // Split the file by semi-colons to execute each constraint/index command separately
  const commands = cypher
    .split(';')
    .map((cmd) => cmd.trim())
    .filter((cmd) => cmd.length > 0 && !cmd.startsWith('//'));

  const session = driver.session();
  try {
    console.log(`Starting Neo4j schema application (${commands.length} commands)...`);
    for (const cmd of commands) {
      console.log(`Executing: ${cmd}`);
      await session.run(cmd);
    }
    console.log('Neo4j schema applied successfully.');
  } catch (error) {
    console.error('Error applying Neo4j schema:', error);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

// Run if called directly via ts-node
if (require.main === module) {
  applySchema();
}

export { applySchema };
