import type { Model, ModelSchema } from "@/types/model";
import {
  getRequestSchemaFromModel,
  normalizePayloadArrays,
  schemaToFormFields,
  type FormFieldConfig,
} from "@/lib/schemaToForm";

export function getModelRequestSchema(model: Model): ModelSchema | null {
  return getRequestSchemaFromModel(model);
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
      isEmptyObject(value) ||
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
function isEmptyObject(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) return true;
  return keys.every((key) => {
    const item = record[key];
    if (item === "" || item === undefined || item === null) return true;
    if (Array.isArray(item)) return item.length === 0;
    if (typeof item === "object") return isEmptyObject(item);
    return false;
  });
}
