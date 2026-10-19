import { applyDecorators, type PipeTransform } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import { z, type ZodType } from 'zod';

/** Valida y transforma el cuerpo con un esquema zod; los errores los traduce el filtro global. */
export class ZodPipe<T extends ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    return this.schema.parse(value);
  }
}

/** Documenta en OpenAPI el cuerpo a partir del mismo esquema zod que lo valida. */
export function ApiZodBody(schema: ZodType, description?: string): MethodDecorator {
  return applyDecorators(
    ApiBody({
      description,
      schema: z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as object,
    }),
  );
}
