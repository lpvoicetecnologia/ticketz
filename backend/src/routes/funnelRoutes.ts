import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as FunnelController from "../controllers/FunnelController";

const funnelRoutes = Router();

funnelRoutes.post("/funnels", isAuth, FunnelController.create);
funnelRoutes.get("/funnels", isAuth, FunnelController.index);
funnelRoutes.put("/funnels/:funnelId", isAuth, FunnelController.update);
funnelRoutes.delete("/funnels/:funnelId", isAuth, FunnelController.remove);

funnelRoutes.post("/funnels/:funnelId/stages", isAuth, FunnelController.createStage);
funnelRoutes.put("/stages/:stageId", isAuth, FunnelController.updateStage);
funnelRoutes.delete("/stages/:stageId", isAuth, FunnelController.removeStage);

export default funnelRoutes;
