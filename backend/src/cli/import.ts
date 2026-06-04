#!/usr/bin/env ts-node
/**
 * cli/import.ts — Bulk Service Import CLI
 *
 * Usage:
 *   npx ts-node src/cli/import.ts --file sentinel-services.yml
 *   npm run import -- --file sentinel-services.yml
 *
 * Reads a sentinel-services.yml file, validates it, and creates all
 * Service nodes + DEPENDS_ON relationships in a single Neo4j transaction.
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env before importing DB driver
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { driver } from '../db/index';
import { bulkCreateServices } from '../services/graphService';

// ─── CLI Argument Parsing ────────────────────────────────────────────────────

function parseArgs(): string {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf('--file');

  if (fileIndex === -1 || !args[fileIndex + 1]) {
    console.error('Usage: sentinel import --file <path-to-sentinel-services.yml>');
    console.error('');
    console.error('Example:');
    console.error('  npx ts-node src/cli/import.ts --file ../sentinel-services.example.yml');
    process.exit(1);
  }

  return args[fileIndex + 1];
}

// ─── YAML Validation Schema ─────────────────────────────────────────────────

const bulkServiceSchema = z.object({
  services: z.array(
    z.object({
      name: z.string().min(1, 'Service name is required'),
      repo: z
        .string()
        .min(1, 'Repo is required')
        .regex(/^[^/]+\/[^/]+$/, 'Must be in org/repo format'),
      health_url: z.string().url('Health URL must be a valid URL'),
      environment: z.string().optional(),
      path_filter: z.string().optional(),
      dependencies: z.array(z.string()).optional(),
      rollback_strategy: z.enum(['rerun', 'workflow_dispatch']).optional(),
    })
  ),
});

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const filePath = parseArgs();
  const resolvedPath = path.resolve(filePath);

  // 1. Read file
  console.log(`\n📂 Reading: ${resolvedPath}`);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const rawYaml = fs.readFileSync(resolvedPath, 'utf8');

  // 2. Parse YAML
  let parsed: unknown;
  try {
    parsed = yaml.load(rawYaml);
  } catch (err: any) {
    console.error(`❌ Invalid YAML: ${err.message}`);
    process.exit(1);
  }

  // 3. Validate structure
  const validated = bulkServiceSchema.safeParse(parsed);
  if (!validated.success) {
    console.error('❌ Validation errors:');
    for (const issue of validated.error.issues) {
      console.error(`   • ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  const services = validated.data.services;
  console.log(`✅ Parsed ${services.length} service(s) from YAML\n`);

  // 4. Connect to Neo4j
  try {
    await driver.verifyConnectivity();
    console.log('🔗 Connected to Neo4j\n');
  } catch (err: any) {
    console.error(`❌ Failed to connect to Neo4j: ${err.message}`);
    console.error('   Make sure Neo4j is running: docker compose up -d neo4j');
    process.exit(1);
  }

  // 5. Bulk import
  console.log('🚀 Importing services...\n');
  const result = await bulkCreateServices(services);

  // 6. Report
  console.log('─'.repeat(50));
  console.log('📊 Import Summary');
  console.log('─'.repeat(50));
  console.log(`   Services created:       ${result.created}`);
  console.log(`   Services updated:       ${result.updated}`);
  console.log(`   Dependencies linked:    ${result.dependenciesLinked}`);

  if (result.errors.length > 0) {
    console.log(`   ⚠️  Errors:              ${result.errors.length}`);
    for (const err of result.errors) {
      console.log(`      • ${err.service}: ${err.error}`);
    }
  } else {
    console.log(`   Errors:                 0`);
  }

  console.log('─'.repeat(50));
  console.log('\n✅ Import complete!\n');
}

main()
  .catch((err) => {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await driver.close();
  });
