import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Funnels", "type", {
      type: DataTypes.ENUM("ticket", "contact"),
      allowNull: false,
      defaultValue: "ticket"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Funnels", "type");
  }
};
