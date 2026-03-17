import { Op, Sequelize } from "sequelize";
import Tag from "../../models/Tag";
import Funnel from "../../models/Funnel";

interface Request {
  companyId: number;
  searchParam?: string;
}

const ListService = async ({
  companyId,
  searchParam
}: Request): Promise<Tag[]> => {
  let whereCondition = {};

  if (searchParam) {
    whereCondition = {
      [Op.or]: [
        { name: { [Op.like]: `%${searchParam}%` } },
        { color: { [Op.like]: `%${searchParam}%` } },
        // { kanban: { [Op.like]: `%${searchParam}%` } }
      ]
    };
  }

  const tags = await Tag.findAll({
    where: { ...whereCondition, companyId },
    include: [
      {
        model: Funnel,
        as: "funnel",
        attributes: ["id", "name", "type", "color"],
        required: false
      }
    ],
    order: [["name", "ASC"]]
  });

  return tags;
};

export default ListService;
