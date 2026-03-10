import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Plans", "connectionsWhatsapp", {
      type: DataTypes.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn("Plans", "connectionsWhatsappCloud", {
      type: DataTypes.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn("Plans", "connectionsInstagram", {
      type: DataTypes.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn("Plans", "connectionsTelegram", {
      type: DataTypes.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn("Plans", "connectionsEmail", {
      type: DataTypes.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn("Plans", "connectionsWavoip", {
      type: DataTypes.INTEGER,
      allowNull: true,
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Plans", "connectionsWhatsapp");
    await queryInterface.removeColumn("Plans", "connectionsWhatsappCloud");
    await queryInterface.removeColumn("Plans", "connectionsInstagram");
    await queryInterface.removeColumn("Plans", "connectionsTelegram");
    await queryInterface.removeColumn("Plans", "connectionsEmail");
    await queryInterface.removeColumn("Plans", "connectionsWavoip");
  }
};
