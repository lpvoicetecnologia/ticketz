import Funnel from "../../models/Funnel";
import Tag from "../../models/Tag";

interface Request {
  companyId: number;
}

const ListFunnelsService = async ({ companyId }: Request): Promise<Funnel[]> => {
  const funnels = await Funnel.findAll({
    where: { companyId },
    include: [{ model: Tag, as: "stages" }],
    order: [
      ["name", "ASC"],
      [{ model: Tag, as: "stages" }, "kanban", "ASC"]
    ]
  });
  return funnels;
};

export default ListFunnelsService;
