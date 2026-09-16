import { Router } from "express";
import { resolveActiveActor } from "@/lib/auth/active-actor";
import { asyncHandler } from "@/lib/api/route";
import { transactionService } from "@/lib/services/transaction-service";

export const transactionsRouter = Router();

// GET /api/transactions - List all transactions for current user with metrics
transactionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const transactions = await transactionService.listUserTransactions(actor.id);
    const metrics = await transactionService.getTransactionMetrics(actor.id);

    return res.json({
      transactions,
      metrics,
    });
  })
);
