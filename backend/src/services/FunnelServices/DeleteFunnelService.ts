import Funnel from "../../models/Funnel";
import AppError from "../../errors/AppError";

interface Request {
  id: string | number;
  companyId: number;
}

const DeleteFunnelService = async ({ id, companyId }: Request): Promise<void> => {
  const funnel = await Funnel.findOne({ where: { id, companyId } });
  if (!funnel) {
    throw new AppError("ERR_NO_FUNNEL_FOUND", 404);
  }
  await funnel.destroy();
};

export default DeleteFunnelService;
