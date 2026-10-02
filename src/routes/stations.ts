import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';

const router = Router();

/**
 * @openapi
 * /api/stations:
 *   get:
 *     summary: Lista estações
 *     tags: [Stations]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de estações
 */
const stationQuerySchema = z.object({
  search: z.string().optional(),
});

const createStationSchema = z.object({
  name: z.string().min(2).max(150),
  line: z.string().min(1).max(80).optional(),
  zone: z.string().min(1).max(50).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accessibility: z.string().max(500).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const query = stationQuerySchema.parse(req.query);

    const stations = await prisma.station.findMany({
      where: query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { line: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { name: 'asc' },
    });

    return res.json({ success: true, data: stations });
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /api/stations:
 *   post:
 *     summary: Cria uma nova estação
 *     tags: [Stations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               line:
 *                 type: string
 *               zone:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               accessibility:
 *                 type: string
 *     responses:
 *       201:
 *         description: Estação criada
 */
router.post('/', async (req, res, next) => {
  try {
    const data = createStationSchema.parse(req.body);

    const station = await prisma.station.create({
      data,
    });

    return res.status(201).json({ success: true, data: station });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const station = await prisma.station.findUnique({
      where: { id: req.params.id },
      include: {
        incidents: true,
        reviews: true,
      },
    });

    if (!station) {
      return res.status(404).json({ success: false, message: 'Estação não encontrada.' });
    }

    return res.json({ success: true, data: station });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/reviews', async (req, res, next) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { stationId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });

    return res.json({ success: true, data: reviews });
  } catch (error) {
    return next(error);
  }
});

export { router as stationRouter };
