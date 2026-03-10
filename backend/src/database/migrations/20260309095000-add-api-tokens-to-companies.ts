import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Companies", "apiAccessToken", {
      type: DataTypes.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("Companies", "apiSecretToken", {
      type: DataTypes.STRING,
      allowNull: true,
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Companies", "apiAccessToken");
    await queryInterface.removeColumn("Companies", "apiSecretToken");
  }
};
