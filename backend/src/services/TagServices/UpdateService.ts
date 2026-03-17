import * as Yup from "yup";

import AppError from "../../errors/AppError";
import Tag from "../../models/Tag";
import ShowService from "./ShowService";

interface TagData {
  id?: number;
  name?: string;
  color?: string;
  kanban?: number;
  funnelId?: number;
  commands?: string;
}

interface Request {
  tagData: TagData;
  id: number;
  companyId: number;
}

const UpdateUserService = async ({
  tagData,
  id,
  companyId
}: Request): Promise<Tag | undefined> => {
  const tag = await ShowService(id, companyId);

  const schema = Yup.object().shape({
    name: Yup.string().min(3)
  });

  const { name, color, kanban, funnelId, commands } = tagData;

  try {
    await schema.validate({ name });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  await tag.update({
    name,
    color,
    kanban,
    funnelId,
    commands
  });

  await tag.reload();
  return tag;
};

export default UpdateUserService;
