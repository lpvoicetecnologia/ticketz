import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Funnels", "color", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "#A4A4A4"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Funnels", "color");
  }
};
