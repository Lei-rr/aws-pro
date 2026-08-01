import type { FastifySchema } from 'fastify'
import {
  Type,
  type Static,
  type TBoolean,
  type TLiteral,
  type TObject,
  type TOptional,
  type TProperties,
  type TSchema,
  type TString,
  type TUnion,
} from 'typebox'

type Optionalize<Properties extends TProperties, Required extends readonly PropertyKey[]> = {
  [Key in keyof Properties]: Key extends Required[number] ? Properties[Key] : TOptional<Properties[Key]>
}

type NamedStrings<Names extends readonly string[]> = {
  [Name in Names[number]]: TString
}

export type RequestParts = {
  params?: TSchema
  querystring?: TSchema
  body?: TSchema
}

export type RequestOf<Schema> = (Schema extends { params: infer Params extends TSchema }
  ? { Params: Static<Params> }
  : object) &
  (Schema extends { querystring: infer Query extends TSchema } ? { Querystring: Static<Query> } : object) &
  (Schema extends { body: infer Body extends TSchema } ? { Body: Static<Body> } : object)

const successResponseSchema = Type.Object(
  {
    code: Type.Literal(0),
    message: Type.Literal('success'),
    data: Type.Unknown(),
  },
  { additionalProperties: false }
)
const standardResponses = { 200: successResponseSchema, 201: successResponseSchema }

export const text = (maxLength = 1024): TString => Type.String({ minLength: 1, maxLength })
export const optionalText = (maxLength = 1024): TString => Type.String({ maxLength })
export const bool: TBoolean = Type.Boolean()
export const boolQuery: TUnion<[TLiteral<'1'>, TLiteral<'0'>, TLiteral<'true'>, TLiteral<'false'>]> = Type.Union([
  Type.Literal('1'),
  Type.Literal('0'),
  Type.Literal('true'),
  Type.Literal('false'),
])
export const unsignedIntQuery: TString = Type.String({ pattern: '^[0-9]+$' })

export function objectSchema<Properties extends TProperties, const Required extends readonly (keyof Properties)[] = []>(
  properties: Properties,
  required: Required = [] as unknown as Required,
  additionalProperties = false
): TObject<Optionalize<Properties, Required>> {
  const optional = Object.fromEntries(
    Object.entries(properties).map(([name, schema]) => [name, required.includes(name) ? schema : Type.Optional(schema)])
  ) as Optionalize<Properties, Required>
  return Type.Object(optional, { additionalProperties })
}

export function paramsSchema<const Names extends readonly string[]>(...names: Names): TObject<NamedStrings<Names>> {
  const properties = Object.fromEntries(names.map((name) => [name, text(1024)])) as NamedStrings<Names>
  return Type.Object(properties, { additionalProperties: false })
}

export function requestSchema<const Parts extends RequestParts>(parts: Parts): Parts & FastifySchema {
  return { ...parts, response: standardResponses }
}

export const noRequestSchema = { response: standardResponses } satisfies FastifySchema
