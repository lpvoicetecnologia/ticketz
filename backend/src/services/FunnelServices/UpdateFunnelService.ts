import Funnel from "../../models/Funnel";
import AppError from "../../errors/AppError";

interface Request {
  id: string | number;
  name: string;
  type?: string;
  color?: string;
  companyId: number;
}

const UpdateFunnelService = async ({ id, name, type, color, companyId }: Request): Promise<Funnel> => {
  const funnel = await Funnel.findOne({ where: { id, companyId } });
  if (!funnel) {
    throw new AppError("ERR_NO_FUNNEL_FOUND", 404);
  }
  await funnel.update({ name, ...(type && { type }), ...(color && { color }) });
  return funnel;
};

export default UpdateFunnelService;
