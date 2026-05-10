/**
 * Transform tools for MCP server
 */

import { z } from 'zod';
import * as api from '../lib/api.js';

const transformTypeEnum = z.enum(['jsonata', 'xslt', 'liquid', 'javascript']);
const contentFormatEnum = z.enum(['json', 'xml', 'text']);

export const transformTools = [
  {
    name: 'hookbase_list_transforms',
    description: 'List transform definitions. Transforms reshape an event payload before delivery (JSONata, XSLT, Liquid, or JavaScript).',
    inputSchema: z.object({
      page: z.number().optional(),
      page_size: z.number().optional(),
    }).strict(),
    handler: async (args: { page?: number; page_size?: number }) => {
      const result = await api.getTransforms({ page: args.page, pageSize: args.page_size });
      if (result.error) return { error: result.error };
      return { transforms: result.data?.transforms, pagination: result.data?.pagination };
    },
  },
  {
    name: 'hookbase_get_transform',
    description: 'Get a transform definition including its source code, language, and input/output formats.',
    inputSchema: z.object({
      transform_id: z.string().describe('Transform ID or slug'),
    }).strict(),
    handler: async (args: { transform_id: string }) => {
      const result = await api.getTransform(args.transform_id);
      if (result.error) return { error: result.error };
      return { transform: result.data?.transform };
    },
  },
  {
    name: 'hookbase_create_transform',
    description: 'Create a transform that reshapes payloads. The code is validated server-side before being saved. Requires the "transforms" feature on the org plan.',
    inputSchema: z.object({
      name: z.string(),
      slug: z.string().optional(),
      description: z.string().optional(),
      code: z.string().describe('Transform expression / source. JSONata is the default.'),
      transform_type: transformTypeEnum.optional().describe('Default: jsonata'),
      input_format: contentFormatEnum.optional().describe('Default: json'),
      output_format: contentFormatEnum.optional().describe('Default: json'),
    }).strict(),
    handler: async (args: {
      name: string;
      slug?: string;
      description?: string;
      code: string;
      transform_type?: api.TransformType;
      input_format?: api.ContentFormat;
      output_format?: api.ContentFormat;
    }) => {
      const result = await api.createTransform({
        name: args.name,
        slug: args.slug,
        description: args.description,
        code: args.code,
        transformType: args.transform_type,
        inputFormat: args.input_format,
        outputFormat: args.output_format,
      });
      if (result.error) return { error: result.error };
      return { message: 'Transform created', transform: result.data?.transform };
    },
  },
  {
    name: 'hookbase_update_transform',
    description: 'Update a transform. If `code` changes it is re-validated server-side.',
    inputSchema: z.object({
      transform_id: z.string(),
      name: z.string().optional(),
      description: z.string().nullable().optional(),
      code: z.string().optional(),
      transform_type: transformTypeEnum.optional(),
      input_format: contentFormatEnum.optional(),
      output_format: contentFormatEnum.optional(),
      is_active: z.boolean().optional(),
    }).strict(),
    handler: async (args: {
      transform_id: string;
      name?: string;
      description?: string | null;
      code?: string;
      transform_type?: api.TransformType;
      input_format?: api.ContentFormat;
      output_format?: api.ContentFormat;
      is_active?: boolean;
    }) => {
      const result = await api.updateTransform(args.transform_id, {
        name: args.name,
        description: args.description,
        code: args.code,
        transformType: args.transform_type,
        inputFormat: args.input_format,
        outputFormat: args.output_format,
        isActive: args.is_active,
      });
      if (result.error) return { error: result.error };
      return { message: 'Transform updated' };
    },
  },
  {
    name: 'hookbase_delete_transform',
    description: 'Delete a transform. Routes referencing it will have the reference cleared.',
    inputSchema: z.object({
      transform_id: z.string(),
    }).strict(),
    handler: async (args: { transform_id: string }) => {
      const result = await api.deleteTransform(args.transform_id);
      if (result.error) return { error: result.error };
      return { message: 'Transform deleted' };
    },
  },
  {
    name: 'hookbase_test_transform',
    description: 'Run a transform expression against a sample payload without saving. Useful for iterating on JSONata/XSLT/Liquid/JS code.',
    inputSchema: z.object({
      code: z.string(),
      payload: z.unknown().describe('Sample payload (object/string depending on input_format)'),
      transform_type: transformTypeEnum.optional(),
      input_format: contentFormatEnum.optional(),
      output_format: contentFormatEnum.optional(),
    }).strict(),
    handler: async (args: {
      code: string;
      payload: unknown;
      transform_type?: api.TransformType;
      input_format?: api.ContentFormat;
      output_format?: api.ContentFormat;
    }) => {
      const result = await api.testTransform({
        code: args.code,
        payload: args.payload,
        transformType: args.transform_type,
        inputFormat: args.input_format,
        outputFormat: args.output_format,
      });
      if (result.error) return { error: result.error };
      return result.data;
    },
  },
];
