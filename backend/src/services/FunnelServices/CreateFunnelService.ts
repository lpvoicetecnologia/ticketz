import Funnel from "../../models/Funnel";

interface Request {
  name: string;
  type: string;
  color?: string;
  companyId: number;
}

const CreateFunnelService = async ({ name, type, color, companyId }: Request): Promise<Funnel> => {
  const funnel = await Funnel.create({ name, type: type || "ticket", color, companyId });
  return funnel;
};

export default CreateFunnelService;
