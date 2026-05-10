/**
 * Schema tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

export const schemaTools = [
  {
    name: 'hookbase_list_schemas',
    description: 'List JSON Schema definitions in the organization. Schemas validate event payloads on routes and reject malformed deliveries.',
    inputSchema: z.object({}).strict(),
    handler: async () => {
      const result = await api.getSchemas();
      if (result.error) return { error: result.error };
      return { schemas: result.data?.schemas };
    },
  },
  {
    name: 'hookbase_get_schema',
    description: 'Get a JSON Schema definition (parsed as an object).',
    inputSchema: z.object({
      schema_id: z.string().describe('Schema ID or slug'),
    }).strict(),
    handler: async (args: { schema_id: string }) => {
      const result = await api.getSchema(args.schema_id);
      if (result.error) return { error: result.error };
      return { schema: result.data?.schema };
    },
  },
  {
    name: 'hookbase_create_schema',
    description: 'Create a JSON Schema. Requires the "schemas" feature on the org plan. The slug is derived from the name.',
    inputSchema: z.object({
      name: z.string(),
      description: z.string().optional(),
      json_schema: z.record(z.string(), z.unknown()).describe('A valid JSON Schema object'),
    }).strict(),
    handler: async (args: {
      name: string;
      description?: string;
      json_schema: Record<string, unknown>;
    }) => {
      const result = await api.createSchema({
        name: args.name,
        description: args.description,
        jsonSchema: args.json_schema,
      });
      if (result.error) return { error: result.error };
      return { message: 'Schema created', schema: result.data?.schema };
    },
  },
  {
    name: 'hookbase_update_schema',
    description: 'Update a schema. Pass any subset of name/description/json_schema. Uses HTTP PUT under the hood.',
    inputSchema: z.object({
      schema_id: z.string(),
      name: z.string().optional(),
      description: z.string().nullable().optional(),
      json_schema: z.record(z.string(), z.unknown()).optional(),
    }).strict(),
    handler: async (args: {
      schema_id: string;
      name?: string;
      description?: string | null;
      json_schema?: Record<string, unknown>;
    }) => {
      const result = await api.updateSchema(args.schema_id, {
        name: args.name,
        description: args.description,
        jsonSchema: args.json_schema,
      });
      if (result.error) return { error: result.error };
      return { message: 'Schema updated' };
    },
  },
  {
    name: 'hookbase_delete_schema',
    description: 'Delete a schema. Routes referencing it will have the reference cleared.',
    inputSchema: z.object({
      schema_id: z.string(),
    }).strict(),
    handler: async (args: { schema_id: string }) => {
      const result = await api.deleteSchema(args.schema_id);
      if (result.error) return { error: result.error };
      return { message: 'Schema deleted' };
    },
  },
  {
    name: 'hookbase_validate_against_schema',
    description: 'Validate a sample payload against a stored schema and return any validation errors.',
    inputSchema: z.object({
      schema_id: z.string(),
      payload: z.unknown(),
    }).strict(),
    handler: async (args: { schema_id: string; payload: unknown }) => {
      const result = await api.validateAgainstSchema(args.schema_id, args.payload);
      if (result.error) return { error: result.error };
      return result.data;
    },
  },
];
