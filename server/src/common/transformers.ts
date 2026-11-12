import { ValueTransformer } from 'typeorm';

export const jsonTransformer: ValueTransformer = {
  to: (value: unknown) => (value == null ? null : JSON.stringify(value)),
  from: (value: string | null) => (value == null ? null : JSON.parse(value)),
};
