import { Router } from "express";
import { z } from "zod";
import { resolveActiveActor } from "@/lib/auth/active-actor";
import { asyncHandler, parseWithSchema, sendSuccess } from "@/lib/api/route";
import { clientService } from "@/lib/services/client-service";

export const clientMastersRouter = Router();

const clientItemSchema = z.object({
  id: z.string().optional(),
  clientName: z.string().min(1, "Client name is required").max(60, "Client name too long"),
  companyEmail: z.string().regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, "Please enter a valid email address").nullable().optional().or(z.literal("")),
  _isNew: z.boolean().optional(),
  _isDeleted: z.boolean().optional(),
});

const batchSaveSchema = z.object({
  clients: z.array(clientItemSchema),
});

// GET /api/client-masters - Fetch current user's client master records
clientMastersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const clients = await clientService.listClientMasters(actor.id);
    return res.json({ clients });
  })
);

// POST /api/client-masters - Create single or batch sync
clientMastersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);

    if (Array.isArray(req.body?.clients)) {
      const parsed = parseWithSchema(batchSaveSchema, req.body);
      const clients = await clientService.batchSaveClientMasters(actor.id, parsed.clients);
      return res.json({ clients });
    }

    const parsed = parseWithSchema(clientItemSchema, req.body);
    const created = await clientService.createClientMaster(actor.id, {
      clientName: parsed.clientName,
      companyEmail: parsed.companyEmail || null,
    });
    return res.status(201).json({ client: created });
  })
);

// PATCH /api/client-masters/:id - Update client record
clientMastersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const parsed = parseWithSchema(clientItemSchema.partial(), req.body);
    const updated = await clientService.updateClientMaster(actor.id, (req.params.id as string), {
      clientName: parsed.clientName,
      companyEmail: parsed.companyEmail !== undefined ? (parsed.companyEmail || null) : undefined,
    });
    return res.json({ client: updated });
  })
);

// DELETE /api/client-masters/:id - Delete client record
clientMastersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    await clientService.deleteClientMaster(actor.id, (req.params.id as string));
    return res.json({ success: true });
  })
);
