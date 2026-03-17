import Stage from "../../models/Stage";
import AppError from "../../errors/AppError";

interface Request {
  id: string | number;
}

const DeleteStageService = async ({ id }: Request): Promise<void> => {
  const stage = await Stage.findByPk(id);
  if (!stage) {
    throw new AppError("ERR_NO_STAGE_FOUND", 404);
  }
  await stage.destroy();
};

export default DeleteStageService;
