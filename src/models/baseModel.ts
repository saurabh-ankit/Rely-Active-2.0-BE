import { Column, DataType, Model, PrimaryKey } from "sequelize-typescript";

/**
 * Shared UUID primary key for every model. `timestamps`/`paranoid` are
 * declared per-model via the `@Table` decorator (see individual models) —
 * sequelize-typescript does not support inheriting decorator-driven table
 * options, so each model states its own `timestamps: true, paranoid: true`.
 */
 
export abstract class BaseModel<
  TAttributes extends object = any,
  TCreationAttributes extends object = TAttributes,
> extends Model<TAttributes, TCreationAttributes> {
  @PrimaryKey
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4 })
  declare id: string;
}
