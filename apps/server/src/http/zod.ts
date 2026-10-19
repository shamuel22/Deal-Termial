import { applyDecorators } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import { z, type ZodType } from 'zod';

/** Documenta en OpenAPI el cuerpo a partir del mismo esquema zod que lo valida. */
export function ApiZodBody(schema: ZodType, description?: string): MethodDecorator {
  return applyDecorators(
    ApiBody({
      description,
      schema: z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as object,
    }),
  );
}
