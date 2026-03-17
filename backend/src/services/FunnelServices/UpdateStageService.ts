import Stage from "../../models/Stage";
import AppError from "../../errors/AppError";

interface Request {
  id: string | number;
  name: string;
  order: number;
}

const UpdateStageService = async ({ id, name, order }: Request): Promise<Stage> => {
  const stage = await Stage.findByPk(id);
  if (!stage) {
    throw new AppError("ERR_NO_STAGE_FOUND", 404);
  }
  await stage.update({ name, order });
  return stage;
};

export default UpdateStageService;
