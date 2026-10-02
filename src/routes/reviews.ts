import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { AuthRequest, requireAuth } from '../middleware/auth';

const router = Router();

/**
 * @openapi
 * /api/reviews:
 *   get:
 *     summary: Lista avaliações
 *     tags: [Reviews]
 *     responses:
 *       200:
 *         description: Lista de avaliações
 */
const reviewSchema = z.object({
  stationId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
  tags: z.array(z.string()).default([]),
  authorName: z.string().min(2).max(100).optional(),
  userId: z.string().optional(),
});

router.get('/', async (_req, res, next) => {
  try {
    const reviews = await prisma.review.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        station: true,
        user: true,
      },
    });

    return res.json({ success: true, data: reviews });
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /api/reviews:
 *   post:
 *     summary: Cria uma avaliação
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [stationId, rating]
 *             properties:
 *               stationId:
 *                 type: string
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               comment:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Avaliação criada
 */
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const data = reviewSchema.parse(req.body);

    const station = await prisma.station.findUnique({
      where: { id: data.stationId },
    });

    if (!station) {
      return res.status(404).json({ success: false, message: 'Estação não encontrada.' });
    }

    const review = await prisma.review.create({
      data: {
        stationId: data.stationId,
        rating: data.rating,
        comment: data.comment,
        tags: data.tags,
        authorName: data.authorName ?? req.user?.email,
        userId: req.user?.id ?? data.userId,
      },
      include: {
        station: true,
        user: true,
      },
    });

    return res.status(201).json({ success: true, data: review });
  } catch (error) {
    return next(error);
  }
});

export { router as reviewRouter };
