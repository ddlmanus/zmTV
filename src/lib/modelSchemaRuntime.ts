import type { Model, ModelSchema } from "@/types/model";
import {
  normalizePayloadArrays,
  schemaToFormFields,
  type FormFieldConfig,
} from "@/lib/schemaToForm";

export function getModelRequestSchema(model: Model): ModelSchema | null {
  const schemas = model.api_schema?.api_schemas;
  const requestSchema = schemas?.find(
    (schema) => String(schema.type || "").toLowerCase() === "model_run",
  )?.request_schema;

  if (!requestSchema?.properties) return null;
  return requestSchema;
}

export function extractModelFormFields(model: Model): FormFieldConfig[] {
  const requestSchema = getModelRequestSchema(model);
  if (!requestSchema) return [];

  return schemaToFormFields(
    requestSchema.properties,
    requestSchema.required || [],
    requestSchema["x-order-properties"],
  );
}

export function filterValuesForModelFields(
  values: Record<string, unknown>,
  fields: FormFieldConfig[],
): Record<string, unknown> {
  const allowed = new Set(fields.map((field) => field.name));
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => allowed.has(key)),
  );
}

export function buildNormalizedModelInput(
  values: Record<string, unknown>,
  fields: FormFieldConfig[],
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  const allowed = new Set(fields.map((field) => field.name));
  const integerFields = new Set(
    fields
      .filter((field) => field.schemaType === "integer")
      .map((field) => field.name),
  );

  for (const [key, value] of Object.entries(values)) {
    if (!allowed.has(key)) continue;
    if (
      value === "" ||
      value === undefined ||
      value === null ||
      (Array.isArray(value) && value.length === 0)
    ) {
      continue;
    }

    input[key] =
      integerFields.has(key) && typeof value === "number"
        ? Math.round(value)
        : value;
  }

  return normalizePayloadArrays(input, fields);
}
