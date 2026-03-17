import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.addColumn("Tickets", "funnelId", {
        type: DataTypes.INTEGER,
        references: { model: "Funnels", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      }),
      queryInterface.addColumn("Tickets", "stageId", {
        type: DataTypes.INTEGER,
        references: { model: "Stages", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      })
    ]);
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeColumn("Tickets", "funnelId"),
      queryInterface.removeColumn("Tickets", "stageId")
    ]);
  }
};
