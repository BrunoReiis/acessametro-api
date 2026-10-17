import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';

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
  name: z.string().trim().min(2).max(150),
  line: z.string().trim().min(1).max(80).optional(),
  zone: z.string().trim().min(1).max(50).optional(),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  accessibility: z.string().trim().max(500).nullable().optional(),
}).superRefine((station, context) => {
  const hasLatitude = station.latitude !== undefined;
  const hasLongitude = station.longitude !== undefined;

  if (hasLatitude !== hasLongitude) {
    context.addIssue({
      code: 'custom',
      path: [hasLatitude ? 'longitude' : 'latitude'],
      message: 'Latitude e longitude devem ser informadas juntas.',
    });
  }

  if (station.latitude === 0 && station.longitude === 0) {
    context.addIssue({
      code: 'custom',
      path: ['latitude'],
      message: 'As coordenadas 0,0 não representam uma estação válida.',
    });
  }
});

const importStationsSchema = z.object({
  stations: z.array(createStationSchema).min(1),
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

/**
 * @openapi
 * /api/stations/import:
 *   post:
 *     summary: Importa ou atualiza estações sem duplicar registros
 *     tags: [Stations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [stations]
 *             properties:
 *               stations:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [name]
 *                   properties:
 *                     name:
 *                       type: string
 *                     line:
 *                       type: string
 *                     zone:
 *                       type: string
 *                     latitude:
 *                       type: number
 *                     longitude:
 *                       type: number
 *                     accessibility:
 *                       type: string
 *     responses:
 *       201:
 *         description: Estações importadas
 */
router.post('/import', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { stations: requestedStations } = importStationsSchema.parse(req.body);
    const stationsByKey = new Map<string, z.infer<typeof createStationSchema>>();

    for (const station of requestedStations) {
      const key = stationIdentity(station.name, station.line);
      const accessibility = station.accessibility?.trim().toLowerCase() === 'consultar'
        ? null
        : station.accessibility;
      stationsByKey.set(key, { ...stationsByKey.get(key), ...station, accessibility });
    }

    const result = await prisma.$transaction(async (transaction) => {
      const existingStations = await transaction.station.findMany({
        orderBy: { createdAt: 'asc' },
      });
      const groupedStations = new Map<string, typeof existingStations>();

      for (const station of existingStations) {
        const key = stationIdentity(station.name, station.line ?? undefined);
        groupedStations.set(key, [...(groupedStations.get(key) ?? []), station]);
      }

      let created = 0;
      let updated = 0;
      let deduplicated = 0;

      for (const station of stationsByKey.values()) {
        const key = stationIdentity(station.name, station.line);
        const matches = groupedStations.get(key) ?? [];
        if (matches.length === 0) {
          const createdStation = await transaction.station.create({ data: station });
          groupedStations.set(key, [createdStation]);
          created += 1;
          continue;
        }

        const [primary, ...duplicates] = matches;
        for (const duplicate of duplicates) {
          await transaction.incident.updateMany({
            where: { stationId: duplicate.id },
            data: { stationId: primary.id },
          });
          await transaction.review.updateMany({
            where: { stationId: duplicate.id },
            data: { stationId: primary.id },
          });
          await transaction.station.delete({ where: { id: duplicate.id } });
          deduplicated += 1;
        }

        const updatedStation = await transaction.station.update({
          where: { id: primary.id },
          data: station,
        });
        groupedStations.set(key, [updatedStation]);
        updated += 1;
      }

      return { created, updated, deduplicated };
    });

    return res.status(200).json({
      success: true,
      data: { count: stationsByKey.size, ...result },
    });
  } catch (error) {
    return next(error);
  }
});

function stationIdentity(name: string, line?: string): string {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase('pt-BR');

  const normalizedName = normalize(name).replace(/^estacao\s+/, '');
  const normalizedLine = normalize(line ?? '')
    .replace(/^linha\s*/, '')
    .replace(/[^a-z0-9]/g, '');
  return `${normalizedName}|${normalizedLine}`;
}

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
