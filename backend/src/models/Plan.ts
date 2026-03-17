import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Unique,
  Default
} from "sequelize-typescript";

@Table
class Plan extends Model<Plan> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Unique
  @Column
  name: string;

  @Column
  users: number;

  @Column
  connections: number;

  @Column
  connectionsWhatsapp: number;

  @Column
  connectionsWhatsappCloud: number;

  @Column
  connectionsInstagram: number;

  @Column
  connectionsFacebook: number;

  @Column
  connectionsTelegram: number;

  @Column
  connectionsEmail: number;

  @Column
  connectionsWavoip: number;

  @Column
  queues: number;

  @Column
  value: number;

  @Column
  currency: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @Default(true)
  @Column
  isPublic: boolean;
}

export default Plan;
