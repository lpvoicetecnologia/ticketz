import { Request, Response } from "express";
import CreateFunnelService from "../services/FunnelServices/CreateFunnelService";
import ListFunnelsService from "../services/FunnelServices/ListFunnelsService";
import UpdateFunnelService from "../services/FunnelServices/UpdateFunnelService";
import DeleteFunnelService from "../services/FunnelServices/DeleteFunnelService";
import CreateTagService from "../services/TagServices/CreateService";
import UpdateTagService from "../services/TagServices/UpdateService";
import DeleteTagService from "../services/TagServices/DeleteService";
import { getIO } from "../libs/socket";
import ShowTagService from "../services/TagServices/ShowService";
import AppError from "../errors/AppError";

export const create = async (req: Request, res: Response): Promise<Response> => {
  const { name, type, color } = req.body;
  const { companyId } = req.user;

  const funnel = await CreateFunnelService({ name, type: type || "ticket", color, companyId });

  return res.status(201).json(funnel);
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const funnels = await ListFunnelsService({ companyId });

  return res.status(200).json(funnels);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const { funnelId } = req.params;
  const { name, type, color } = req.body;
  const { companyId } = req.user;

  const funnel = await UpdateFunnelService({ id: funnelId, name, type, color, companyId });

  return res.status(200).json(funnel);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { funnelId } = req.params;
  const { companyId } = req.user;

  await DeleteFunnelService({ id: funnelId, companyId });

  return res.status(200).json({ message: "Funil deletado com sucesso" });
};

export const createStage = async (req: Request, res: Response): Promise<Response> => {
  const { funnelId } = req.params;
  const { name, order, commands, tagId } = req.body;
  const { companyId } = req.user;

  let stage;

  if (tagId) {
    const existingTag = await ShowTagService(Number(tagId), companyId);

    if (existingTag.funnelId && Number(existingTag.funnelId) !== Number(funnelId)) {
      throw new AppError("Tag já está associada a outro funil", 400);
    }

    stage = await UpdateTagService({
      tagData: {
        funnelId: Number(funnelId),
        kanban: Number.isInteger(order) ? order : 0,
        commands:
          commands !== undefined
            ? typeof commands === "string"
              ? commands
              : JSON.stringify(commands)
            : existingTag.commands
      },
      id: Number(tagId),
      companyId
    });
  } else {
    if (!name) {
      throw new AppError("Nome da etapa é obrigatório", 400);
    }

    // Stages are Tags. We default color to gray if none is provided via Funnel settings.
    stage = await CreateTagService({
      name,
      color: "#A4A4A4",
      kanban: Number.isInteger(order) ? order : 0,
      companyId,
      funnelId: Number(funnelId),
      commands: commands ? JSON.stringify(commands) : undefined
    });
  }

  const io = getIO();
  io.to(`company-${companyId}-mainchannel`).emit("tag", {
    action: "create",
    tag: stage
  });

  return res.status(201).json(stage);
};

export const updateStage = async (req: Request, res: Response): Promise<Response> => {
  const { stageId } = req.params;
  const { name, order, commands } = req.body;
  const { companyId } = req.user;

  const stage = await UpdateTagService({ 
    tagData: { 
      id: Number(stageId), 
      name, 
      kanban: order,
      commands: commands !== undefined ? (typeof commands === "string" ? commands : JSON.stringify(commands)) : undefined
    },
    id: Number(stageId), 
    companyId 
  });

  const io = getIO();
  io.to(`company-${companyId}-mainchannel`).emit("tag", {
    action: "update",
    tag: stage
  });

  return res.status(200).json(stage);
};

export const removeStage = async (req: Request, res: Response): Promise<Response> => {
  const { stageId } = req.params;
  const { companyId } = req.user;

  await DeleteTagService(Number(stageId), companyId);

  const io = getIO();
  io.to(`company-${companyId}-mainchannel`).emit("tag", {
    action: "delete",
    tagId: stageId
  });

  return res.status(200).json({ message: "Etapa deletada com sucesso" });
};
