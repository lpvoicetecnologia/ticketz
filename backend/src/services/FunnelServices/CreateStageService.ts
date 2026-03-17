import Stage from "../../models/Stage";

interface Request {
  name: string;
  funnelId: number;
  order: number;
}

const CreateStageService = async ({ name, funnelId, order }: Request): Promise<Stage> => {
  const stage = await Stage.create({ name, funnelId, order });
  return stage;
};

export default CreateStageService;
