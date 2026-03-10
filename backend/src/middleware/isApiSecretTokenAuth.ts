import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import Company from "../models/Company";

const isApiSecretTokenAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader ? authHeader.split(" ")[1] : null;

    const accessToken = req.headers["x-access-token"] as string || bearerToken;
    const secretToken = req.headers["x-secret-token"] as string;

    if (!accessToken || !secretToken) {
      throw new AppError("Acesso negado: tokens não fornecidos", 401);
    }

    const company = await Company.findOne({
      where: {
        apiAccessToken: accessToken,
        apiSecretToken: secretToken
      }
    });

    if (!company) {
      throw new AppError("Acesso restrito: credenciais inválidas", 403);
    }

    req.companyId = company.id;

    return next();
  } catch (err) {
    throw new AppError(err.message, 401);
  }
};

export default isApiSecretTokenAuth;
