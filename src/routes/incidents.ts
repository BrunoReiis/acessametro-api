import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { AuthRequest, requireAdmin, requireAuth } from '../middleware/auth';

const router = Router();

/**
 * @openapi
 * /api/incidents:
 *   get:
 *     summary: Lista incidentes
 *     tags: [Incidents]
 *     responses:
 *       200:
 *         description: Lista de incidentes
 */
const createIncidentSchema = z.object({
  title: z.string().min(3).max(150),
  description: z.string().min(10).max(2000),
  category: z.enum(['ELEVATOR', 'ESCALATOR', 'ACCESSIBILITY', 'SAFETY', 'OTHER']),
  stationId: z.string().min(1),
  reporterName: z.string().min(2).max(100).optional(),
  userId: z.string().optional(),
});

router.get('/', async (_req, res, next) => {
  try {
    const incidents = await prisma.incident.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        station: true,
        user: true,
      },
    });

    return res.json({ success: true, data: incidents });
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /api/incidents:
 *   post:
 *     summary: Cria um incidente autenticado
 *     tags: [Incidents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description, category, stationId]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [ELEVATOR, ESCALATOR, ACCESSIBILITY, SAFETY, OTHER]
 *               stationId:
 *                 type: string
 *               reporterName:
 *                 type: string
 *     responses:
 *       201:
 *         description: Incidente criado
 */
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const data = createIncidentSchema.parse(req.body);

    const station = await prisma.station.findUnique({
      where: { id: data.stationId },
    });

    if (!station) {
      return res.status(404).json({ success: false, message: 'Estação não encontrada.' });
    }

    const incident = await prisma.incident.create({
      data: {
        title: data.title,
        description: data.description,
        category: data.category,
        reporterName: data.reporterName,
        stationId: data.stationId,
        userId: req.user?.id ?? data.userId,
      },
      include: {
        station: true,
        user: true,
      },
    });

    return res.status(201).json({ success: true, data: incident });
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /api/incidents/{id}/status:
 *   patch:
 *     summary: Atualiza o status de um incidente
 *     tags: [Incidents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, IN_PROGRESS, RESOLVED, REJECTED]
 *     responses:
 *       200:
 *         description: Status atualizado
 */
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const statusSchema = z.object({
      status: z.enum(['PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED']),
    });

    const { status } = statusSchema.parse(req.body);
    const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const incident = await prisma.incident.update({
      where: { id: incidentId },
      data: { status },
      include: {
        station: true,
        user: true,
      },
    });

    return res.json({ success: true, data: incident });
  } catch (error) {
    return next(error);
  }
});

export { router as incidentRouter };
