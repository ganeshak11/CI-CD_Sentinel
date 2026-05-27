import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
const user = process.env.NEO4J_USERNAME || 'neo4j';
const password = process.env.NEO4J_PASSWORD || 'sentinel_password';

export const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

// Utility function to execute a query easily across the codebase
export const executeQuery = async (query: string, params: Record<string, any> = {}) => {
  const session = driver.session();
  try {
    const result = await session.run(query, params);
    return result;
  } finally {
    await session.close();
  }
};
