import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tickets", "funnelId");
    await queryInterface.removeColumn("Tickets", "stageId");

    await queryInterface.dropTable("Stages");
  },

  down: async (queryInterface: QueryInterface) => {
    console.log("Cannot revert dropping kanban legacy columns easily because data is lost");
    // Not critical to write a down function for this feature change
  }
};
