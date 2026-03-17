import AppError from "../../errors/AppError";
import Plan from "../../models/Plan";

interface PlanData {
  name: string;
  id?: number | string;
  users?: number;
  connections?: number;
  connectionsWhatsapp?: number;
  connectionsWhatsappCloud?: number;
  connectionsInstagram?: number;
  connectionsFacebook?: number;
  connectionsTelegram?: number;
  connectionsEmail?: number;
  connectionsWavoip?: number;
  queues?: number;
  value?: number;
  currency?: string;
  isPublic?: boolean;
}

const UpdatePlanService = async (planData: PlanData): Promise<Plan> => {
  const { id, name, users, connections, connectionsWhatsapp, connectionsWhatsappCloud, connectionsInstagram, connectionsFacebook, connectionsTelegram, connectionsEmail, connectionsWavoip, queues, value, currency, isPublic } =
    planData;

  const plan = await Plan.findByPk(id);

  if (!plan) {
    throw new AppError("ERR_NO_PLAN_FOUND", 404);
  }

  await plan.update({
    name,
    users,
    connections,
    connectionsWhatsapp,
    connectionsWhatsappCloud,
    connectionsInstagram,
    connectionsFacebook,
    connectionsTelegram,
    connectionsEmail,
    connectionsWavoip,
    queues,
    value,
    currency,
    isPublic
  });

  return plan;
};

export default UpdatePlanService;
