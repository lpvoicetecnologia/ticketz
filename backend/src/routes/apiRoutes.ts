import { Router } from "express";
import isApiSecretTokenAuth from "../middleware/isApiSecretTokenAuth";
import isCompliant from "../middleware/isCompliant";
import * as ApiController from "../controllers/ApiController";

const apiRoutes = Router();

apiRoutes.post("/api/tickets/start", isApiSecretTokenAuth, isCompliant, ApiController.startConversation);

export default apiRoutes;
